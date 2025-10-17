import googleSheetsService from './googleSheets.service';
import logger from '../utils/logger';
import {
  HolidayRequest,
  CreateHolidayRequestInput,
  ApprovalAction,
  RequestStatus,
  ApprovalStatus,
  ApproverInfo,
} from '../types';
import {
  calculateBusinessDays,
  isValidDateRange,
  formatTimestamp,
  parseDate,
} from '../utils/dateUtils';

class RequestsService {
  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `REQ-${timestamp}-${random}`;
  }

  /**
   * Create a new holiday request for an employee
   */
  async createRequest(
    employeeEmail: string,
    input: CreateHolidayRequestInput
  ): Promise<HolidayRequest> {
    // Validate date format and range
    if (!isValidDateRange(input.startDate, input.endDate)) {
      throw new Error('Invalid date range. Ensure dates are in DD/MM/YYYY format and end date is after start date');
    }

    // Validate dates are not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = parseDate(input.startDate);
    
    if (startDate < today) {
      throw new Error('Cannot request holidays in the past');
    }

    // Calculate business days (excluding weekends and holidays)
    const totalDays = calculateBusinessDays(input.startDate, input.endDate);

    if (totalDays <= 0) {
      throw new Error('Request must include at least one business day');
    }

    // Get employee data to fetch approvers and validate available days
    const employee = await googleSheetsService.getEmployeeByEmail(employeeEmail);
    if (!employee) {
      throw new Error('Employee not found');
    }

    // Check if employee has enough remaining days
    if (totalDays > employee.daysRemaining) {
      throw new Error(
        `Insufficient holiday days. Requested: ${totalDays}, Available: ${employee.daysRemaining}`
      );
    }

    // Check for overlapping requests
    const existingRequests = await googleSheetsService.getRequestsByEmployee(employeeEmail);
    const hasOverlap = this.checkDateOverlap(input.startDate, input.endDate, existingRequests);
    
    if (hasOverlap) {
      throw new Error('Request overlaps with an existing request');
    }

    // Build approver chain
    const approvers = this.buildApproverChain(employee);

    if (approvers.length === 0) {
      throw new Error('No approvers configured for this employee');
    }

    // Create the request object
    const now = new Date();
    const request: HolidayRequest = {
      id: this.generateRequestId(),
      employeeEmail: employee.email,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      startDate: input.startDate,
      endDate: input.endDate,
      totalDays,
      status: RequestStatus.PENDING,
      currentApprover: approvers[0].email, // Start with first approver
      approver1: approvers[0] || { email: '', status: ApprovalStatus.NOT_REQUIRED, date: '' },
      approver2: approvers[1] || { email: '', status: ApprovalStatus.NOT_REQUIRED, date: '' },
      approver3: approvers[2] || { email: '', status: ApprovalStatus.NOT_REQUIRED, date: '' },
      createdAt: formatTimestamp(now),
      updatedAt: formatTimestamp(now),
    };

    // Save to Google Sheets
    const createdRequest = await googleSheetsService.createRequest(request);

    logger.info(
      {
        requestId: request.id,
        employee: employeeEmail,
        days: totalDays,
        approvers: approvers.map((a) => a.email),
      },
      'Holiday request created'
    );

    return createdRequest;
  }

  /**
   * Build the approver chain from employee data
   */
  private buildApproverChain(employee: any): ApproverInfo[] {
    const approvers: ApproverInfo[] = [];

    if (employee.approver1) {
      approvers.push({
        email: employee.approver1,
        status: ApprovalStatus.PENDING,
        date: '',
      });
    }

    if (employee.approver2) {
      approvers.push({
        email: employee.approver2,
        status: ApprovalStatus.PENDING,
        date: '',
      });
    }

    if (employee.approver3) {
      approvers.push({
        email: employee.approver3,
        status: ApprovalStatus.PENDING,
        date: '',
      });
    }

    return approvers;
  }

  /**
   * Check if a date range overlaps with existing pending/approved requests
   */
  private checkDateOverlap(
    startDateStr: string,
    endDateStr: string,
    existingRequests: HolidayRequest[]
  ): boolean {
    const requestStart = parseDate(startDateStr);
    const requestEnd = parseDate(endDateStr);

    return existingRequests.some((existing) => {
      // Only check against pending or approved requests
      if (existing.status === RequestStatus.REJECTED) {
        return false;
      }

      const existingStart = parseDate(existing.startDate);
      const existingEnd = parseDate(existing.endDate);

      // Check if ranges overlap
      return requestStart <= existingEnd && requestEnd >= existingStart;
    });
  }

  /**
   * Process approval or rejection of a request
   */
  async processApproval(
    requestId: string,
    approverEmail: string,
    action: ApprovalAction
  ): Promise<HolidayRequest> {
    // Get the request
    const request = await googleSheetsService.getRequestById(requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    // Check if request is still pending
    if (request.status !== RequestStatus.PENDING) {
      throw new Error(`Request is already ${request.status.toLowerCase()}`);
    }

    // Verify the user is the current approver
    if (request.currentApprover.toLowerCase() !== approverEmail.toLowerCase()) {
      throw new Error('You are not authorized to approve this request at this stage');
    }

    const now = formatTimestamp(new Date());

    // Handle rejection
    if (action === ApprovalAction.REJECT) {
      request.status = RequestStatus.REJECTED;
      request.currentApprover = '';
      request.updatedAt = now;

      // Update the specific approver's status
      this.updateApproverStatus(request, approverEmail, ApprovalStatus.REJECTED, now);

      await googleSheetsService.updateRequest(requestId, request);

      logger.info(
        { requestId, approver: approverEmail, action },
        'Holiday request rejected'
      );

      return request;
    }

    // Handle approval
    this.updateApproverStatus(request, approverEmail, ApprovalStatus.APPROVED, now);

    // Determine next approver
    const nextApprover = this.getNextApprover(request, approverEmail);

    if (nextApprover) {
      // Move to next approver
      request.currentApprover = nextApprover;
      request.updatedAt = now;

      await googleSheetsService.updateRequest(requestId, request);

      logger.info(
        { requestId, approver: approverEmail, nextApprover },
        'Request approved, moved to next approver'
      );
    } else {
      // All approvals complete
      request.status = RequestStatus.APPROVED;
      request.currentApprover = '';
      request.updatedAt = now;

      await googleSheetsService.updateRequest(requestId, request);

      // Update employee's days taken
      await googleSheetsService.updateEmployeeDaysTaken(
        request.employeeEmail,
        request.totalDays
      );

      logger.info(
        { requestId, approver: approverEmail, totalDays: request.totalDays },
        'Request fully approved, employee days updated'
      );
    }

    return request;
  }

  /**
   * Update the status of a specific approver in the request
   */
  private updateApproverStatus(
    request: HolidayRequest,
    approverEmail: string,
    status: ApprovalStatus,
    date: string
  ): void {
    const approverEmailLower = approverEmail.toLowerCase();

    if (request.approver1.email.toLowerCase() === approverEmailLower) {
      request.approver1.status = status;
      request.approver1.date = date;
    } else if (request.approver2.email.toLowerCase() === approverEmailLower) {
      request.approver2.status = status;
      request.approver2.date = date;
    } else if (request.approver3.email.toLowerCase() === approverEmailLower) {
      request.approver3.status = status;
      request.approver3.date = date;
    }
  }

  /**
   * Get the next approver in the chain
   */
  private getNextApprover(request: HolidayRequest, currentApprover: string): string | null {
    const currentApproverLower = currentApprover.toLowerCase();

    // If current approver is approver1, move to approver2 (if exists)
    if (
      request.approver1.email.toLowerCase() === currentApproverLower &&
      request.approver2.email &&
      request.approver2.status === ApprovalStatus.PENDING
    ) {
      return request.approver2.email;
    }

    // If current approver is approver2, move to approver3 (if exists)
    if (
      request.approver2.email.toLowerCase() === currentApproverLower &&
      request.approver3.email &&
      request.approver3.status === ApprovalStatus.PENDING
    ) {
      return request.approver3.email;
    }

    // No more approvers
    return null;
  }

  /**
   * Get all requests (for RRHH)
   */
  async getAllRequests(): Promise<HolidayRequest[]> {
    return googleSheetsService.getAllRequests();
  }

  /**
   * Get requests for a specific employee
   */
  async getRequestsByEmployee(employeeEmail: string): Promise<HolidayRequest[]> {
    return googleSheetsService.getRequestsByEmployee(employeeEmail);
  }

  /**
   * Get pending requests for an approver
   */
  async getPendingRequestsForApprover(approverEmail: string): Promise<HolidayRequest[]> {
    return googleSheetsService.getPendingRequestsForApprover(approverEmail);
  }

  /**
   * Get a specific request by ID
   */
  async getRequestById(requestId: string): Promise<HolidayRequest | null> {
    return googleSheetsService.getRequestById(requestId);
  }

  /**
   * Check if a user can view a specific request
   */
  async canUserViewRequest(userEmail: string, request: HolidayRequest): Promise<boolean> {
    const userEmailLower = userEmail.toLowerCase();

    // Employee can view their own requests
    if (request.employeeEmail.toLowerCase() === userEmailLower) {
      return true;
    }

    // RRHH can view all
    const isRRHH = await googleSheetsService.isRRHH(userEmail);
    if (isRRHH) {
      return true;
    }

    // Approvers can view requests they approve
    const isApprover =
      request.approver1.email.toLowerCase() === userEmailLower ||
      request.approver2.email.toLowerCase() === userEmailLower ||
      request.approver3.email.toLowerCase() === userEmailLower;

    return isApprover;
  }
}

export default new RequestsService();
