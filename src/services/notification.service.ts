import axios from 'axios';
import logger from '../utils/logger';
import config from '../config';
import { HolidayRequest } from '../types';
import { WebClient } from '@slack/web-api';

// Slack WebClient (optional)
const slackClient = config.slackBotToken ? new WebClient(config.slackBotToken) : null;

// Simple in-memory cache for email -> slack user id
const emailToSlackId = new Map<string, string>();

async function postToWebhook(payload: any) {
  const url = config.slackWebhookUrl;
  if (!url) {
    logger.warn(
      '[notification] SLACK_WEBHOOK_URL not configured — skipping Slack webhook notification'
    );
    return { ok: false, reason: 'no-webhook' };
  }

  try {
    const res = await axios.post(url, payload, { timeout: 5000 });
    return { ok: true, status: res.status };
  } catch (err) {
    logger.error({ err }, '[notification] failed to send Slack webhook');
    return { ok: false, reason: err };
  }
}

async function getSlackUserIdByEmail(email: string): Promise<string | null> {
  const key = email.toLowerCase();
  if (emailToSlackId.has(key)) return emailToSlackId.get(key)!;

  if (!slackClient) return null;

  try {
    const resp = await slackClient.users.lookupByEmail({ email });
    const id = resp.user?.id || null;
    if (id) emailToSlackId.set(key, id);
    return id;
  } catch (err) {
    // Detect common token-type error and give actionable guidance
    const slackErr = (err as any)?.data || (err as any)?.error || null;
    if (slackErr && slackErr.error === 'not_allowed_token_type') {
      logger.error(
        { err, email },
        'Slack API error: token type not allowed for users.lookupByEmail.\n' +
          "Make sure SLACK_BOT_TOKEN is a Bot User OAuth Token (starts with 'xoxb-') and that the app is installed to the workspace with the scopes: users:read.email, chat:write, conversations:write (or im:write).\n" +
          'If you only have an app-level token (xapp-...) or an incoming-webhook, users.lookupByEmail will fail with this error. Reinstall the app with the correct bot scopes and use the Bot User OAuth Token as SLACK_BOT_TOKEN.'
      );
      return null;
    }

    logger.warn({ err, email }, "Couldn't find Slack user by email");
    return null;
  }
}

async function dmUserByEmail(email: string, text: string) {
  if (!slackClient) {
    logger.debug('[notification] No slack bot token configured, skipping DM');
    return { ok: false, reason: 'no-bot' };
  }

  const userId = await getSlackUserIdByEmail(email);
  if (!userId) return { ok: false, reason: 'no-user' };

  try {
    // Open (or reuse) a conversation with the user
    const conv = await slackClient.conversations.open({ users: userId });
    const channel = conv.channel?.id;
    if (!channel) throw new Error('No DM channel opened');

    await slackClient.chat.postMessage({ channel, text });
    return { ok: true };
  } catch (err) {
    // If the token cannot be used for chat.postMessage, detect and log specific guidance
    const slackErr = (err as any)?.data || (err as any)?.error || null;
    if (slackErr && slackErr.error === 'not_allowed_token_type') {
      logger.error(
        { err, email },
        'Slack API error: not_allowed_token_type when sending DM. Ensure SLACK_BOT_TOKEN is a Bot User OAuth Token (xoxb-...) with chat:write and conversations:write (or im:write) scopes.'
      );
      return { ok: false, reason: 'not_allowed_token_type' };
    }

    logger.error({ err, email }, 'Failed to send DM via Slack Web API');
    return { ok: false, reason: err };
  }
}

function buildRequestCreatedText(request: HolidayRequest) {
  return `*Nueva solicitud de vacaciones*\n*ID:* ${request.id}\n*Empleado:* ${request.employeeName} (${request.employeeEmail})\n*Fechas:* ${request.startDate} - ${request.endDate}\n*Días hábiles:* ${request.totalDays}\n*Estado:* ${request.status}\n*Próximo aprobador:* ${request.currentApprover || '—'}`;
}

function buildRequestUpdatedText(request: HolidayRequest, action: string, performedBy?: string) {
  const base = `*Solicitud actualizada*\n*ID:* ${request.id}\n*Empleado:* ${request.employeeName} (${request.employeeEmail})\n*Fechas:* ${request.startDate} - ${request.endDate}\n*Días hábiles:* ${request.totalDays}`;
  const actionLine = action ? `\n*Acción:* ${action}` : '';
  const byLine = performedBy ? `\n*Realizado por:* ${performedBy}` : '';
  const next = request.currentApprover
    ? `\n*Siguiente aprobador:* ${request.currentApprover}`
    : '\n*Estado final:* ' + request.status;

  return `${base}${actionLine}${byLine}${next}`;
}

export default {
  async notifyRequestCreated(request: HolidayRequest) {
    const text = buildRequestCreatedText(request);

    // Try DM to employee
    const results: Array<any> = [];
    try {
      const dmEmployee = await dmUserByEmail(request.employeeEmail, text);
      results.push({ to: request.employeeEmail, via: 'dm', result: dmEmployee });
    } catch (err) {
      logger.warn({ err }, 'Error sending DM to creator');
    }

    // Try DM to current approver
    if (request.currentApprover) {
      try {
        const dmApprover = await dmUserByEmail(request.currentApprover, text);
        results.push({ to: request.currentApprover, via: 'dm', result: dmApprover });
      } catch (err) {
        logger.warn({ err }, 'Error sending DM to current approver');
      }
    }

    // If no bot or DMs failed, fallback to posting to webhook channel
    const anyDmOk = results.some((r) => r.result && r.result.ok);
    if (!anyDmOk) {
      const payload = { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
      return postToWebhook(payload);
    }

    return { ok: true, details: results };
  },

  async notifyRequestUpdated(request: HolidayRequest, action: string, performedBy?: string) {
    const text = buildRequestUpdatedText(request, action, performedBy);

    const results: Array<any> = [];
    try {
      const dmEmployee = await dmUserByEmail(request.employeeEmail, text);
      results.push({ to: request.employeeEmail, via: 'dm', result: dmEmployee });
    } catch (err) {
      logger.warn({ err }, 'Error sending DM to creator');
    }

    // If there's a next approver, notify them
    if (request.currentApprover) {
      try {
        const dmApprover = await dmUserByEmail(request.currentApprover, text);
        results.push({ to: request.currentApprover, via: 'dm', result: dmApprover });
      } catch (err) {
        logger.warn({ err }, 'Error sending DM to next approver');
      }
    }

    const anyDmOk = results.some((r) => r.result && r.result.ok);
    if (!anyDmOk) {
      const payload = { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
      return postToWebhook(payload);
    }

    return { ok: true, details: results };
  },
};
