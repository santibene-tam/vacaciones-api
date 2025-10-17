import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import requestsService from '../services/requests.service';
import googleSheetsService from '../services/googleSheets.service';
import logger from '../utils/logger';
import { CreateHolidayRequestInput, ApprovalAction } from '../types';

/**
 * POST /requests
 * Create a new holiday request
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

    const request = await requestsService.createRequest(userEmail, input);

    logger.info({ requestId: request.id, employee: userEmail }, 'Holiday request created via API');
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

    logger.info({ approver: userEmail, count: requests.length }, 'Retrieved pending requests for approver');
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

    // Check if user is RRHH
    const isRRHH = await googleSheetsService.isRRHH(userEmail);
    if (!isRRHH) {
      res.status(403).json({ error: 'Only RRHH can view all requests' });
      return;
    }

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

    // Check if user can view this request
    const canView = await requestsService.canUserViewRequest(userEmail, request);

    if (!canView) {
      res.status(403).json({ error: 'You are not authorized to view this request' });
      return;
    }

    logger.info({ requestId: id, user: userEmail }, 'Retrieved request');
    res.json(request);
  } catch (error) {
    logger.error({ error, user: req.user?.email, requestId: req.params.id }, 'Error retrieving request');
    res.status(500).json({ error: 'Failed to retrieve request' });
  }
}

/**
 * PUT /requests/:id/approve
 * Approve a holiday request
 */
export async function approveRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;
    const { id } = req.params;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const updatedRequest = await requestsService.processApproval(
      id,
      userEmail,
      ApprovalAction.APPROVE
    );

    logger.info({ requestId: id, approver: userEmail }, 'Request approved');
    res.json(updatedRequest);
  } catch (error: any) {
    logger.error({ error, user: req.user?.email, requestId: req.params.id }, 'Error approving request');
    res.status(400).json({ error: error.message || 'Failed to approve request' });
  }
}

/**
 * PUT /requests/:id/reject
 * Reject a holiday request
 */
export async function rejectRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;
    const { id } = req.params;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const updatedRequest = await requestsService.processApproval(
      id,
      userEmail,
      ApprovalAction.REJECT
    );

    logger.info({ requestId: id, approver: userEmail }, 'Request rejected');
    res.json(updatedRequest);
  } catch (error: any) {
    logger.error({ error, user: req.user?.email, requestId: req.params.id }, 'Error rejecting request');
    res.status(400).json({ error: error.message || 'Failed to reject request' });
  }
}
