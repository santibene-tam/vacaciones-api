import { google } from 'googleapis';
import config from '../config';
import logger from '../utils/logger';
import { EmployeeHoliday, HolidayRequest, ApprovalStatus, RequestStatus } from '../types';

class GoogleSheetsService {
  private sheets;

  constructor() {
    // Authenticate using service account with read/write access
    const auth = new google.auth.GoogleAuth({
      keyFile: config.googleServiceAccountKeyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'], // Full read/write access
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

  // ==================== HOLIDAY REQUESTS METHODS ====================

  /**
   * Parse a row from the Solicitudes sheet into a HolidayRequest object
   */
  private parseRequestRow(row: any[]): HolidayRequest {
    return {
      id: row[0] || '',
      employeeEmail: row[1] || '',
      employeeName: row[2] || '',
      startDate: row[3] || '',
      endDate: row[4] || '',
      totalDays: parseFloat(row[5]) || 0,
      status: (row[6] || 'PENDING') as RequestStatus,
      currentApprover: row[7] || '',
      approver1: {
        email: row[8] || '',
        status: (row[9] || 'PENDING') as ApprovalStatus,
        date: row[10] || '',
      },
      approver2: {
        email: row[11] || '',
        status: (row[12] || 'NOT_REQUIRED') as ApprovalStatus,
        date: row[13] || '',
      },
      approver3: {
        email: row[14] || '',
        status: (row[15] || 'NOT_REQUIRED') as ApprovalStatus,
        date: row[16] || '',
      },
      createdAt: row[17] || '',
      updatedAt: row[18] || '',
    };
  }

  /**
   * Convert a HolidayRequest object to a row array for the sheet
   */
  private requestToRow(request: HolidayRequest): any[] {
    return [
      request.id,
      request.employeeEmail,
      request.employeeName,
      request.startDate,
      request.endDate,
      request.totalDays,
      request.status,
      request.currentApprover,
      request.approver1.email,
      request.approver1.status,
      request.approver1.date,
      request.approver2.email,
      request.approver2.status,
      request.approver2.date,
      request.approver3.email,
      request.approver3.status,
      request.approver3.date,
      request.createdAt,
      request.updatedAt,
    ];
  }

  /**
   * Fetch all holiday requests from the Solicitudes sheet
   */
  async getAllRequests(): Promise<HolidayRequest[]> {
    try {
      const range = `${config.googleRequestsTabName}!A2:S`; // Skip header row

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.googleSheetsId,
        range,
      });

      const rows = response.data.values;

      if (!rows || rows.length === 0) {
        logger.info('No requests found in Google Sheets');
        return [];
      }

      const requests = rows.map((row) => this.parseRequestRow(row));
      logger.info({ count: requests.length }, 'Fetched holiday requests from Google Sheets');
      return requests;
    } catch (error) {
      logger.error({ error }, 'Error fetching requests from Google Sheets');
      throw error;
    }
  }

  /**
   * Get a specific request by ID
   */
  async getRequestById(requestId: string): Promise<HolidayRequest | null> {
    const requests = await this.getAllRequests();
    return requests.find((req) => req.id === requestId) || null;
  }

  /**
   * Get all requests for a specific employee
   */
  async getRequestsByEmployee(employeeEmail: string): Promise<HolidayRequest[]> {
    const requests = await this.getAllRequests();
    return requests.filter(
      (req) => req.employeeEmail.toLowerCase() === employeeEmail.toLowerCase()
    );
  }

  /**
   * Get pending requests where the user is the current approver
   */
  async getPendingRequestsForApprover(approverEmail: string): Promise<HolidayRequest[]> {
    const requests = await this.getAllRequests();
    return requests.filter(
      (req) =>
        req.status === RequestStatus.PENDING &&
        req.currentApprover.toLowerCase() === approverEmail.toLowerCase()
    );
  }

  /**
   * Create a new holiday request
   */
  async createRequest(request: HolidayRequest): Promise<HolidayRequest> {
    try {
      const range = `${config.googleRequestsTabName}!A:S`;
      const row = this.requestToRow(request);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: config.googleSheetsId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: [row],
        },
      });

