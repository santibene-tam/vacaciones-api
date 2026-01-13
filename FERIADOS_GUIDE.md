# Feriados (Festive Days) Configuration Guide

## Overview

Feriados are now managed through Google Sheets instead of hardcoded arrays. This allows you to update festive days without rebuilding the application.

## Google Sheets Structure

### Creating Feriados Sheets

For each year you want to support, create a new sheet tab in your existing Google Sheets spreadsheet with the following naming convention:

**Tab Name Format**: `Feriados YYYY` (e.g., "Feriados 2025", "Feriados 2026")

### Sheet Structure

Each feriados sheet should have the following structure:

| Column A | Column B |
|----------|----------|
| Date (YYYY-MM-DD) | Description |

**Example:**

| Date | Description |
|------|-------------|
| 2025-01-01 | Año Nuevo |
| 2025-02-24 | Carnaval |
| 2025-02-25 | Carnaval |
| 2025-03-24 | Día Nacional de la Memoria por la Verdad y la Justicia |
| 2025-04-02 | Día del Veterano y de los Caídos en la Guerra de Malvinas |
| 2025-04-18 | Viernes Santo |

### Important Notes

1. **Header Row**: Row 1 should contain headers (Date, Description). Data starts from row 2.
2. **Date Format**: Must be in `YYYY-MM-DD` format (e.g., "2025-12-25")
3. **Consistency**: Ensure dates are entered correctly to avoid calculation errors
4. **Movable Holidays**: Update dates for holidays that change each year (e.g., Carnival, Easter)

## Adding New Years

To add support for a new year:

1. Create a new sheet tab named `Feriados YYYY` (replace YYYY with the year)
2. Add the header row: `Date` in column A, `Description` in column B
3. Fill in all festive days for that year with correct dates and descriptions
4. The backend will automatically load this data on server restart
5. Frontend will automatically fetch and cache the data

## How It Works

### Backend

- On server startup, the backend loads feriados from Google Sheets for the current year ± 2 years
- Feriados are cached in memory for fast lookups
- The `/api/feriados` endpoint serves feriados to the frontend
- Date calculations use the cached feriados to determine business days

### Frontend

- On app load, the frontend fetches feriados from the backend API
- Feriados are cached in both memory and session storage (valid for 24 hours)
- The holiday request modal uses these feriados to calculate business days correctly

## Maintenance

### Regular Updates

- **Annual Task**: Before each new year, create a new feriados sheet tab for the upcoming year
- **Movable Holidays**: Update dates for holidays that change position (typically Carnival and Easter)
- **Government Changes**: Update if the government announces changes to festive days

### Refreshing Data

- **Backend**: Restart the API server to reload feriados from Google Sheets
- **Frontend**: Clear browser cache or session storage to force re-fetch of feriados

## Troubleshooting

### Backend Not Loading Feriados

- Check server logs for errors during startup
- Verify the sheet tab names follow the exact format: `Feriados YYYY`
- Ensure the Google Sheets service account has read access to the spreadsheet
- Verify date format is exactly `YYYY-MM-DD`

### Frontend Not Displaying Correct Business Days

- Check browser console for errors fetching `/api/feriados`
- Clear session storage and reload the page
- Verify the backend is running and accessible

### Adding Historical Years

If you need to support years in the past (e.g., for historical reports):
1. Create sheets for those years following the same format
2. Increase the `yearRange` parameter in the backend initialization if needed (currently set to 2)

## API Reference

### GET `/api/feriados`

Fetch feriados from the backend.

**Query Parameters:**
- `years` (optional): Number of years before/after current year to fetch (default: 2, max: 10)

**Example Request:**
```bash
curl http://localhost:3001/api/feriados?years=3
```

**Example Response:**
```json
[
  {
    "year": 2025,
    "date": "2025-01-01",
    "description": "Año Nuevo"
  },
  {
    "year": 2025,
    "date": "2025-12-25",
    "description": "Navidad"
  }
]
```
