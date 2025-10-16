import { google } from 'googleapis';
import config from '../config';
import logger from '../utils/logger';
import { EmployeeHoliday } from '../types';

class GoogleSheetsService {
  private sheets;

  constructor() {
    // Authenticate using service account
    const auth = new google.auth.GoogleAuth({
      keyFile: config.googleServiceAccountKeyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  /**
   * Fetch all employee holiday data from the Google Sheet
   */
  async getEmployeesData(): Promise<EmployeeHoliday[]> {
    try {
      const range = `${config.googleSheetsTabName}!A2:L`; // Skip header row, columns A-L

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.googleSheetsId,
        range,
      });

      const rows = response.data.values;

      if (!rows || rows.length === 0) {
        logger.warn('No data found in Google Sheets');
        return [];
      }

      const employees: EmployeeHoliday[] = rows.map((row) => ({
        email: row[0] || '',
        emailRaw: row[1] || '',
        lastName: row[2] || '',
        firstName: row[3] || '',
        startDate: row[4] || '',
        carriedOverDays: parseFloat(row[5]) || 0,
        correspondingDays: parseFloat(row[6]) || 0,
        daysTaken: parseFloat(row[7]) || 0,
        daysRemaining: parseFloat(row[8]) || 0,
        approver1: row[9] || '',
        approver2: row[10] || '',
        approver3: row[11] || '',
      }));

      logger.info({ count: employees.length }, 'Fetched employee data from Google Sheets');
      return employees;
    } catch (error) {
      logger.error({ error }, 'Error fetching data from Google Sheets');
      throw error;
    }
  }

  /**
   * Get holiday data for a specific employee by email
   */
  async getEmployeeByEmail(email: string): Promise<EmployeeHoliday | null> {
    const employees = await this.getEmployeesData();
    const employee = employees.find((emp) => emp.email.toLowerCase() === email.toLowerCase());

    return employee || null;
  }

  /**
   * Get employees that a user is authorized to approve for
   */
  async getEmployeesForApprover(approverEmail: string): Promise<EmployeeHoliday[]> {
    const employees = await this.getEmployeesData();
    const approverEmailLower = approverEmail.toLowerCase();

    return employees.filter(
      (emp) =>
        emp.approver1.toLowerCase() === approverEmailLower ||
        emp.approver2.toLowerCase() === approverEmailLower ||
        emp.approver3.toLowerCase() === approverEmailLower
    );
  }

  /**
   * Check if a user is RRHH (approver3 === 'RRHH' in any row)
   */
  async isRRHH(email: string): Promise<boolean> {
    const employee = await this.getEmployeeByEmail(email);
    if (!employee) return false;

    // Check if the user's approver3 is RRHH or if they appear as RRHH anywhere
    return employee.approver3.toUpperCase() === 'RRHH';
  }
}

export default new GoogleSheetsService();
