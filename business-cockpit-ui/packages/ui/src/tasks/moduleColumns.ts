import type { Column } from '@acme/bc-types';
import { formatDate, formatDay, formatHourAndMinute, formatNumber, formatTimeWithSeconds } from '../i18n/format';
import { pickTranslation } from '../i18n/translatable';
import type { ColumnsOfRow } from '../modules/modules';

/** The columns of the rows in the window: the rows in window order, each with what its module answered (a row not asked yet has none). */
export function mergeColumns(answers: (ColumnsOfRow | undefined)[]): Column[] {
  const byPath = new Map<string, Column>();
  for (const answer of answers) {
    if (!answer || 'failed' in answer) continue;
    for (const column of answer.columns) if (!byPath.has(column.path)) byPath.set(column.path, column);
  }
  // `sort` is stable, so columns with the same priority stay in the order of their first row
  return [...byPath.values()].filter((column) => column.show).sort((a, b) => a.priority - b.priority);
}

const valueAt = (row: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined), row);

export interface Cell {
  /** `text` is shown as it is; `number` is split at the decimal mark so that the marks of a column line up. */
  kind: 'text' | 'number' | 'needs-a-type';
  text: string;
  integer?: string;
  fraction?: string;
  align: 'left' | 'right';
  /** What the mouse-over shows, if there is more to show. */
  details?: string;
}

const empty: Cell = { kind: 'text', text: '', align: 'left' };

/** What one cell shows, in the language of the user interface. `yes` and `no` are the words for a boolean. */
export function cellOf(row: unknown, column: Column, language: string, words: { yes: string; no: string }): Cell {
  const value = valueAt(row, column.path);
  if (value === undefined || value === null) return empty;
  if (column.type === 'i18n') return { kind: 'text', text: pickTranslation(value as Record<string, string>, language), align: 'left' };
  if (column.type === 'person') return personCell(value as { id?: string; display?: string; displayShort?: string; email?: string });
  if (column.type === 'date' && typeof value === 'string') return { kind: 'text', text: formatDay(dayOf(value), language), align: 'left' };
  if (column.type === 'date-time' && typeof value === 'string') {
    const moment = new Date(value);
    return { kind: 'text', text: formatDate(moment, language), details: formatTimeWithSeconds(moment, language), align: 'left' };
  }
  if (column.type === 'time' && typeof value === 'string') return timeCell(value, language);
  if (typeof value === 'object') return { kind: 'needs-a-type', text: '', align: 'left' };
  if (typeof value === 'boolean') return { kind: 'text', text: value ? words.yes : words.no, align: 'right' };
  if (typeof value === 'number') return numberCell(value, language);
  return { kind: 'text', text: String(value), align: 'left' };
}

/** A date without a time is a day, not a moment: it must not shift with the time zone. */
const dayOf = (value: string): Date => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year!, month! - 1, day);
};

function personCell(person: { id?: string; display?: string; displayShort?: string; email?: string }): Cell {
  const details = [person.display, person.id, person.email].filter(Boolean).join('\n');
  return { kind: 'text', text: person.displayShort ?? person.email ?? person.id ?? '', details: details || undefined, align: 'left' };
}

function timeCell(value: string, language: string): Cell {
  const [hours, minutes, seconds] = value.split(':').map(Number);
  const moment = new Date(2000, 0, 1, hours ?? 0, minutes ?? 0, seconds ?? 0);
  return { kind: 'text', text: formatHourAndMinute(moment, language), details: seconds === undefined ? undefined : formatTimeWithSeconds(moment, language), align: 'left' };
}

function numberCell(value: number, language: string): Cell {
  const text = formatNumber(value, language);
  // the decimal mark of the language is the part of the formatted number between the integer and the fraction digits
  const mark = new Intl.NumberFormat(language).formatToParts(value).find((part) => part.type === 'decimal')?.value;
  const at = mark ? text.lastIndexOf(mark) : -1;
  return at < 0
    ? { kind: 'number', text, integer: text, fraction: '', align: 'right' }
    : { kind: 'number', text, integer: text.slice(0, at), fraction: text.slice(at), align: 'right' };
}

/** The most digits any decimal number of the column has after the decimal mark, so the marks can line up. */
export const fractionDigits = (cells: Cell[]): number => cells.reduce((most, cell) => Math.max(most, (cell.fraction?.length ?? 1) - 1), 0);
