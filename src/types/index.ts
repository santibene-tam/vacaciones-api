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
