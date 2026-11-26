import { CorrespondingDaysResult, EmployeeHoliday, SeniorityInfo } from '../types';
import {
  parseDate,
  isBusinessDay,
  HolidayPeriod,
  getCurrentPeriod,
  getNextPeriod,
} from '../utils/dateUtils';
import logger from '../utils/logger';

/**
 * Cálculo de días de vacaciones por antigüedad (LCT art. 150/151).
 *
 * Período: 1 de octubre al 30 de septiembre (convención del sistema). El corte
 * para calcular antigüedad y días trabajados es el fin del período (30/9).
 *
 * Tabla LCT art. 150 (días hábiles por período completo):
 *   hasta 5 años      → 10
 *   más de 5 a 10     → 15
 *   más de 10 a 20    → 20
 *   más de 20         → 25
 *
 * Proporcional (art. 151): si el empleado trabajó menos de la mitad de los
 * días hábiles del período, le corresponde 1 día cada 20 días hábiles
 * trabajados (redondeo hacia abajo).
 */

/**
 * Años completos entre dos fechas, mirando al aniversario.
 * Ej: ingreso 1/3/2020, corte 30/9/2026 → 6 años.
 */
function fullYearsBetween(start: Date, end: Date): number {
  if (end < start) return 0;

  let years = end.getFullYear() - start.getFullYear();

  // Si el aniversario del ingreso aún no ocurrió en el año del corte, restar 1
  const anniversaryInEndYear = new Date(
    end.getFullYear(),
    start.getMonth(),
    start.getDate()
  );
  if (anniversaryInEndYear > end) years--;

  return Math.max(0, years);
}

/**
 * Cuenta días hábiles (excluye sábados, domingos y feriados del cache)
 * entre dos fechas, inclusive en ambos extremos.
 */
