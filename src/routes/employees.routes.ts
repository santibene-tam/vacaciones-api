import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getAllEmployees,
  getMyEmployeeInfo,
  getEmployeeByEmail,
} from '../controllers/employees.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get current user's employee information
router.get('/me', getMyEmployeeInfo);

// Get all employees (RRHH) or team (approver)
router.get('/', getAllEmployees);

// Get specific employee by email (with access control)
router.get('/:email', getEmployeeByEmail);

export default router;
