import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  listLeaveTypes,
  createLeave,
  getMyLeaves,
  getAllLeaves,
  getPendingLeaves,
  getLeaveById,
  approveLeave,
  rejectLeave,
  cancelLeave,
} from '../controllers/leaves.controller';

const router = Router();

// Todas requieren autenticación (JWT o API key)
router.use(authenticateToken);

// Tipos de licencia (regla fuente única)
router.get('/types', listLeaveTypes);

// CRUD / consultas
router.post('/', createLeave);
router.get('/me', getMyLeaves);
router.get('/pending', getPendingLeaves);
router.get('/all', getAllLeaves);
router.get('/:id', getLeaveById);

// Transiciones
router.put('/:id/approve', approveLeave);
router.put('/:id/reject', rejectLeave);
router.put('/:id/cancel', cancelLeave);

export default router;
