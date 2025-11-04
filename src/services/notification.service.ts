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

async function dmUserByEmail(email: string, text: string, blocks?: any[]) {
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

    await slackClient.chat.postMessage({
      channel,
      text,
      blocks: blocks || undefined,
      unfurl_links: false,
      unfurl_media: false,
    });
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

function buildRequestCreatedBlocks(request: HolidayRequest, forApprover: boolean = false) {
  const detailsUrl = forApprover
    ? `${config.frontendUrl}/dashboard/approvals`
    : `${config.frontendUrl}/dashboard`;

  const headerText = forApprover
    ? '🟡 *Nueva solicitud de vacaciones requiere tu aprobación*'
    : '✅ *Tu solicitud de vacaciones ha sido creada*';

  const contextText = forApprover
    ? `Tienes una solicitud de vacaciones pendiente de aprobación de *${request.employeeName}*.`
    : `Tu solicitud ha sido enviada exitosamente y está siendo revisada por *${request.currentApprover}*.`;

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: forApprover ? '📋 Solicitud Pendiente de Aprobación' : '📝 Solicitud Creada',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: headerText,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: contextText,
      },
    },
    {
      type: 'divider',
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Empleado:*\n${request.employeeName}`,
        },
        {
          type: 'mrkdwn',
          text: `*ID Solicitud:*\n\`${request.id}\``,
        },
        {
          type: 'mrkdwn',
          text: `*Período:*\n${request.startDate} al ${request.endDate}`,
        },
        {
          type: 'mrkdwn',
          text: `*Días hábiles:*\n${request.totalDays} ${request.totalDays === 1 ? 'día' : 'días'}`,
        },
      ],
    },
    {
      type: 'divider',
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: forApprover ? '👀 Revisar' : '📄 Ver Detalles',
            emoji: true,
          },
          style: forApprover ? 'primary' : undefined,
          url: detailsUrl,
          action_id: 'view_request',
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: forApprover
            ? '💡 Haz clic en el botón para revisar y aprobar/rechazar esta solicitud.'
            : '⏳ Te notificaremos cuando tu solicitud sea revisada.',
        },
      ],
    },
  ];
}

function buildRequestCreatedText(request: HolidayRequest, forApprover: boolean = false) {
  if (forApprover) {
    return `🟡 Nueva solicitud de vacaciones de ${request.employeeName} (${request.startDate} - ${request.endDate}, ${request.totalDays} días). Ver: ${config.frontendUrl}/dashboard/approvals`;
  }
  return `✅ Tu solicitud de vacaciones ha sido creada (${request.startDate} - ${request.endDate}, ${request.totalDays} días). Estado: Pendiente de aprobación por ${request.currentApprover}. Ver: ${config.frontendUrl}/dashboard`;
}

