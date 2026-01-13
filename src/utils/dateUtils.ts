/**
 * Date utility functions for calculating business days
 * Excludes weekends and Argentine national holidays
 */

import googleSheetsService from '../services/googleSheets.service';
import logger from './logger';

/**
 * In-memory cache of feriados indexed by date (YYYY-MM-DD)
 * This is populated on server startup via loadFeriados()
 */
let feriadosCache: Set<string> = new Set();

/**
 * Load feriados from Google Sheets into memory cache
 * This should be called on server startup
 * @param yearRange - Number of years before/after current year to load (default: 2)
 */
export async function loadFeriados(yearRange: number = 2): Promise<void> {
  try {
    logger.info({ yearRange }, 'Loading feriados from Google Sheets');
    const feriados = await googleSheetsService.getAllFeriados(yearRange);

    // Clear existing cache
    feriadosCache.clear();

    // Populate cache with YYYY-MM-DD formatted dates
    feriados.forEach((feriado) => {
      feriadosCache.add(feriado.date);
    });

    logger.info(
      { count: feriadosCache.size, yearRange },
      'Successfully loaded feriados into cache'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to load feriados - continuing with empty cache');
    // Continue running even if feriados fail to load
    feriadosCache.clear();
  }
}

/**
 * Refresh feriados cache (can be called periodically if needed)
 */
export async function refreshFeriados(yearRange: number = 2): Promise<void> {
  await loadFeriados(yearRange);
}

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
 * Check if a date is an Argentine national holiday
 * Uses the in-memory cache populated by loadFeriados()
 */
export function isArgentineHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateKey = `${year}-${month}-${day}`;

  return feriadosCache.has(dateKey);
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
