/**
 * Date utility functions for calculating business days
 * Excludes weekends and Argentine national holidays
 */

/**
 * Argentine national holidays for 2025-2026
 * Format: MM-DD
 * Note: Some holidays may be moved to create long weekends ("feriados puente")
 */
const ARGENTINE_HOLIDAYS_2025: string[] = [
  '01-01', // Año Nuevo
  '02-24', // Carnaval
  '02-25', // Carnaval
  '03-24', // Día Nacional de la Memoria por la Verdad y la Justicia
  '04-02', // Día del Veterano y de los Caídos en la Guerra de Malvinas
  '04-18', // Viernes Santo
  '05-01', // Día del Trabajador
  '05-25', // Día de la Revolución de Mayo
  '06-16', // Paso a la Inmortalidad del General Don Martín Miguel de Güemes
  '06-20', // Paso a la Inmortalidad del General Manuel Belgrano
  '07-09', // Día de la Independencia
  '08-17', // Paso a la Inmortalidad del General José de San Martín (movido)
  '10-12', // Día del Respeto a la Diversidad Cultural (movido)
  '11-24', // Día de la Soberanía Nacional (movido)
  '12-08', // Inmaculada Concepción de María
  '12-25', // Navidad
];

const ARGENTINE_HOLIDAYS_2026: string[] = [
  '01-01', // Año Nuevo
  '02-16', // Carnaval
  '02-17', // Carnaval
  '03-24', // Día Nacional de la Memoria por la Verdad y la Justicia
  '04-02', // Día del Veterano y de los Caídos en la Guerra de Malvinas
  '04-03', // Viernes Santo
  '05-01', // Día del Trabajador
  '05-25', // Día de la Revolución de Mayo
  '06-15', // Paso a la Inmortalidad del General Don Martín Miguel de Güemes (movido)
  '06-20', // Paso a la Inmortalidad del General Manuel Belgrano (movido)
  '07-09', // Día de la Independencia
  '08-17', // Paso a la Inmortalidad del General José de San Martín
  '10-12', // Día del Respeto a la Diversidad Cultural
  '11-23', // Día de la Soberanía Nacional (movido)
  '12-08', // Inmaculada Concepción de María
  '12-25', // Navidad
];

/**
 * Parse date string in DD/MM/YYYY format to Date object
 */
export function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format Date object to DD/MM/YYYY string
 */
export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format Date object to ISO string for timestamps
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString();
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Get the list of holidays for a given year
 */
function getHolidaysForYear(year: number): string[] {
  if (year === 2025) return ARGENTINE_HOLIDAYS_2025;
  if (year === 2026) return ARGENTINE_HOLIDAYS_2026;
  // For other years, return an empty array or implement dynamic holiday calculation
  return [];
}

/**
 * Check if a date is an Argentine national holiday
 */
export function isArgentineHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateKey = `${month}-${day}`;

  const holidays = getHolidaysForYear(year);
  return holidays.includes(dateKey);
}

/**
 * Check if a date is a business day (not weekend, not holiday)
 */
export function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isArgentineHoliday(date);
}

/**
 * Calculate the number of business days between two dates (inclusive)
 * Excludes weekends and Argentine national holidays
 *
 * @param startDateStr - Start date in DD/MM/YYYY format
 * @param endDateStr - End date in DD/MM/YYYY format
 * @returns Number of business days
 */
export function calculateBusinessDays(startDateStr: string, endDateStr: string): number {
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);

  // Validate dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('Invalid date format. Use DD/MM/YYYY');
  }

  if (endDate < startDate) {
    throw new Error('End date must be after start date');
  }

  let businessDays = 0;
  const currentDate = new Date(startDate);

  // Iterate through each day in the range
  while (currentDate <= endDate) {
    if (isBusinessDay(currentDate)) {
      businessDays++;
    }
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return businessDays;
}

/**
 * Validate date format (DD/MM/YYYY)
 */
export function isValidDateFormat(dateStr: string): boolean {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(dateStr)) {
    return false;
  }

  const date = parseDate(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Check if date range is valid (start before end, both in future or present)
 */
export function isValidDateRange(startDateStr: string, endDateStr: string): boolean {
  if (!isValidDateFormat(startDateStr) || !isValidDateFormat(endDateStr)) {
    return false;
  }

  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);

  return endDate >= startDate;
}

/**
 * Add business days to a date (skip weekends and holidays)
 */
export function addBusinessDays(startDateStr: string, daysToAdd: number): string {
  const date = parseDate(startDateStr);
  let addedDays = 0;

  while (addedDays < daysToAdd) {
    date.setDate(date.getDate() + 1);
    if (isBusinessDay(date)) {
      addedDays++;
    }
  }

  return formatDate(date);
}

/**
 * Holiday Period Management
 * Periods run from October 1st to September 30th of the following year
 */

export interface HolidayPeriod {
  startDate: Date;
  endDate: Date;
  year: number; // The starting year of the period
}

/**
 * Get the current holiday period based on today's date
 * Period runs from October 1st to September 30th
 */
export function getCurrentPeriod(referenceDate: Date = new Date()): HolidayPeriod {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth(); // 0-indexed

  // If we're between October and December, the current period started this year
  // If we're between January and September, the current period started last year
  const periodStartYear = month >= 9 ? year : year - 1; // 9 = October (0-indexed)

  return {
    startDate: new Date(periodStartYear, 9, 1), // October 1st
    endDate: new Date(periodStartYear + 1, 8, 30), // September 30th of next year
    year: periodStartYear,
  };
}

/**
 * Get the next holiday period
 */
export function getNextPeriod(referenceDate: Date = new Date()): HolidayPeriod {
  const currentPeriod = getCurrentPeriod(referenceDate);
  const nextYear = currentPeriod.year + 1;

  return {
    startDate: new Date(nextYear, 9, 1), // October 1st
    endDate: new Date(nextYear + 1, 8, 30), // September 30th
    year: nextYear,
  };
}

/**
 * Determine which period a date falls into
 * Returns 'current', 'next', or 'other'
 */
export function determinePeriod(
  date: Date,
  referenceDate: Date = new Date()
): 'current' | 'next' | 'other' {
  const currentPeriod = getCurrentPeriod(referenceDate);
  const nextPeriod = getNextPeriod(referenceDate);

  if (date >= currentPeriod.startDate && date <= currentPeriod.endDate) {
    return 'current';
  }

  if (date >= nextPeriod.startDate && date <= nextPeriod.endDate) {
    return 'next';
  }

  return 'other';
}

/**
 * Split a date range into current and next period segments
 * Returns the number of business days in each period
 */
export interface PeriodSplit {
  currentPeriodDays: number;
  nextPeriodDays: number;
  otherPeriodDays: number;
}

export function splitDateRangeByPeriod(
  startDateStr: string,
  endDateStr: string,
  referenceDate: Date = new Date()
): PeriodSplit {
  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);

  let currentPeriodDays = 0;
  let nextPeriodDays = 0;
  let otherPeriodDays = 0;

  const currentDate = new Date(startDate);

  // Iterate through each day in the range
  while (currentDate <= endDate) {
    if (isBusinessDay(currentDate)) {
      const period = determinePeriod(currentDate, referenceDate);

      if (period === 'current') {
        currentPeriodDays++;
      } else if (period === 'next') {
        nextPeriodDays++;
      } else {
        otherPeriodDays++;
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    currentPeriodDays,
    nextPeriodDays,
    otherPeriodDays,
  };
}
