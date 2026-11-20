export interface EmployeeHoliday {
  email: string;
  emailRaw: string;
  lastName: string;
  firstName: string;
  startDate: string;
  carriedOverDays: number;
  correspondingDays: number;
  daysTaken: number;
  daysRemaining: number;
  correspondingDaysNextPeriod: number;
  daysTakenNextPeriod: number;
  daysRemainingNextPeriod: number;
  approver1: string;
  approver2: string;
  approver3: string;
}

export interface UserTokenPayload {
  email: string;
  name?: string;
  picture?: string;
  sub: string;
  isApiKey?: boolean; // Flag to indicate if authenticated via API key
}

export enum UserRole {
  EMPLOYEE = 'employee',
  APPROVER = 'approver',
  RRHH = 'rrhh',
}

export interface AccessControl {
  canViewAllEmployees: boolean;
  canViewEmployee: (targetEmail: string) => boolean;
}

// Holiday Request Types
export enum RequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/**
 * Stable machine-readable error codes for cancellation outcomes.
 * The HTTP status and user-facing message may be reworded; the code is the stable contract.
 */
export enum CancelErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  NOT_PENDING = 'NOT_PENDING',
  ALREADY_STARTED = 'ALREADY_STARTED',
  NOT_OWNER = 'NOT_OWNER',
  HAS_PARTIAL_APPROVAL = 'HAS_PARTIAL_APPROVAL',
  MISSING_CANCELLED_BY = 'MISSING_CANCELLED_BY',
}

/**
 * Thrown by the service layer so the controller can map code → HTTP status.
 */
export class CancelRequestError extends Error {
  constructor(
    public code: CancelErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'CancelRequestError';
  }
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  NOT_REQUIRED = 'NOT_REQUIRED',
}

export enum ApprovalAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export interface ApproverInfo {
  email: string;
  status: ApprovalStatus;
  date: string;
}

export interface HolidayRequest {
  id: string;
  employeeEmail: string;
  employeeName: string;
  startDate: string; // Format: DD/MM/YYYY
  endDate: string; // Format: DD/MM/YYYY
  totalDays: number;
  currentPeriodDays: number; // Days taken from current period
  nextPeriodDays: number; // Days taken from next period
  status: RequestStatus;
  currentApprover: string;
  approver1: ApproverInfo;
  approver2: ApproverInfo;
  approver3: ApproverInfo;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string; // ISO timestamp; only present when status === CANCELLED
  cancelledBy?: string; // Email of who cancelled (owner or RRHH)
}

export interface CreateHolidayRequestInput {
  startDate: string; // Format: DD/MM/YYYY
  endDate: string; // Format: DD/MM/YYYY
}

export interface CancelRequestInput {
  cancelledBy?: string; // Required with API key auth; ignored with JWT auth
}

export interface ApprovalActionInput {
  action: ApprovalAction;
  comments?: string;
}
