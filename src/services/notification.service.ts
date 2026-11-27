import axios from 'axios';
import logger from '../utils/logger';
import config from '../config';
import { HolidayRequest, ApprovalStatus, LeaveRequest, LeaveStatus } from '../types';
import { getLeaveRule } from '../config/leaveRules';
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

function buildRequestCancelledBlocks(
  request: HolidayRequest,
  cancelledByEmail: string,
  audience: 'owner-self' | 'owner-by-rrhh' | 'approver-pending' | 'approver-approved'
) {
  const detailsUrl = `${config.frontendUrl}/dashboard`;

  let headerEmoji = '🗑️';
  let headerText = '*Solicitud cancelada*';
  let contextText = '';

  switch (audience) {
    case 'owner-self':
      headerEmoji = '✅';
      headerText = '*Cancelaste tu solicitud de vacaciones*';
      contextText = `Tu solicitud del *${request.startDate}* al *${request.endDate}* fue cancelada.`;
      break;
    case 'owner-by-rrhh':
      headerEmoji = '⚠️';
      headerText = '*RRHH canceló tu solicitud de vacaciones*';
      contextText = `Tu solicitud del *${request.startDate}* al *${request.endDate}* fue cancelada por *${cancelledByEmail}*. Si tenés dudas, contactá a RRHH.`;
      break;
    case 'approver-pending':
      headerEmoji = '🗑️';
      headerText = '*Solicitud cancelada*';
      contextText = `La solicitud de *${request.employeeName}* fue cancelada. No tenés que hacer nada.`;
      break;
    case 'approver-approved':
      headerEmoji = '🗑️';
      headerText = '*Una solicitud que aprobaste fue cancelada*';
      contextText = `La solicitud de *${request.employeeName}* que ya habías aprobado fue cancelada por *${cancelledByEmail}*.`;
      break;
  }

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${headerEmoji} Solicitud Cancelada`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: headerText },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: contextText },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Empleado:*\n${request.employeeName}` },
        { type: 'mrkdwn', text: `*ID Solicitud:*\n\`${request.id}\`` },
        { type: 'mrkdwn', text: `*Período:*\n${request.startDate} al ${request.endDate}` },
        {
          type: 'mrkdwn',
          text: `*Días hábiles:*\n${request.totalDays} ${request.totalDays === 1 ? 'día' : 'días'}`,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '📄 Ver Detalles', emoji: true },
          url: detailsUrl,
          action_id: 'view_request',
        },
      ],
    },
  ];
}

