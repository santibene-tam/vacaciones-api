import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import requestsService from '../services/requests.service';
import logger from '../utils/logger';
import notificationService from '../services/notification.service';
import {
  CreateHolidayRequestInput,
  ApprovalAction,
  RequestStatus,
  CancelErrorCode,
  CancelRequestError,
} from '../types';
import { parseDate } from '../utils/dateUtils';

/**
 * Map a cancellation error code to its HTTP status.
 * Kept here (not in the service) because the service is transport-agnostic.
 */
const CANCEL_CODE_TO_HTTP: Record<CancelErrorCode, number> = {
  [CancelErrorCode.NOT_FOUND]: 404,
  [CancelErrorCode.NOT_PENDING]: 409,
  [CancelErrorCode.ALREADY_STARTED]: 409,
  [CancelErrorCode.NOT_OWNER]: 403,
  [CancelErrorCode.HAS_PARTIAL_APPROVAL]: 403,
  [CancelErrorCode.MISSING_CANCELLED_BY]: 400,
};

/**
 * POST /requests
 * Create a new holiday request
 * For API keys: can specify employeeEmail in the body to create on behalf of any employee
 * For regular users: creates request for themselves
 */
export async function createRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const input: CreateHolidayRequestInput = req.body;

    if (!input.startDate || !input.endDate) {
      res.status(400).json({ error: 'Start date and end date are required' });
      return;
    }

    // API keys can create requests on behalf of any employee
    // Regular users can only create requests for themselves
    let targetEmail = userEmail;
    if (req.user?.isApiKey && req.body.employeeEmail) {
      targetEmail = req.body.employeeEmail;
      logger.info({ apiKey: true, targetEmail }, 'API key creating request on behalf of employee');
    }

    const request = await requestsService.createRequest(targetEmail, input);

    logger.info({ requestId: request.id, employee: userEmail }, 'Holiday request created via API');
    // Notify (fire-and-forget) — not blocking the response
    notificationService
      .notifyRequestCreated(request)
      .catch((err) =>
        logger.error({ err, requestId: request.id }, 'Failed to send create notification')
      );

    res.status(201).json(request);
  } catch (error: any) {
    logger.error({ error, user: req.user?.email }, 'Error creating holiday request');
    res.status(400).json({ error: error.message || 'Failed to create holiday request' });
  }
}

/**
 * GET /requests/me
 * Get all requests for the authenticated user
 */
export async function getMyRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const requests = await requestsService.getRequestsByEmployee(userEmail);

    // Ordenar por createdAt descendente (más recientes primero)
    requests.sort((a: any, b: any) => {
      const ta = +new Date(a.createdAt) || 0;
      const tb = +new Date(b.createdAt) || 0;
      return tb - ta;
    });

    logger.info({ employee: userEmail, count: requests.length }, 'Retrieved employee requests');
    res.json(requests);
  } catch (error) {
    logger.error({ error, user: req.user?.email }, 'Error retrieving employee requests');
    res.status(500).json({ error: 'Failed to retrieve requests' });
  }
}

/**
 * GET /requests/pending
 * Get pending requests where the user is the current approver
 */
export async function getPendingRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const requests = await requestsService.getPendingRequestsForApprover(userEmail);

    logger.info(
      { approver: userEmail, count: requests.length },
      'Retrieved pending requests for approver'
    );
    res.json(requests);
  } catch (error) {
    logger.error({ error, user: req.user?.email }, 'Error retrieving pending requests');
    res.status(500).json({ error: 'Failed to retrieve pending requests' });
  }
}

/**
 * GET /requests
 * Get all requests (RRHH only)
 */
export async function getAllRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // API keys have full access to all requests
    if (req.user?.isApiKey) {
      const requests = await requestsService.getAllRequests();
      logger.info({ apiKey: true, count: requests.length }, 'API key retrieved all requests');
      res.json(requests);
      return;
    }

    // TODO -> Check if user is RRHH
    // const isRRHH = await googleSheetsService.isRRHH(userEmail);
    // if (!isRRHH) {
    //   res.status(403).json({ error: 'Only RRHH can view all requests' });
    //   return;
    // }

    const requests = await requestsService.getAllRequests();

    logger.info({ rrhh: userEmail, count: requests.length }, 'RRHH retrieved all requests');
    res.json(requests);
  } catch (error) {
    logger.error({ error, user: req.user?.email }, 'Error retrieving all requests');
    res.status(500).json({ error: 'Failed to retrieve requests' });
  }
}

