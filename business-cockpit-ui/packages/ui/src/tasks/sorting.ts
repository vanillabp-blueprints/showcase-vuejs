import type { Language } from '../i18n/messages';

/** The columns of the task list the user can sort by (SRCH-009); the icon column of the candidates cannot. */
const sortableColumns = ['id', 'businessId', 'caseKind', 'title', 'dueDate', 'assignee', 'note', 'followUpDate', 'endedAt'];
export const isSortable = (column: string): boolean => sortableColumns.includes(column);

export type Sort = { column: string; ascending: boolean };

/** A click sorts ascending, a second click descending, a third goes back to the default order of the list (SRCH-007). */
export function nextSort(current: Sort | undefined, column: string): Sort | undefined {
  if (current?.column !== column) return { column, ascending: true };
  return current.ascending ? { column, ascending: false } : undefined;
}

const fieldOf: Record<string, string> = { caseKind: 'workflowTitle' };
const translatable = ['title', 'caseKind'];
export const sortsByLanguage = (column: string): boolean => translatable.includes(column);
const persons = ['assignee'];

/** What is sent as `sort` depends on the type of the column (SRCH-008): a translatable text by language, a person by `sort` and `id`. */
export function sortPathOf(column: string, language: Language): string {
  const path = fieldOf[column] ?? column;
  if (translatable.includes(column)) return `${path}.${language}`;
  if (persons.includes(column)) return `${path}.sort,${path}.id`;
  return path;
}