function buildRequestUpdatedBlocks(
  request: HolidayRequest,
  action: string,
  performedBy?: string,
  forApprover: boolean = false
) {
  const detailsUrl = forApprover
    ? `${config.frontendUrl}/dashboard/approvals`
    : `${config.frontendUrl}/dashboard`;

  // Determine status emoji and color
  let statusEmoji = '🔄';
  let statusText = action;
  let headerEmoji = '📝';
  let buttonStyle: 'primary' | 'danger' | undefined = undefined;

  if (action === 'Aprobado' && !request.currentApprover) {
    statusEmoji = '✅';
    statusText = '¡aprobada completamente!';
    headerEmoji = '🎉';
  } else if (action === 'Aprobado' && request.currentApprover) {
    statusEmoji = '✅';
    statusText = 'aprobada (Siguiente nivel)';
    headerEmoji = '👍';
    buttonStyle = 'primary';
  } else if (action === 'Rechazado') {
    statusEmoji = '❌';
    statusText = 'rechazada';
    headerEmoji = '🚫';
    buttonStyle = 'danger';
  }

  const headerText = forApprover
    ? `${statusEmoji} *Solicitud requiere tu aprobación*`
    : `${statusEmoji} *Tu solicitud ha sido ${statusText.toLowerCase()}*`;

  const contextText = forApprover
    ? `La solicitud de *${request.employeeName}* fue aprobada por ${performedBy || 'un aprobador'} y ahora requiere tu revisión.`
    : performedBy
      ? `Tu solicitud fue ${statusText.toLowerCase()} por *${performedBy}*.`
      : `Tu solicitud ha sido ${statusText.toLowerCase()}.`;

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${headerEmoji} Actualización de Solicitud`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: headerText,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: contextText,
      },
    },
    {
      type: 'divider',
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Empleado:*\n${request.employeeName}`,
        },
        {
          type: 'mrkdwn',
          text: `*ID Solicitud:*\n\`${request.id}\``,
        },
        {
          type: 'mrkdwn',
          text: `*Período:*\n${request.startDate} al ${request.endDate}`,
        },
        {
          type: 'mrkdwn',
          text: `*Días hábiles:*\n${request.totalDays} ${request.totalDays === 1 ? 'día' : 'días'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Estado:*\n${statusEmoji} ${statusText}`,
        },
        {
          type: 'mrkdwn',
          text: performedBy ? `*Acción por:*\n${performedBy}` : ' ',
        },
      ],
    },
  ];

  // Add next approver info if applicable
  if (request.currentApprover && !forApprover) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⏳ *Siguiente aprobador:* ${request.currentApprover}`,
      },
    });
  }

  blocks.push({
    type: 'divider',
  });

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: forApprover ? '👀 Revisar Solicitud' : '📄 Ver Detalles',
          emoji: true,
        },
        style: buttonStyle,
        url: detailsUrl,
        action_id: 'view_request',
      },
    ],
  });

  // Context message based on status
  let contextMessage = '📄 Haz clic en el botón para ver los detalles completos.';
  if (forApprover) {
    contextMessage = '💡 Haz clic en el botón para revisar y aprobar/rechazar esta solicitud.';
  } else if (action === 'Rechazado') {
    contextMessage = '❌ Si tienes dudas, contacta a tu aprobador o RRHH.';
  } else if (!request.currentApprover) {
    contextMessage = '🎉 ¡Tu solicitud ha sido aprobada completamente! Disfruta tus vacaciones.';
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: contextMessage,
      },
    ],
  });

  return blocks;
}

function buildRequestUpdatedText(request: HolidayRequest, action: string, performedBy?: string) {
  const detailsUrl = `${config.frontendUrl}/dashboard`;
  const statusEmoji = action === 'Aprobado' ? '✅' : action === 'Rechazado' ? '❌' : '🔄';

  const base = `${statusEmoji} Solicitud ${action}: ${request.employeeName} (${request.startDate} - ${request.endDate}, ${request.totalDays} días)`;
  const byLine = performedBy ? ` por ${performedBy}` : '';
  const next = request.currentApprover
    ? `. Siguiente aprobador: ${request.currentApprover}`
    : `. Estado final: ${request.status}`;

  return `${base}${byLine}${next}. Ver: ${detailsUrl}`;
}

export default {
  async notifyRequestCreated(request: HolidayRequest) {
    const results: Array<any> = [];

    // Notify employee (creator) with confirmation message
    try {
      const employeeText = buildRequestCreatedText(request, false);
      const employeeBlocks = buildRequestCreatedBlocks(request, false);
      const dmEmployee = await dmUserByEmail(request.employeeEmail, employeeText, employeeBlocks);
      results.push({ to: request.employeeEmail, via: 'dm', result: dmEmployee });
    } catch (err) {
      logger.warn({ err }, 'Error sending DM to creator');
    }

    // Notify current approver with action required message
    if (request.currentApprover) {
      try {
        const approverText = buildRequestCreatedText(request, true);
        const approverBlocks = buildRequestCreatedBlocks(request, true);
        const dmApprover = await dmUserByEmail(
          request.currentApprover,
          approverText,
          approverBlocks
        );
        results.push({ to: request.currentApprover, via: 'dm', result: dmApprover });
      } catch (err) {
        logger.warn({ err }, 'Error sending DM to current approver');
      }
    }

    // If no bot or DMs failed, fallback to posting to webhook channel
    const anyDmOk = results.some((r) => r.result && r.result.ok);
    if (!anyDmOk) {
      const fallbackText = buildRequestCreatedText(request, false);
      const fallbackBlocks = buildRequestCreatedBlocks(request, false);
      const payload = {
        text: fallbackText,
        blocks: fallbackBlocks,
      };
      return postToWebhook(payload);
    }

    return { ok: true, details: results };
  },

  async notifyRequestUpdated(request: HolidayRequest, action: string, performedBy?: string) {
    const results: Array<any> = [];

    // Notify employee (creator) about the update
    try {
      const employeeText = buildRequestUpdatedText(request, action, performedBy);
      const employeeBlocks = buildRequestUpdatedBlocks(request, action, performedBy, false);
      const dmEmployee = await dmUserByEmail(request.employeeEmail, employeeText, employeeBlocks);
      results.push({ to: request.employeeEmail, via: 'dm', result: dmEmployee });
    } catch (err) {
      logger.warn({ err }, 'Error sending DM to creator');
    }

    // If there's a next approver, notify them with action required message
    if (request.currentApprover) {
      try {
        const approverText = buildRequestUpdatedText(request, action, performedBy);
        const approverBlocks = buildRequestUpdatedBlocks(request, action, performedBy, true);
        const dmApprover = await dmUserByEmail(
          request.currentApprover,
          approverText,
          approverBlocks
        );
        results.push({ to: request.currentApprover, via: 'dm', result: dmApprover });
      } catch (err) {
        logger.warn({ err }, 'Error sending DM to next approver');
      }
    }

    const anyDmOk = results.some((r) => r.result && r.result.ok);
    if (!anyDmOk) {
      const fallbackText = buildRequestUpdatedText(request, action, performedBy);
      const fallbackBlocks = buildRequestUpdatedBlocks(request, action, performedBy, false);
      const payload = {
        text: fallbackText,
        blocks: fallbackBlocks,
      };
      return postToWebhook(payload);
    }

    return { ok: true, details: results };
  },
};
