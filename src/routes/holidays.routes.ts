import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getMyHolidays,
  getEmployeeHolidays,
  getTeamHolidays,
} from '../controllers/holidays.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get current user's holidays
router.get('/me', getMyHolidays);

// Get team/all employees (based on role)
router.get('/team', getTeamHolidays);

// Get specific employee's holidays (with access control)
router.get('/:email', getEmployeeHolidays);

export default router;
