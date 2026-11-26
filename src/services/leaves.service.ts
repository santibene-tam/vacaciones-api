import googleSheetsService from './googleSheets.service';
import logger from '../utils/logger';
import config from '../config';
import { getLeaveRule, LEAVE_RULES } from '../config/leaveRules';
import {
  LeaveRequest,
  CreateLeaveRequestInput,
  LeaveStatus,
  LeaveError,
  LeaveErrorCode,
  LeaveRule,
  RequestStatus,
  HolidayRequest,
} from '../types';
import {
  calculateBusinessDays,
  isValidDateFormat,
  isValidDateRange,
  isBusinessDay,
  isDateAfterTodayInBuenosAires,
  parseDate,
  formatTimestamp,
} from '../utils/dateUtils';

const normalizeEmail = (email: string | undefined | null): string =>
  (email ?? '').trim().toLowerCase();

const generateLeaveId = (): string =>
  `LEAVE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

/**
 * Cuenta días corridos entre dos fechas DD/MM/YYYY, inclusive.
 */
function countCalendarDays(startDateStr: string, endDateStr: string): number {
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * ¿El rango incluye al menos un día hábil?
 */
function rangeHasBusinessDay(startDateStr: string, endDateStr: string): boolean {
  const cursor = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  while (cursor <= end) {
    if (isBusinessDay(cursor)) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

/**
 * Normaliza `rule.days` → número efectivo según el rango. Si la regla define
 * `days = número`, devuelve ese número. Si define rango [min, max], devuelve el
 * número de días del rango si cae adentro. Si es 'variable', devuelve el conteo.
 */
function expectedDays(rule: LeaveRule, counted: number): { ok: boolean; expected?: string } {
  if (rule.days === 'variable') {
    return { ok: counted > 0 };
  }
  if (typeof rule.days === 'number') {
    return rule.days === counted
      ? { ok: true }
      : { ok: false, expected: `${rule.days} ${rule.unit}` };
  }
  const [min, max] = rule.days;
  return counted >= min && counted <= max
    ? { ok: true }
    : { ok: false, expected: `entre ${min} y ${max} ${rule.unit}` };
}

class LeavesService {
  listTypes(): LeaveRule[] {
    return LEAVE_RULES;
  }

  isHRApprover(email: string): boolean {
    const target = normalizeEmail(email);
    if (!target) return false;
    return config.hrApproverEmails.includes(target);
  }

  getHRApprovers(): string[] {
    return config.hrApproverEmails;
  }

  async getAll(): Promise<LeaveRequest[]> {
    return googleSheetsService.getAllLeaveRequests();
  }

  async getMy(employeeEmail: string): Promise<LeaveRequest[]> {
    const mine = await googleSheetsService.getLeaveRequestsByEmployee(employeeEmail);
    return mine.sort((a, b) => (+new Date(b.createdAt) || 0) - (+new Date(a.createdAt) || 0));
  }

  async getPendingForHR(): Promise<LeaveRequest[]> {
    const all = await this.getAll();
    return all.filter((l) => l.status === LeaveStatus.PENDING);
  }

  async getById(id: string): Promise<LeaveRequest | null> {
    return googleSheetsService.getLeaveRequestById(id);
  }

  /**
   * Crea una solicitud de licencia después de validar reglas de negocio.
   */
  async createLeave(
    employeeEmail: string,
    input: CreateLeaveRequestInput
  ): Promise<LeaveRequest> {
    // 1) Tipo válido
    const rule = getLeaveRule(input.leaveType);
    if (!rule) {
      throw new LeaveError(LeaveErrorCode.INVALID_TYPE, `Tipo de licencia inválido: ${input.leaveType}`);
    }

    // 2) Formato de fechas
    if (!input.startDate || !input.endDate) {
      throw new LeaveError(LeaveErrorCode.INVALID_DATE_RANGE, 'startDate y endDate son obligatorios');
    }
    if (!isValidDateFormat(input.startDate) || !isValidDateFormat(input.endDate)) {
      throw new LeaveError(
        LeaveErrorCode.INVALID_DATE_RANGE,
        'Fechas en formato DD/MM/YYYY'
      );
    }
    if (!isValidDateRange(input.startDate, input.endDate)) {
      throw new LeaveError(
        LeaveErrorCode.INVALID_DATE_RANGE,
        'endDate debe ser igual o posterior a startDate'
      );
    }

    // 3) startDate no puede ser en el pasado (idem vacaciones)
    if (!isDateAfterTodayInBuenosAires(input.startDate)) {
      throw new LeaveError(
        LeaveErrorCode.INVALID_DATE_RANGE,
        'La licencia debe comenzar a partir de mañana'
      );
    }

    // 4) Días según unidad de la regla
    const days =
      rule.unit === 'habiles'
        ? calculateBusinessDays(input.startDate, input.endDate)
        : countCalendarDays(input.startDate, input.endDate);

    const expected = expectedDays(rule, days);
    if (!expected.ok) {
      throw new LeaveError(
        LeaveErrorCode.INVALID_DAYS,
        `Esta licencia requiere ${expected.expected}. Enviaste ${days} ${rule.unit}.`
      );
    }

    // 5) Certificado si corresponde
    if (rule.requiresCertificate && !input.certificateUrl) {
      throw new LeaveError(
        LeaveErrorCode.MISSING_CERTIFICATE,
        `${rule.name} requiere adjuntar certificado (campo certificateUrl)`
      );
    }

    // 6) Art. 160: debe incluir al menos un día hábil
    if (rule.mustIncludeBusinessDay && !rangeHasBusinessDay(input.startDate, input.endDate)) {
      throw new LeaveError(
        LeaveErrorCode.MISSING_BUSINESS_DAY,
        'La licencia cae íntegra en días no laborables; debe incluir al menos un día hábil (art. 160 LCT)'
      );
    }

    // 7) Empleado existe
    const employee = await googleSheetsService.getEmployeeByEmail(employeeEmail);
    if (!employee) {
      throw new LeaveError(LeaveErrorCode.EMPLOYEE_NOT_FOUND, 'Empleado no encontrado');
    }

    // 8) Topes anuales y solapamientos — calculados sobre el año de startDate
    const existingLeaves = await googleSheetsService.getLeaveRequestsByEmployee(employeeEmail);
    const activeLeaves = existingLeaves.filter(
      (l) => l.status === LeaveStatus.PENDING || l.status === LeaveStatus.APPROVED
    );

    this.validateAnnualCap(rule, input.startDate, days, activeLeaves);

    const newStart = parseDate(input.startDate);
    const newEnd = parseDate(input.endDate);

    // Solapamientos con otras licencias activas
    const leaveOverlap = activeLeaves.some((l) => {
      const s = parseDate(l.startDate);
      const e = parseDate(l.endDate);
      return newStart <= e && newEnd >= s;
    });
    if (leaveOverlap) {
      throw new LeaveError(
        LeaveErrorCode.OVERLAP,
        'La licencia se solapa con otra licencia tuya pendiente o aprobada'
      );
    }

    // Solapamientos con vacaciones activas
    const holidays = await googleSheetsService.getRequestsByEmployee(employeeEmail);
    const holidayOverlap = holidays.some((h: HolidayRequest) => {
      if (h.status !== RequestStatus.PENDING && h.status !== RequestStatus.APPROVED) {
        return false;
      }
      const s = parseDate(h.startDate);
      const e = parseDate(h.endDate);
      return newStart <= e && newEnd >= s;
    });
    if (holidayOverlap) {
      throw new LeaveError(
        LeaveErrorCode.OVERLAP,
        'La licencia se solapa con una solicitud de vacaciones pendiente o aprobada'
      );
    }

    // 9) Crear
    const now = new Date();
    const leave: LeaveRequest = {
      id: generateLeaveId(),
      createdAt: formatTimestamp(now),
      employeeEmail: employee.email,
      employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
      leaveType: rule.code,
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      unit: rule.unit,
      reason: input.reason,
      certificateUrl: input.certificateUrl,
      status: LeaveStatus.PENDING,
      source: input.source || 'api',
    };

    const created = await googleSheetsService.createLeaveRequest(leave);

    logger.info(
      { leaveId: created.id, employee: employeeEmail, type: rule.code, days },
      'Licencia creada'
    );

    return created;
  }

  /**
   * Valida el tope anual (sea en días o en eventos) para el tipo dado.
   * Cuenta sobre las licencias activas del año de startDate.
   */
  private validateAnnualCap(
    rule: LeaveRule,
    startDateStr: string,
    requestedDays: number,
    activeLeaves: LeaveRequest[]
  ): void {
    if (!rule.annualCap) return;

    const year = parseDate(startDateStr).getFullYear();
    const sameTypeThisYear = activeLeaves.filter((l) => {
      if (l.leaveType !== rule.code) return false;
      const y = parseDate(l.startDate).getFullYear();
      return y === year;
    });

    if (rule.annualCap.events !== undefined) {
      if (sameTypeThisYear.length >= rule.annualCap.events) {
        throw new LeaveError(
          LeaveErrorCode.ANNUAL_CAP_EXCEEDED,
          `Ya usaste ${rule.annualCap.events} evento${rule.annualCap.events === 1 ? '' : 's'} de ${rule.name} este año`
        );
      }
    }

    if (rule.annualCap.days !== undefined) {
      const used = sameTypeThisYear.reduce((acc, l) => acc + l.days, 0);
      if (used + requestedDays > rule.annualCap.days) {
        throw new LeaveError(
          LeaveErrorCode.ANNUAL_CAP_EXCEEDED,
          `El tope anual de ${rule.name} es ${rule.annualCap.days} ${rule.unit}. Usaste ${used}; pedís ${requestedDays}.`
        );
      }
    }
  }

  async approveLeave(id: string, hrEmail: string): Promise<LeaveRequest> {
    if (!this.isHRApprover(hrEmail)) {
      throw new LeaveError(LeaveErrorCode.NOT_HR, 'Solo RR. HH. puede aprobar licencias');
    }
    const leave = await this.getById(id);
    if (!leave) {
      throw new LeaveError(LeaveErrorCode.NOT_FOUND, 'Licencia no encontrada');
    }
    if (leave.status !== LeaveStatus.PENDING) {
      throw new LeaveError(
        LeaveErrorCode.NOT_PENDING,
        `La licencia no está pendiente, su estado es ${leave.status}`
      );
    }

    const now = formatTimestamp(new Date());
    const updated: LeaveRequest = {
      ...leave,
      status: LeaveStatus.APPROVED,
      hrApproverEmail: normalizeEmail(hrEmail),
      decidedAt: now,
    };
    return googleSheetsService.updateLeaveRequest(id, updated);
  }

  async rejectLeave(id: string, hrEmail: string, reason: string): Promise<LeaveRequest> {
    if (!this.isHRApprover(hrEmail)) {
      throw new LeaveError(LeaveErrorCode.NOT_HR, 'Solo RR. HH. puede rechazar licencias');
    }
    if (!reason || !reason.trim()) {
      throw new LeaveError(
        LeaveErrorCode.MISSING_REJECTION_REASON,
        'El rechazo requiere un motivo'
      );
    }
    const leave = await this.getById(id);
    if (!leave) {
      throw new LeaveError(LeaveErrorCode.NOT_FOUND, 'Licencia no encontrada');
    }
    if (leave.status !== LeaveStatus.PENDING) {
      throw new LeaveError(
        LeaveErrorCode.NOT_PENDING,
        `La licencia no está pendiente, su estado es ${leave.status}`
      );
    }

    const now = formatTimestamp(new Date());
    const updated: LeaveRequest = {
      ...leave,
      status: LeaveStatus.REJECTED,
      hrApproverEmail: normalizeEmail(hrEmail),
      decidedAt: now,
      rejectionReason: reason.trim(),
    };
    return googleSheetsService.updateLeaveRequest(id, updated);
  }

  /**
   * Cancela una licencia (soft-delete).
   *  - Debe existir y estar PENDING o APPROVED
   *  - startDate debe ser futura
   *  - Actor: dueño o RR. HH.
   */
  async cancelLeave(id: string, actorEmail: string): Promise<LeaveRequest> {
    const leave = await this.getById(id);
    if (!leave) {
      throw new LeaveError(LeaveErrorCode.NOT_FOUND, 'Licencia no encontrada');
    }
    if (leave.status !== LeaveStatus.PENDING && leave.status !== LeaveStatus.APPROVED) {
      throw new LeaveError(
        LeaveErrorCode.NOT_PENDING,
        `No se puede cancelar una licencia en estado ${leave.status}`
      );
    }
    if (!isDateAfterTodayInBuenosAires(leave.startDate)) {
      throw new LeaveError(
        LeaveErrorCode.ALREADY_STARTED,
        'La licencia ya comenzó; contactá a RR. HH.'
      );
    }

    const actor = normalizeEmail(actorEmail);
    const owner = normalizeEmail(leave.employeeEmail);
    const isOwner = actor === owner;
    const isHR = this.isHRApprover(actorEmail);
    if (!isOwner && !isHR) {
      throw new LeaveError(
        LeaveErrorCode.NOT_OWNER,
        'No podés cancelar una licencia que no es tuya'
      );
    }

    const now = formatTimestamp(new Date());
    const updated: LeaveRequest = {
      ...leave,
      status: LeaveStatus.CANCELLED,
      cancelledAt: now,
      cancelledBy: actor,
    };
    return googleSheetsService.updateLeaveRequest(id, updated);
  }
}

export default new LeavesService();
