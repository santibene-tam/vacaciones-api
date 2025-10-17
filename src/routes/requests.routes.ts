import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createRequest,
  getMyRequests,
  getPendingRequests,
  getAllRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
} from '../controllers/requests.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Create a new holiday request
router.post('/', createRequest);

// Get current user's requests
router.get('/me', getMyRequests);

// Get pending requests for the current user (as approver)
router.get('/pending', getPendingRequests);

// Get all requests (RRHH only) - must be before /:id to avoid conflict
router.get('/all', getAllRequests);

// Get a specific request by ID
router.get('/:id', getRequestById);

// Approve a request
router.put('/:id/approve', approveRequest);

// Reject a request
router.put('/:id/reject', rejectRequest);

export default router;
