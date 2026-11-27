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
  // Metadatos de antigüedad — rellenados al enriquecer en holidays.controller.
  seniority?: SeniorityInfo;
  seniorityNextPeriod?: SeniorityInfo;
  seniorityWarning?: string;
}

/**
 * Info de antigüedad para un período (LCT art. 150/151).
 * Lo devolvemos adosado a EmployeeHoliday para que el frontend/n8n tengan contexto.
 */
export interface SeniorityInfo {
  seniorityYears: number;
  workedBusinessDays: number;
  totalBusinessDaysInYear: number;
  isProportional: boolean;
  calculationBasedOn: string;
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

// ==================== VACACIONES: ANTIGÜEDAD ====================

/**
 * Resultado del cálculo de días de vacaciones por antigüedad (LCT art. 150/151).
 * Si workedBusinessDays < totalBusinessDaysInYear / 2 → proporcional (1 cada 20).
 * Si no → tabla por años de antigüedad.
 */
export interface CorrespondingDaysResult {
  correspondingDays: number;
  seniorityYears: number;
  workedBusinessDays: number;
  totalBusinessDaysInYear: number;
  isProportional: boolean;
  calculationBasedOn: string; // "LCT art. 150" | "LCT art. 151 (proporcional)"
}

// ==================== LICENCIAS ====================

export enum LeaveType {
  NACIMIENTO = 'NACIMIENTO',
  MATRIMONIO = 'MATRIMONIO',
  FALLECIMIENTO_FAMILIAR = 'FALLECIMIENTO_FAMILIAR',
  FALLECIMIENTO_HERMANO = 'FALLECIMIENTO_HERMANO',
  EXAMEN = 'EXAMEN',
  MUDANZA = 'MUDANZA',
  ENFERMEDAD = 'ENFERMEDAD',
  MATERNIDAD = 'MATERNIDAD',
}

export type LeaveUnit = 'corridos' | 'habiles';

/**
 * Regla de un tipo de licencia. Fuente única hardcoded en config/leaveRules.ts
 * y expuesta por GET /api/leaves/types para que n8n consuma los mismos valores.
 */
export interface LeaveRule {
  code: LeaveType;
  name: string;
  /** Si es número: días exactos por solicitud. Si es [min, max]: rango permitido. */
  days: number | [number, number] | 'variable';
  unit: LeaveUnit;
  /** Tope anual: días máximos acumulables o eventos máximos por año. */
  annualCap?: { days?: number; events?: number };
  requiresCertificate: boolean;
  /** Art. 160 LCT: el rango tiene que incluir al menos 1 día hábil. */
  mustIncludeBusinessDay: boolean;
  legalBasis: string;
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export interface LeaveRequest {
  id: string;
  createdAt: string;
  employeeEmail: string;
  employeeName: string;
  leaveType: LeaveType;
  startDate: string; // DD/MM/YYYY
  endDate: string; // DD/MM/YYYY
  days: number;
  unit: LeaveUnit;
  reason?: string;
  certificateUrl?: string;
  status: LeaveStatus;
  hrApproverEmail?: string;
  decidedAt?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  source: 'web' | 'slack' | 'api';
}

export interface CreateLeaveRequestInput {
  leaveType: LeaveType;
  startDate: string; // DD/MM/YYYY
  endDate: string; // DD/MM/YYYY
  reason?: string;
  certificateUrl?: string;
  source?: 'web' | 'slack' | 'api';
}

/**
 * Errores de negocio del módulo de licencias.
 * El controller mapea el code → HTTP status.
 */
export enum LeaveErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  NOT_PENDING = 'NOT_PENDING',
  ALREADY_STARTED = 'ALREADY_STARTED',
  NOT_OWNER = 'NOT_OWNER',
  NOT_HR = 'NOT_HR',
  INVALID_TYPE = 'INVALID_TYPE',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  INVALID_DAYS = 'INVALID_DAYS',
  MISSING_CERTIFICATE = 'MISSING_CERTIFICATE',
  ANNUAL_CAP_EXCEEDED = 'ANNUAL_CAP_EXCEEDED',
  MISSING_BUSINESS_DAY = 'MISSING_BUSINESS_DAY',
  OVERLAP = 'OVERLAP',
  EMPLOYEE_NOT_FOUND = 'EMPLOYEE_NOT_FOUND',
  MISSING_REJECTION_REASON = 'MISSING_REJECTION_REASON',
  MISSING_CANCELLED_BY = 'MISSING_CANCELLED_BY',
  MISSING_HR_EMAIL = 'MISSING_HR_EMAIL',
}

export class LeaveError extends Error {
  constructor(
    public code: LeaveErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'LeaveError';
  }
}
