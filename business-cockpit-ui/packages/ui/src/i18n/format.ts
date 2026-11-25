// One formatter per language, made once. They follow a switch of the language at runtime.
const numberFormats = new Map<string, Intl.NumberFormat>();

export function formatNumber(value: number, language: string): string {
  if (!numberFormats.has(language)) numberFormats.set(language, new Intl.NumberFormat(language));
  return numberFormats.get(language)!.format(value);
}

const partFormats = new Map<string, Intl.DateTimeFormat>();

function formatPart(value: Date, language: string, kind: 'date' | 'time'): string {
  const key = `${kind}:${language}`;
  if (!partFormats.has(key)) {
    const options: Intl.DateTimeFormatOptions = kind === 'date'
      ? { year: 'numeric', month: '2-digit', day: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' };
    partFormats.set(key, new Intl.DateTimeFormat(language, options));
  }
  return partFormats.get(key)!.format(value);
}

const isToday = (value: Date): boolean => value.toDateString() === new Date().toDateString();

/** What a date cell shows: the date, or the time if the date is today. */
export const dateCellText = (value: Date, language: string): string => formatPart(value, language, isToday(value) ? 'time' : 'date');

/** What the mouse-over of a date cell shows: the other one of the two. */
export const dateCellDetails = (value: Date, language: string): string => formatPart(value, language, isToday(value) ? 'date' : 'time');

/** A date with a time: the localised date, a space and the localised time, never the ISO 8601 form (COL-019). */
export const formatDate = (value: Date, language: string): string => `${formatPart(value, language, 'date')} ${formatPart(value, language, 'time')}`;

const secondsFormats = new Map<string, Intl.DateTimeFormat>();

/** The time of a date with its seconds, for the mouse-over. */
export function formatTimeWithSeconds(value: Date, language: string): string {
  if (!secondsFormats.has(language)) secondsFormats.set(language, new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  return secondsFormats.get(language)!.format(value);
}

/** The localised date of a day. */
export const formatDay = (value: Date, language: string): string => formatPart(value, language, 'date');

/** The localised hour and minute. */
export const formatHourAndMinute = (value: Date, language: string): string => formatPart(value, language, 'time');