function countBusinessDaysBetween(start: Date, end: Date): number {
  if (end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);

  while (cursor <= stop) {
    if (isBusinessDay(cursor)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

/**
 * Parsea la fecha de ingreso del empleado. Acepta DD/MM/YYYY (formato de la planilla)
 * o YYYY-MM-DD (por las dudas). Devuelve null si no se puede interpretar.
 */
export function parseEmployeeStartDate(raw: string): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const d = parseDate(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  }

  // Fallback a Date parsing
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Calcula los días de vacaciones que le corresponden a un empleado para un período
 * de vacaciones específico (1 oct → 30 sep).
 */
export function calculateCorrespondingDaysForPeriod(
  employeeStartDate: Date,
  period: HolidayPeriod
): CorrespondingDaysResult {
  const cutoff = period.endDate; // 30/9 del año siguiente al inicio del período

  // Si el empleado ingresó después del fin del período → 0 días
  if (employeeStartDate > cutoff) {
    return {
      correspondingDays: 0,
      seniorityYears: 0,
      workedBusinessDays: 0,
      totalBusinessDaysInYear: countBusinessDaysBetween(period.startDate, period.endDate),
      isProportional: true,
      calculationBasedOn: 'Ingresado después del período',
    };
  }

  const seniorityYears = fullYearsBetween(employeeStartDate, cutoff);
  const totalBusinessDays = countBusinessDaysBetween(period.startDate, period.endDate);

  const workedFrom =
    employeeStartDate > period.startDate ? employeeStartDate : period.startDate;
  const workedBusinessDays = countBusinessDaysBetween(workedFrom, period.endDate);

  const isProportional = workedBusinessDays < totalBusinessDays / 2;

  if (isProportional) {
    return {
      correspondingDays: Math.floor(workedBusinessDays / 20),
      seniorityYears,
      workedBusinessDays,
      totalBusinessDaysInYear: totalBusinessDays,
      isProportional: true,
      calculationBasedOn: 'LCT art. 151 (proporcional)',
    };
  }

  const correspondingDays =
    seniorityYears <= 5 ? 10 : seniorityYears <= 10 ? 15 : seniorityYears <= 20 ? 20 : 25;

  return {
    correspondingDays,
    seniorityYears,
    workedBusinessDays,
    totalBusinessDaysInYear: totalBusinessDays,
    isProportional: false,
    calculationBasedOn: 'LCT art. 150',
  };
}

/**
 * Atajo: calcula el saldo del período actual.
 */
export function calculateCurrentPeriodDays(
  employeeStartDate: Date,
  referenceDate: Date = new Date()
): CorrespondingDaysResult {
  return calculateCorrespondingDaysForPeriod(
    employeeStartDate,
    getCurrentPeriod(referenceDate)
  );
}

/**
 * Atajo: calcula el saldo del próximo período.
 */
export function calculateNextPeriodDays(
  employeeStartDate: Date,
  referenceDate: Date = new Date()
): CorrespondingDaysResult {
  return calculateCorrespondingDaysForPeriod(
    employeeStartDate,
    getNextPeriod(referenceDate)
  );
}

/**
 * Loggea de forma visible si un empleado quedó proporcional — útil para que
 * RR. HH. revise ingresos recientes en los logs.
 */
export function logProportionalIfNeeded(
  employeeEmail: string,
  result: CorrespondingDaysResult,
  periodLabel: string
): void {
  if (result.isProportional) {
    logger.info(
      {
        employee: employeeEmail,
        period: periodLabel,
        correspondingDays: result.correspondingDays,
        workedBusinessDays: result.workedBusinessDays,
        totalBusinessDays: result.totalBusinessDaysInYear,
      },
      'Empleado con cálculo proporcional de vacaciones'
    );
  }
}

/**
 * Separa el payload de días del metadata de antigüedad.
 */
function toSeniorityInfo(result: CorrespondingDaysResult): SeniorityInfo {
  return {
    seniorityYears: result.seniorityYears,
    workedBusinessDays: result.workedBusinessDays,
    totalBusinessDaysInYear: result.totalBusinessDaysInYear,
    isProportional: result.isProportional,
    calculationBasedOn: result.calculationBasedOn,
  };
}

/**
 * Enriquece un EmployeeHoliday reemplazando correspondingDays/correspondingDaysNextPeriod
 * con los valores calculados a partir de startDate, y recalculando los daysRemaining*.
 *
 * Si no se puede parsear `startDate`, devuelve el empleado tal cual con un warning
 * en el campo `seniorityWarning` — no rompe para no dejar la planilla ciega.
 */
export function enrichEmployeeWithSeniority(
  employee: EmployeeHoliday,
  referenceDate: Date = new Date()
): EmployeeHoliday {
  const start = parseEmployeeStartDate(employee.startDate);

  if (!start) {
    logger.warn(
      { email: employee.email, rawStartDate: employee.startDate },
      'Empleado sin fecha de ingreso válida — no se pudo calcular antigüedad'
    );
    return {
      ...employee,
      seniorityWarning: 'Fecha de ingreso no definida o inválida — avisar a RR. HH.',
    };
  }

  const current = calculateCurrentPeriodDays(start, referenceDate);
  const next = calculateNextPeriodDays(start, referenceDate);

  logProportionalIfNeeded(employee.email, current, 'current');

  const correspondingDays = current.correspondingDays;
  const correspondingDaysNextPeriod = next.correspondingDays;

  // daysTaken ya está en la planilla; se mantiene. Recalculamos remaining.
  const daysRemaining =
    (employee.carriedOverDays || 0) + correspondingDays - (employee.daysTaken || 0);
  const daysRemainingNextPeriod =
    correspondingDaysNextPeriod - (employee.daysTakenNextPeriod || 0);

  return {
    ...employee,
    correspondingDays,
    correspondingDaysNextPeriod,
    daysRemaining,
    daysRemainingNextPeriod,
    seniority: toSeniorityInfo(current),
    seniorityNextPeriod: toSeniorityInfo(next),
  };
}
