const twoDigits = (value: number): string => String(value).padStart(2, '0');

/** The moment a task comes back: 00:00 of the chosen day in the time zone of the browser, ISO 8601 with its offset. */
export function startOfDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const start = new Date(year, month - 1, date, 0, 0, 0);
  const offset = -start.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const zone = `${sign}${twoDigits(Math.floor(Math.abs(offset) / 60))}:${twoDigits(Math.abs(offset) % 60)}`;
  return `${day}T00:00:00${zone}`;
}

/** The day of a follow-up date in the time zone of the browser, as an input of type date wants it. */
export function dayOf(timestamp: string): string {
  const moment = new Date(timestamp);
  return `${moment.getFullYear()}-${twoDigits(moment.getMonth() + 1)}-${twoDigits(moment.getDate())}`;
}
