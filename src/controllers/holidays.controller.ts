import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import googleSheetsService from '../services/googleSheets.service';
import logger from '../utils/logger';

/**
 * GET /holidays/me
 * Get holiday information for the authenticated user
 */
export async function getMyHolidays(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const employee = await googleSheetsService.getEmployeeByEmail(userEmail);

    if (!employee) {
      res.status(404).json({ error: 'Employee data not found' });
      return;
    }

    logger.info({ email: userEmail }, 'Retrieved holiday data for user');
    res.json(employee);
  } catch (error) {
    logger.error({ error }, 'Error retrieving user holidays');
    res.status(500).json({ error: 'Failed to retrieve holiday data' });
  }
}

/**
 * GET /holidays/:email
 * Get holiday information for a specific employee
 * Access control:
 * - Employees can only view their own data
 * - Approvers can view data for employees they approve
 * - RRHH can view all employee data
 */
export async function getEmployeeHolidays(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { email } = req.params;
    const userEmail = req.user?.email;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // API keys have full access to all employee data
    if (req.user?.isApiKey) {
      const employee = await googleSheetsService.getEmployeeByEmail(email);
      if (!employee) {
        res.status(404).json({ error: 'Employee data not found' });
        return;
      }
      logger.info({ apiKey: true, targetEmail: email }, 'API key accessed employee data');
      res.json(employee);
      return;
    }

    // Check if user is requesting their own data
    if (email.toLowerCase() === userEmail.toLowerCase()) {
      const employee = await googleSheetsService.getEmployeeByEmail(email);
      if (!employee) {
        res.status(404).json({ error: 'Employee data not found' });
        return;
      }
      res.json(employee);
      return;
    }

    // Check if user is RRHH (can view all)
    const isRRHH = await googleSheetsService.isRRHH(userEmail);
    if (isRRHH) {
      const employee = await googleSheetsService.getEmployeeByEmail(email);
      if (!employee) {
        res.status(404).json({ error: 'Employee data not found' });
        return;
      }
      logger.info({ rrhh: userEmail, targetEmail: email }, 'RRHH accessed employee data');
      res.json(employee);
      return;
    }

    // Check if user is an approver for the requested employee
    const employeesForApprover = await googleSheetsService.getEmployeesForApprover(userEmail);
    const canAccess = employeesForApprover.some(
      (emp) => emp.email.toLowerCase() === email.toLowerCase()
    );

    if (!canAccess) {
      logger.warn(
        { approver: userEmail, targetEmail: email },
        'Unauthorized access attempt to employee data'
      );
      res.status(403).json({ error: 'You are not authorized to view this employee data' });
      return;
    }

    const employee = await googleSheetsService.getEmployeeByEmail(email);
    if (!employee) {
      res.status(404).json({ error: 'Employee data not found' });
      return;
    }

    logger.info({ approver: userEmail, targetEmail: email }, 'Approver accessed employee data');
    res.json(employee);
  } catch (error) {
    logger.error({ error }, 'Error retrieving employee holidays');
    res.status(500).json({ error: 'Failed to retrieve holiday data' });
  }
}

/**
 * GET /holidays/team
 * Get all employees that the authenticated user can approve for
 */
export async function getTeamHolidays(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // API keys have full access to all employees
    if (req.user?.isApiKey) {
      const allEmployees = await googleSheetsService.getEmployeesData();
      logger.info({ apiKey: true, count: allEmployees.length }, 'API key accessed all employees');
      res.json(allEmployees);
      return;
    }

    // Check if user is RRHH (can view all)
    const isRRHH = await googleSheetsService.isRRHH(userEmail);
    if (isRRHH) {
      const allEmployees = await googleSheetsService.getEmployeesData();
      logger.info({ rrhh: userEmail, count: allEmployees.length }, 'RRHH accessed all employees');
      res.json(allEmployees);
      return;
    }

    // Get employees for approver
    const employees = await googleSheetsService.getEmployeesForApprover(userEmail);
    logger.info(
      { approver: userEmail, count: employees.length },
      'Retrieved team holiday data for approver'
    );
    res.json(employees);
  } catch (error) {
    logger.error({ error }, 'Error retrieving team holidays');
    res.status(500).json({ error: 'Failed to retrieve team holiday data' });
  }
}
