import { Request, Response } from 'express';
import googleSheetsService from '../services/googleSheets.service';
import logger from '../utils/logger';

/**
 * Get feriados (festive days) from Google Sheets
 * Query params:
 * - years: number of years before/after current year to fetch (default: 2)
 */
export async function getFeriados(req: Request, res: Response): Promise<void> {
  try {
    const yearRange = parseInt(req.query.years as string) || 2;

    // Validate yearRange
    if (yearRange < 0 || yearRange > 10) {
      res.status(400).json({ error: 'Year range must be between 0 and 10' });
      return;
    }

    const feriados = await googleSheetsService.getAllFeriados(yearRange);

    logger.info(
      { yearRange, count: feriados.length },
      'Feriados fetched successfully'
    );

    res.json(feriados);
  } catch (error) {
    logger.error({ error }, 'Error fetching feriados');
    res.status(500).json({
      error: 'Failed to fetch feriados',
      details: (error as Error).message,
    });
  }
}