/**
 * GET /requests/:id
 * Get a specific request by ID
 */
export async function getRequestById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;
    const { id } = req.params;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const request = await requestsService.getRequestById(id);

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    // API keys have full access to all requests
    if (req.user?.isApiKey) {
      logger.info({ requestId: id, apiKey: true }, 'API key retrieved request');
      res.json(request);
      return;
    }

    // Check if user can view this request
    const canView = await requestsService.canUserViewRequest(userEmail, request);

    if (!canView) {
      res.status(403).json({ error: 'You are not authorized to view this request' });
      return;
    }

    logger.info({ requestId: id, user: userEmail }, 'Retrieved request');
    res.json(request);
  } catch (error) {
    logger.error(
      { error, user: req.user?.email, requestId: req.params.id },
      'Error retrieving request'
    );
    res.status(500).json({ error: 'Failed to retrieve request' });
  }
}

/**
 * PUT /requests/:id/approve
 * Approve a holiday request
 * For API keys: can specify approverEmail in the body to approve on behalf of any approver
 * For regular users: approves as themselves
 */
export async function approveRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;
    const { id } = req.params;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // API keys can approve on behalf of any approver
    // Regular users can only approve as themselves
    let approverEmail = userEmail;
    if (req.user?.isApiKey && req.body.approverEmail) {
      approverEmail = req.body.approverEmail;
      logger.info(
        { apiKey: true, approverEmail, requestId: id },
        'API key approving request on behalf of approver'
      );
    }

    const updatedRequest = await requestsService.processApproval(
      id,
      approverEmail,
      ApprovalAction.APPROVE
    );

    logger.info({ requestId: id, approver: userEmail }, 'Request approved');
    // Notify employee and next approver (fire-and-forget)
    notificationService
      .notifyRequestUpdated(updatedRequest, 'Aprobado', userEmail)
      .catch((err) => logger.error({ err, requestId: id }, 'Failed to send approval notification'));

    res.json(updatedRequest);
  } catch (error: any) {
    logger.error(
      { error, user: req.user?.email, requestId: req.params.id },
      'Error approving request'
    );
    res.status(400).json({ error: error.message || 'Failed to approve request' });
  }
}

/**
 * PUT /requests/:id/reject
 * Reject a holiday request
 * For API keys: can specify approverEmail in the body to reject on behalf of any approver
 * For regular users: rejects as themselves
 */
export async function rejectRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;
    const { id } = req.params;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // API keys can reject on behalf of any approver
    // Regular users can only reject as themselves
    let approverEmail = userEmail;
    if (req.user?.isApiKey && req.body.approverEmail) {
      approverEmail = req.body.approverEmail;
      logger.info(
        { apiKey: true, approverEmail, requestId: id },
        'API key rejecting request on behalf of approver'
      );
    }

    const updatedRequest = await requestsService.processApproval(
      id,
      approverEmail,
      ApprovalAction.REJECT
    );

    logger.info({ requestId: id, approver: userEmail }, 'Request rejected');
    notificationService
      .notifyRequestUpdated(updatedRequest, 'Rechazado', userEmail)
      .catch((err) =>
        logger.error({ err, requestId: id }, 'Failed to send rejection notification')
      );

    res.json(updatedRequest);
  } catch (error: any) {
    logger.error(
      { error, user: req.user?.email, requestId: req.params.id },
      'Error rejecting request'
    );
    res.status(400).json({ error: error.message || 'Failed to reject request' });
  }
}

/**
 * GET /requests/approved
 * Get approved holiday requests with optional time filtering
 * Query params:
 * - timeMin: Start date filter in ISO 8601 format (e.g., 2025-10-26T03:00:00.000Z)
 * - timeMax: End date filter in ISO 8601 format (e.g., 2025-12-07T02:59:59.999Z)
 */