function buildRequestCancelledText(
  request: HolidayRequest,
  cancelledByEmail: string,
  audience: 'owner-self' | 'owner-by-rrhh' | 'approver-pending' | 'approver-approved'
): string {
  const url = `${config.frontendUrl}/dashboard`;
  const period = `${request.startDate} - ${request.endDate}`;

  switch (audience) {
    case 'owner-self':
      return `✅ Cancelaste tu solicitud de vacaciones (${period}). Ver: ${url}`;
    case 'owner-by-rrhh':
      return `⚠️ RRHH (${cancelledByEmail}) canceló tu solicitud de vacaciones (${period}). Ver: ${url}`;
    case 'approver-pending':
      return `🗑️ La solicitud de ${request.employeeName} (${period}) fue cancelada. No tenés que hacer nada.`;
    case 'approver-approved':
      return `🗑️ La solicitud de ${request.employeeName} (${period}) que ya habías aprobado fue cancelada por ${cancelledByEmail}.`;
  }
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

  /**
   * Notify all parties of a cancellation (soft-delete).
   * - Employee: different copy depending on whether they cancelled themselves or RRHH did.
   * - currentApprover (if any): neutral "nothing to do".
   * - Any approver with status APPROVED: "a request you had approved was cancelled".
   * Fallback to webhook if every DM fails, matching the other notifications.
   */
  async notifyRequestCancelled(
    request: HolidayRequest,
    cancelledByEmail: string,
    cancelledByOwner: boolean
  ) {
    const results: Array<any> = [];

    // Employee
    try {
      const audience: 'owner-self' | 'owner-by-rrhh' = cancelledByOwner
        ? 'owner-self'
        : 'owner-by-rrhh';
      const text = buildRequestCancelledText(request, cancelledByEmail, audience);
      const blocks = buildRequestCancelledBlocks(request, cancelledByEmail, audience);
      const dmEmployee = await dmUserByEmail(request.employeeEmail, text, blocks);
      results.push({ to: request.employeeEmail, via: 'dm', result: dmEmployee });
    } catch (err) {
      logger.warn({ err }, 'Error sending cancellation DM to employee');
    }

    // Previously-approved approvers (if any). Deduplicated against currentApprover below.
    const approvedApprovers = [request.approver1, request.approver2, request.approver3].filter(
      (a) => a.email && a.status === ApprovalStatus.APPROVED
    );

    for (const approver of approvedApprovers) {
      try {
        const text = buildRequestCancelledText(request, cancelledByEmail, 'approver-approved');
        const blocks = buildRequestCancelledBlocks(
          request,
          cancelledByEmail,
          'approver-approved'
        );
        const dm = await dmUserByEmail(approver.email, text, blocks);
        results.push({ to: approver.email, via: 'dm', result: dm });
      } catch (err) {
        logger.warn({ err, approver: approver.email }, 'Error sending cancellation DM to approver');
      }
    }

    // currentApprover (the one who hadn't acted yet). Skip if already notified via approvedApprovers.
    if (
      request.currentApprover &&
      !approvedApprovers.some(
        (a) => a.email.toLowerCase() === request.currentApprover.toLowerCase()
      )
    ) {
      try {
        const text = buildRequestCancelledText(request, cancelledByEmail, 'approver-pending');
        const blocks = buildRequestCancelledBlocks(
          request,
          cancelledByEmail,
          'approver-pending'
        );
        const dm = await dmUserByEmail(request.currentApprover, text, blocks);
        results.push({ to: request.currentApprover, via: 'dm', result: dm });
      } catch (err) {
        logger.warn(
          { err, approver: request.currentApprover },
          'Error sending cancellation DM to current approver'
        );
      }
    }

    const anyDmOk = results.some((r) => r.result && r.result.ok);
    if (!anyDmOk) {
      const fallbackText = buildRequestCancelledText(
        request,
        cancelledByEmail,
        cancelledByOwner ? 'owner-self' : 'owner-by-rrhh'
      );
      const fallbackBlocks = buildRequestCancelledBlocks(
        request,
        cancelledByEmail,
        cancelledByOwner ? 'owner-self' : 'owner-by-rrhh'
      );
      return postToWebhook({ text: fallbackText, blocks: fallbackBlocks });
    }

    return { ok: true, details: results };
  },

  // ==================== LEAVES NOTIFICATIONS ====================

  /**
   * Notifica la creación de una licencia: DM al empleado y DM a cada RR. HH.
   */
  async notifyLeaveCreated(leave: LeaveRequest, hrApprovers: string[]) {
    const rule = getLeaveRule(leave.leaveType);
    const typeName = rule?.name || leave.leaveType;
    const url = `${config.frontendUrl}/dashboard`;

    const employeeText = `📝 Registramos tu solicitud de *${typeName}* del *${leave.startDate}* al *${leave.endDate}* (${leave.days} ${leave.unit}). Quedó pendiente de aprobación de RR. HH.`;
    const hrText = `🟡 Nueva licencia de *${leave.employeeName}*: *${typeName}* del *${leave.startDate}* al *${leave.endDate}* (${leave.days} ${leave.unit}). ID: \`${leave.id}\`. Revisar: ${url}`;

    const results: any[] = [];

    try {
      const r = await dmUserByEmail(leave.employeeEmail, employeeText);
      results.push({ to: leave.employeeEmail, via: 'dm', result: r });
    } catch (err) {
      logger.warn({ err, leaveId: leave.id }, 'Error sending leave-created DM to employee');
    }

    for (const hr of hrApprovers) {
      try {
        const r = await dmUserByEmail(hr, hrText);
        results.push({ to: hr, via: 'dm', result: r });
      } catch (err) {
        logger.warn({ err, hr, leaveId: leave.id }, 'Error sending leave-created DM to HR');
      }
    }

    const anyDmOk = results.some((r) => r.result?.ok);
    if (!anyDmOk) {
      return postToWebhook({ text: hrText });
    }
    return { ok: true, details: results };
  },

  /**
   * Notifica al empleado el resultado (APPROVED o REJECTED).
   */
  async notifyLeaveDecided(leave: LeaveRequest, decidedBy: string) {
    const rule = getLeaveRule(leave.leaveType);
    const typeName = rule?.name || leave.leaveType;
    const url = `${config.frontendUrl}/dashboard`;

    let text: string;
    if (leave.status === LeaveStatus.APPROVED) {
      text = `✅ Tu licencia de *${typeName}* del *${leave.startDate}* al *${leave.endDate}* fue aprobada por *${decidedBy}*. Ver: ${url}`;
    } else if (leave.status === LeaveStatus.REJECTED) {
      const reason = leave.rejectionReason ? `\nMotivo: _${leave.rejectionReason}_` : '';
      text = `❌ Tu licencia de *${typeName}* del *${leave.startDate}* al *${leave.endDate}* fue rechazada por *${decidedBy}*.${reason}`;
    } else {
      text = `🔄 Tu licencia de *${typeName}* cambió al estado ${leave.status}`;
    }

    try {
      const r = await dmUserByEmail(leave.employeeEmail, text);
      if (!r?.ok) {
        return postToWebhook({ text });
      }
      return { ok: true };
    } catch (err) {
      logger.warn({ err, leaveId: leave.id }, 'Error sending leave-decided DM');
      return postToWebhook({ text });
    }
  },

  /**
   * Notifica a RR. HH. cuando se cancela una licencia.
   */
  async notifyLeaveCancelled(leave: LeaveRequest, cancelledBy: string, hrApprovers: string[]) {
    const rule = getLeaveRule(leave.leaveType);
    const typeName = rule?.name || leave.leaveType;
    const cancelledByOwner =
      leave.employeeEmail.toLowerCase() === cancelledBy.toLowerCase();

    const employeeText = cancelledByOwner
      ? `✅ Cancelaste tu licencia de *${typeName}* (${leave.startDate} - ${leave.endDate}).`
      : `⚠️ RR. HH. (*${cancelledBy}*) canceló tu licencia de *${typeName}* (${leave.startDate} - ${leave.endDate}).`;

    const hrText = `🗑️ Licencia cancelada: *${leave.employeeName}* — *${typeName}* (${leave.startDate} - ${leave.endDate}). Cancelada por *${cancelledBy}*. ID: \`${leave.id}\``;

    const results: any[] = [];

    try {
      const r = await dmUserByEmail(leave.employeeEmail, employeeText);
      results.push({ to: leave.employeeEmail, via: 'dm', result: r });
    } catch (err) {
      logger.warn({ err, leaveId: leave.id }, 'Error sending leave-cancelled DM to employee');
    }

    for (const hr of hrApprovers) {
      // Evitar doble-DM si el que canceló es RR. HH.
      if (hr.toLowerCase() === cancelledBy.toLowerCase()) continue;
      try {
        const r = await dmUserByEmail(hr, hrText);
        results.push({ to: hr, via: 'dm', result: r });
      } catch (err) {
        logger.warn({ err, hr, leaveId: leave.id }, 'Error sending leave-cancelled DM to HR');
      }
    }

    const anyDmOk = results.some((r) => r.result?.ok);
    if (!anyDmOk) {
      return postToWebhook({ text: hrText });
    }
    return { ok: true, details: results };
  },
};
