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
}

export interface CreateHolidayRequestInput {
  startDate: string; // Format: DD/MM/YYYY
  endDate: string; // Format: DD/MM/YYYY
}

export interface ApprovalActionInput {
  action: ApprovalAction;
  comments?: string;
}
