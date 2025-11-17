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
      const range = `${config.googleSheetsTabName}!A2:O`; // Skip header row, columns A-O

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
        correspondingDaysNextPeriod: parseFloat(row[9]) || 0,
        daysTakenNextPeriod: parseFloat(row[10]) || 0,
        daysRemainingNextPeriod: parseFloat(row[11]) || 0,
        approver1: row[12] || '',
        approver2: row[13] || '',
        approver3: row[14] || '',
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
  private parseRequestRow(row: string[]): HolidayRequest {
    return {
      id: row[0] || '',
      employeeEmail: row[1] || '',
      employeeName: row[2] || '',
      startDate: row[3] || '',
      endDate: row[4] || '',
      totalDays: parseFloat(row[5]) || 0,
      currentPeriodDays: parseFloat(row[6]) || 0,
      nextPeriodDays: parseFloat(row[7]) || 0,
      status: (row[8] || 'PENDING') as RequestStatus,
      currentApprover: row[9] || '',
      approver1: {
        email: row[10] || '',
        status: (row[11] || 'PENDING') as ApprovalStatus,
        date: row[12] || '',
      },
      approver2: {
        email: row[13] || '',
        status: (row[14] || 'NOT_REQUIRED') as ApprovalStatus,
        date: row[15] || '',
      },
      approver3: {
        email: row[16] || '',
        status: (row[17] || 'NOT_REQUIRED') as ApprovalStatus,
        date: row[18] || '',
      },
      createdAt: row[19] || '',
      updatedAt: row[20] || '',
    };
  }

  /**
   * Convert a HolidayRequest object to a row array for the sheet
   */
  private requestToRow(request: HolidayRequest): (string | number)[] {
    return [
      request.id,
      request.employeeEmail,
      request.employeeName,
      request.startDate,
      request.endDate,
      request.totalDays,
      request.currentPeriodDays,
      request.nextPeriodDays,
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
      const range = `${config.googleRequestsTabName}!A2:U`; // Skip header row, updated to column U for new fields

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
      const range = `${config.googleRequestsTabName}!A:U`;
      const row = this.requestToRow(request);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: config.googleSheetsId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: [row],
        },
      });

      logger.info(
        { requestId: request.id, employee: request.employeeEmail },
        'Created new holiday request'
      );
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
      const range = `${config.googleRequestsTabName}!A${rowNumber}:U${rowNumber}`;
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
   * @param employeeEmail - Employee's email
   * @param currentPeriodDays - Days to add to current period
   * @param nextPeriodDays - Days to add to next period
   */
  async updateEmployeeDaysTaken(
    employeeEmail: string,
    currentPeriodDays: number,
    nextPeriodDays: number
  ): Promise<void> {
    try {
      const employees = await this.getEmployeesData();
      const employeeIndex = employees.findIndex(
        (emp) => emp.email.toLowerCase() === employeeEmail.toLowerCase()
      );

      if (employeeIndex === -1) {
        throw new Error(`Employee with email ${employeeEmail} not found`);
      }

      const employee = employees[employeeIndex];

      // Calculate new values for current period
      const newDaysTaken = employee.daysTaken + currentPeriodDays;
      const newDaysRemaining = employee.daysRemaining - currentPeriodDays;

      // Calculate new values for next period
      const newDaysTakenNextPeriod = employee.daysTakenNextPeriod + nextPeriodDays;
      const newDaysRemainingNextPeriod = employee.daysRemainingNextPeriod - nextPeriodDays;

      // Row number (+ 2 for header and 0-based index)
      const rowNumber = employeeIndex + 2;

      // Update columns H-I (current period: daysTaken, daysRemaining)
      // and K-L (next period: daysTakenNextPeriod, daysRemainingNextPeriod)
      // Note: We skip column J (correspondingDaysNextPeriod) as it should not change
      const updates = [
        {
          range: `${config.googleSheetsTabName}!H${rowNumber}:I${rowNumber}`,
          values: [[newDaysTaken, newDaysRemaining]],
        },
        {
          range: `${config.googleSheetsTabName}!K${rowNumber}:L${rowNumber}`,
          values: [[newDaysTakenNextPeriod, newDaysRemainingNextPeriod]],
        },
      ];

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: config.googleSheetsId,
        requestBody: {
          data: updates,
          valueInputOption: 'RAW',
        },
      });

      logger.info(
        {
          employeeEmail,
          currentPeriodDays,
          nextPeriodDays,
          newDaysTaken,
          newDaysRemaining,
          newDaysTakenNextPeriod,
          newDaysRemainingNextPeriod,
        },
        'Updated employee days taken for both periods'
      );
    } catch (error) {
      logger.error(
        { error, employeeEmail, currentPeriodDays, nextPeriodDays },
        'Error updating employee days'
      );
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
