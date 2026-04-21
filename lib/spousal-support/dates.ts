const MS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000;

/**
 * Decimal years between two ISO date strings (YYYY-MM-DD).
 * Floors at 0. Uses 365.2425 days/year to account for leap years on average.
 *
 * Precision is well within SSAG tolerances (ranges are usually reported to
 * 0.5-year resolution).
 */
export function yearsBetween(startISO: string, endISO: string): number {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (isNaN(start) || isNaN(end)) return 0;
  return Math.max(0, (end - start) / MS_PER_YEAR);
}
