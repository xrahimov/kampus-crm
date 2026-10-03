/** "YYYY-MM-DD" → a local-time Date at midnight, so formatting never shifts the day. */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
