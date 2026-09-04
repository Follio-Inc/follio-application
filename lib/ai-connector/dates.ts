/**
 * Parse dates coming from AI tools. Models often send YYYY-MM or "Jan 2024"
 * instead of a full ISO timestamp.
 */
export function parseFlexibleDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}-01-01T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}-01T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function requireFlexibleDate(value: string | Date, fieldName: string): Date {
  const parsed = parseFlexibleDate(value);
  if (!parsed) {
    throw new Error(`${fieldName} is not a valid date. Use YYYY-MM or YYYY-MM-DD.`);
  }
  return parsed;
}
