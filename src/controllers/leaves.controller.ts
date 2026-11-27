import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import leavesService from '../services/leaves.service';
import notificationService from '../services/notification.service';
import logger from '../utils/logger';
import {
  CreateLeaveRequestInput,
  LeaveError,
  LeaveErrorCode,
  LeaveStatus,
  LeaveRequest,
} from '../types';

/**
 * Mapping code → HTTP status para errores de licencias.
 */
const LEAVE_CODE_TO_HTTP: Record<LeaveErrorCode, number> = {
  [LeaveErrorCode.NOT_FOUND]: 404,
  [LeaveErrorCode.NOT_PENDING]: 409,
  [LeaveErrorCode.ALREADY_STARTED]: 409,
  [LeaveErrorCode.NOT_OWNER]: 403,
  [LeaveErrorCode.NOT_HR]: 403,
  [LeaveErrorCode.INVALID_TYPE]: 400,
  [LeaveErrorCode.INVALID_DATE_RANGE]: 400,
  [LeaveErrorCode.INVALID_DAYS]: 400,
  [LeaveErrorCode.MISSING_CERTIFICATE]: 400,
  [LeaveErrorCode.ANNUAL_CAP_EXCEEDED]: 409,
  [LeaveErrorCode.MISSING_BUSINESS_DAY]: 400,
  [LeaveErrorCode.OVERLAP]: 409,
  [LeaveErrorCode.EMPLOYEE_NOT_FOUND]: 404,
  [LeaveErrorCode.MISSING_REJECTION_REASON]: 400,
  [LeaveErrorCode.MISSING_CANCELLED_BY]: 400,
  [LeaveErrorCode.MISSING_HR_EMAIL]: 400,
};

function handleLeaveError(error: unknown, res: Response, context: object): void {
  if (error instanceof LeaveError) {
    const status = LEAVE_CODE_TO_HTTP[error.code] || 400;
    logger.info({ ...context, code: error.code }, 'Leave operation refused by business rule');
    res.status(status).json({ error: error.message, code: error.code });
    return;
  }
  logger.error({ error, ...context }, 'Unexpected error in leaves endpoint');
  res.status(500).json({ error: 'Internal server error' });
}

/**
 * GET /api/leaves/types
 * Devuelve la lista de tipos de licencia con sus reglas.
 */
export async function listLeaveTypes(_req: AuthenticatedRequest, res: Response): Promise<void> {
  res.json({ types: leavesService.listTypes() });
}

/**
 * POST /api/leaves
 * Crea una licencia. JWT usa el email del token; API key puede enviar employeeEmail.
 */
export async function createLeave(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userEmail = req.user?.email;
  if (!userEmail) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  let targetEmail = userEmail;
  if (req.user?.isApiKey && req.body.employeeEmail) {
    targetEmail = req.body.employeeEmail;
  }

  const input: CreateLeaveRequestInput = {
    leaveType: req.body.leaveType,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    reason: req.body.reason,
    certificateUrl: req.body.certificateUrl,
    source: req.body.source || (req.user?.isApiKey ? 'api' : 'web'),
  };

  try {
    const leave = await leavesService.createLeave(targetEmail, input);

    notificationService
      .notifyLeaveCreated(leave, leavesService.getHRApprovers())
      .catch((err) =>
        logger.error({ err, leaveId: leave.id }, 'Failed to send leave-created notification')
      );

    res.status(201).json(leave);
  } catch (error) {
    handleLeaveError(error, res, { user: userEmail, target: targetEmail });
  }
}

/**
 * GET /api/leaves/me
 */
export async function getMyLeaves(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userEmail = req.user?.email;
  if (!userEmail) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  // Con API key, se puede filtrar por employeeEmail en query
  const target =
    req.user?.isApiKey && typeof req.query.employeeEmail === 'string'
      ? req.query.employeeEmail
      : userEmail;

  try {
    const leaves = await leavesService.getMy(target);
    res.json(leaves);
  } catch (error) {
    logger.error({ error, user: userEmail }, 'Error retrieving my leaves');
    res.status(500).json({ error: 'Failed to retrieve leaves' });
  }
}

/**
 * GET /api/leaves/all
 * RR. HH. o API key.
 */
export async function getAllLeaves(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userEmail = req.user?.email;
  if (!userEmail) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  if (!req.user?.isApiKey && !leavesService.isHRApprover(userEmail)) {
    res.status(403).json({ error: 'Solo RR. HH. puede ver todas las licencias' });
    return;
  }

  try {
    const leaves = await leavesService.getAll();
    res.json(leaves);
  } catch (error) {
    logger.error({ error, user: userEmail }, 'Error retrieving all leaves');
    res.status(500).json({ error: 'Failed to retrieve leaves' });
  }
}

/**
 * GET /api/leaves/pending
 * Devuelve las PENDING.
 */