      logger.info({ requestId: request.id, employee: request.employeeEmail }, 'Created new holiday request');
      return request;
    } catch (error) {
      logger.error({ error, requestId: request.id }, 'Error creating holiday request');
      throw error;
    }
  }

  /**
   * Update an existing holiday request
   */
  async updateRequest(requestId: string, updatedRequest: HolidayRequest): Promise<HolidayRequest> {
    try {
      // First, find the row number of the request
      const requests = await this.getAllRequests();
      const rowIndex = requests.findIndex((req) => req.id === requestId);

      if (rowIndex === -1) {
        throw new Error(`Request with ID ${requestId} not found`);
      }

      // Row index + 2 (1 for header, 1 for 0-based to 1-based)
      const rowNumber = rowIndex + 2;
      const range = `${config.googleRequestsTabName}!A${rowNumber}:S${rowNumber}`;
      const row = this.requestToRow(updatedRequest);

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: config.googleSheetsId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: [row],
        },
      });

      logger.info({ requestId, rowNumber }, 'Updated holiday request');
      return updatedRequest;
    } catch (error) {
      logger.error({ error, requestId }, 'Error updating holiday request');
      throw error;
    }
  }

  /**
   * Update employee's days taken after a request is approved
   */
  async updateEmployeeDaysTaken(employeeEmail: string, additionalDays: number): Promise<void> {
    try {
      const employees = await this.getEmployeesData();
      const employeeIndex = employees.findIndex(
        (emp) => emp.email.toLowerCase() === employeeEmail.toLowerCase()
      );

      if (employeeIndex === -1) {
        throw new Error(`Employee with email ${employeeEmail} not found`);
      }

      const employee = employees[employeeIndex];
      const newDaysTaken = employee.daysTaken + additionalDays;
      const newDaysRemaining = employee.daysRemaining - additionalDays;

      // Row number (+ 2 for header and 0-based index)
      const rowNumber = employeeIndex + 2;
      
      // Update columns H (daysTaken) and I (daysRemaining)
      const range = `${config.googleSheetsTabName}!H${rowNumber}:I${rowNumber}`;

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: config.googleSheetsId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[newDaysTaken, newDaysRemaining]],
        },
      });

      logger.info(
        { employeeEmail, additionalDays, newDaysTaken, newDaysRemaining },
        'Updated employee days taken'
      );
    } catch (error) {
      logger.error({ error, employeeEmail, additionalDays }, 'Error updating employee days');
      throw error;
    }
  }

  /**
   * Delete a holiday request row from the Solicitudes sheet
   */
  async deleteRequest(requestId: string): Promise<void> {
    try {
      // Find the row index of the request in the data (0-based among data rows)
      const requests = await this.getAllRequests();
      const dataRowIndex = requests.findIndex((req) => req.id === requestId);

      if (dataRowIndex === -1) {
        throw new Error(`Request with ID ${requestId} not found`);
      }

      // Get sheetId by title
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: config.googleSheetsId,
      });

      const sheet = spreadsheet.data.sheets?.find(
        (s) => s.properties?.title === config.googleRequestsTabName
      );

      if (!sheet || sheet.properties?.sheetId === undefined) {
        throw new Error(`Sheet '${config.googleRequestsTabName}' not found`);
      }

      const sheetId = sheet.properties.sheetId;

      // Compute absolute row indexes (0-based for entire sheet):
      // Header is at row 0; data starts at row 1. So add 1 to dataRowIndex
      const startIndex = 1 + dataRowIndex;
      const endIndex = startIndex + 1;

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.googleSheetsId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex,
                  endIndex,
                },
              },
            },
          ],
        },
      });

      logger.info({ requestId, rowDeleted: startIndex }, 'Deleted holiday request row');
    } catch (error) {
      logger.error({ error, requestId }, 'Error deleting holiday request');
      throw error;
    }
  }
}

export default new GoogleSheetsService();

