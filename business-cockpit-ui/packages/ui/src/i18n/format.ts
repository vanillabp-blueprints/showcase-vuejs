// One formatter per language, made once. They follow a switch of the language at runtime.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export function formatNumber(value: number, language: string): string {
  if (!numberFormats.has(language)) numberFormats.set(language, new Intl.NumberFormat(language));
  return numberFormats.get(language)!.format(value);
}

export function formatDate(value: Date, language: string): string {
  if (!dateFormats.has(language)) {
    dateFormats.set(language, new Intl.DateTimeFormat(language, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
  }
  return dateFormats.get(language)!.format(value);
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