export async function getApprovedRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // API keys have full access - no additional checks needed
    // (they can see all approved requests without restrictions)

    // Get all requests
    const allRequests = await requestsService.getAllRequests();

    // Filter only approved requests
    let approvedRequests = allRequests.filter(
      (request) => request.status === RequestStatus.APPROVED
    );

    // Apply time filters if provided
    const { timeMin, timeMax } = req.query;

    if (timeMin || timeMax) {
      approvedRequests = approvedRequests.filter((request) => {
        try {
          // Parse request dates (DD/MM/YYYY format)
          const requestStart = parseDate(request.startDate);
          const requestEnd = parseDate(request.endDate);

          // Filter by timeMin (request must end on or after timeMin)
          if (timeMin) {
            const minDate = new Date(timeMin as string);
            if (isNaN(minDate.getTime())) {
              logger.warn({ timeMin }, 'Invalid timeMin format');
              return true; // Skip filtering if invalid
            }
            // Compare dates (ignore time component)
            requestEnd.setHours(23, 59, 59, 999);
            if (requestEnd < minDate) {
              return false;
            }
          }

          // Filter by timeMax (request must start on or before timeMax)
          if (timeMax) {
            const maxDate = new Date(timeMax as string);
            if (isNaN(maxDate.getTime())) {
              logger.warn({ timeMax }, 'Invalid timeMax format');
              return true; // Skip filtering if invalid
            }
            // Compare dates (ignore time component)
            requestStart.setHours(0, 0, 0, 0);
            if (requestStart > maxDate) {
              return false;
            }
          }

          return true;
        } catch (error) {
          logger.warn(
            { error, requestId: request.id },
            'Error parsing request dates for filtering'
          );
          return false;
        }
      });
    }

    logger.info(
      { user: userEmail, count: approvedRequests.length, timeMin, timeMax },
      'Retrieved approved requests'
    );
    res.json(approvedRequests);
  } catch (error) {
    logger.error({ error, user: req.user?.email }, 'Error retrieving approved requests');
    res.status(500).json({ error: 'Failed to retrieve approved requests' });
  }
}

/**
 * PUT /requests/:id/delete
 *
 * Soft-cancel a holiday request. Preserves the row (no delete) and sets
 * status = CANCELLED with cancelledAt/cancelledBy.
 *
 * Resolver del actor:
 *   - JWT humano: actor = req.user.email. body.cancelledBy se ignora.
 *   - API key:    actor = body.cancelledBy (obligatorio). Si falta: 400 MISSING_CANCELLED_BY.
 *
 * Códigos de error devueltos con shape { error, code }:
 *   400 MISSING_CANCELLED_BY | 401 (middleware) | 403 NOT_OWNER |
 *   403 HAS_PARTIAL_APPROVAL | 404 NOT_FOUND    | 409 NOT_PENDING |
 *   409 ALREADY_STARTED
 */
export async function deleteRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const userEmail = req.user?.email;

  if (!userEmail) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  // Resolve the actor: JWT uses the token email; API key uses body.cancelledBy.
  let actorEmail: string;
  if (req.user?.isApiKey) {
    const bodyCancelledBy =
      typeof req.body?.cancelledBy === 'string' ? req.body.cancelledBy.trim() : '';
    if (!bodyCancelledBy) {
      res.status(400).json({
        error: 'Falta cancelledBy en el body',
        code: CancelErrorCode.MISSING_CANCELLED_BY,
      });
      return;
    }
    actorEmail = bodyCancelledBy;
  } else {
    actorEmail = userEmail;
  }

  try {
    const cancelled = await requestsService.cancelRequest(id, actorEmail);

    // Fire-and-forget: notification failures don't fail the cancel.
    const cancelledByOwner =
      cancelled.employeeEmail.toLowerCase() === actorEmail.toLowerCase();
    notificationService
      .notifyRequestCancelled(cancelled, actorEmail, cancelledByOwner)
      .catch((err) =>
        logger.error({ err, requestId: id }, 'Failed to send cancellation notification')
      );

    logger.info({ requestId: id, actor: actorEmail }, 'Request cancelled');
    res.status(200).json(cancelled);
  } catch (error: any) {
    if (error instanceof CancelRequestError) {
      const status = CANCEL_CODE_TO_HTTP[error.code];
      logger.info(
        { requestId: id, actor: actorEmail, code: error.code },
        'Cancellation refused by business rule'
      );
      res.status(status).json({ error: error.message, code: error.code });
      return;
    }

    logger.error(
      { error, user: req.user?.email, actor: actorEmail, requestId: id },
      'Unexpected error cancelling request'
    );
    res.status(500).json({ error: 'Failed to cancel request' });
  }
}