export async function getPendingLeaves(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userEmail = req.user?.email;
  if (!userEmail) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  if (!req.user?.isApiKey && !leavesService.isHRApprover(userEmail)) {
    res.status(403).json({ error: 'Solo RR. HH. puede ver licencias pendientes' });
    return;
  }

  try {
    const leaves = await leavesService.getPendingForHR();
    res.json(leaves);
  } catch (error) {
    logger.error({ error, user: userEmail }, 'Error retrieving pending leaves');
    res.status(500).json({ error: 'Failed to retrieve pending leaves' });
  }
}

/**
 * GET /api/leaves/:id
 */
export async function getLeaveById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userEmail = req.user?.email;
  const { id } = req.params;
  if (!userEmail) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const leave = await leavesService.getById(id);
    if (!leave) {
      res.status(404).json({ error: 'Licencia no encontrada', code: LeaveErrorCode.NOT_FOUND });
      return;
    }

    const isOwner = leave.employeeEmail.toLowerCase() === userEmail.toLowerCase();
    const isHR = leavesService.isHRApprover(userEmail);
    if (!req.user?.isApiKey && !isOwner && !isHR) {
      res.status(403).json({ error: 'No autorizado para ver esta licencia' });
      return;
    }

    res.json(leave);
  } catch (error) {
    logger.error({ error, user: userEmail, leaveId: id }, 'Error retrieving leave');
    res.status(500).json({ error: 'Failed to retrieve leave' });
  }
}

/**
 * Resuelve el email del actor RR. HH.:
 *  - JWT humano: usa el email del token
 *  - API key: toma hrApproverEmail del body (obligatorio)
 */
function resolveHRActor(req: AuthenticatedRequest): string | null {
  if (req.user?.isApiKey) {
    const raw = typeof req.body?.hrApproverEmail === 'string' ? req.body.hrApproverEmail.trim() : '';
    return raw || null;
  }
  return req.user?.email || null;
}

/**
 * PUT /api/leaves/:id/approve
 */
export async function approveLeave(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userEmail = req.user?.email;
  const { id } = req.params;
  if (!userEmail) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  const hrEmail = resolveHRActor(req);
  if (!hrEmail) {
    res.status(400).json({
      error: 'Falta hrApproverEmail en el body',
      code: LeaveErrorCode.MISSING_HR_EMAIL,
    });
    return;
  }

  try {
    const updated = await leavesService.approveLeave(id, hrEmail);
    notificationService
      .notifyLeaveDecided(updated, hrEmail)
      .catch((err) => logger.error({ err, leaveId: id }, 'Failed to send approval DM'));
    res.json(updated);
  } catch (error) {
    handleLeaveError(error, res, { user: userEmail, leaveId: id, action: 'approve' });
  }
}

/**
 * PUT /api/leaves/:id/reject
 */
export async function rejectLeave(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userEmail = req.user?.email;
  const { id } = req.params;
  if (!userEmail) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  const hrEmail = resolveHRActor(req);
  if (!hrEmail) {
    res.status(400).json({
      error: 'Falta hrApproverEmail en el body',
      code: LeaveErrorCode.MISSING_HR_EMAIL,
    });
    return;
  }

  const reason: string = typeof req.body?.reason === 'string' ? req.body.reason : '';

  try {
    const updated = await leavesService.rejectLeave(id, hrEmail, reason);
    notificationService
      .notifyLeaveDecided(updated, hrEmail)
      .catch((err) => logger.error({ err, leaveId: id }, 'Failed to send rejection DM'));
    res.json(updated);
  } catch (error) {
    handleLeaveError(error, res, { user: userEmail, leaveId: id, action: 'reject' });
  }
}

/**
 * PUT /api/leaves/:id/cancel
 * JWT: actor = email del token. API key: actor = body.cancelledBy (obligatorio).
 */
export async function cancelLeave(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userEmail = req.user?.email;
  const { id } = req.params;
  if (!userEmail) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  let actorEmail: string;
  if (req.user?.isApiKey) {
    const raw =
      typeof req.body?.cancelledBy === 'string' ? req.body.cancelledBy.trim() : '';
    if (!raw) {
      res.status(400).json({
        error: 'Falta cancelledBy en el body',
        code: LeaveErrorCode.MISSING_CANCELLED_BY,
      });
      return;
    }
    actorEmail = raw;
  } else {
    actorEmail = userEmail;
  }

  try {
    const cancelled: LeaveRequest = await leavesService.cancelLeave(id, actorEmail);
    notificationService
      .notifyLeaveCancelled(cancelled, actorEmail, leavesService.getHRApprovers())
      .catch((err) => logger.error({ err, leaveId: id }, 'Failed to send cancellation DM'));
    res.status(200).json(cancelled);
  } catch (error) {
    handleLeaveError(error, res, { user: userEmail, actor: actorEmail, leaveId: id });
  }
}

// Export para que TS no se queje de imports no usados si alguno no se enruta.
export { LeaveStatus };
