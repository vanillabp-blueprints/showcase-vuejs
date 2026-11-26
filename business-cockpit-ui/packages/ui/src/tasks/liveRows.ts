import type { UserTask } from '../generated/official-gui-api';

export type Mark = 'new' | 'changed' | 'removed';

/**
 * The marker of a row: removed from the list, else new, else changed by somebody else (LIVE-001, LIVE-002, LIVE-004).
 * An ended row has the look of its end and no marker. Rows are new or changed when it happened after the list started.
 */
export function markOf(task: UserTask, startedAt: string | undefined, changedByOthers: ReadonlySet<string>, removed: ReadonlySet<string>): Mark | undefined {
  if (removed.has(task.id)) return 'removed';
  if (task.endedAt || !startedAt) return undefined;
  const after = (moment?: string): boolean => moment !== undefined && new Date(moment).getTime() > new Date(startedAt).getTime();
  if (after(task.createdAt)) return 'new';
  return after(task.updatedAt) && changedByOthers.has(task.id) ? 'changed' : undefined;
}

/**
 * The pages read again, with the rows the server no longer returns put back where they stood (LIVE-004). The window must be the
 * same pages as before and in one piece, else the answer is taken as it is. The removed rows count in the total.
 */
export function keepRemovedRows(
  before: ReadonlyMap<number, UserTask[]>,
  after: ReadonlyMap<number, UserTask[]>,
  total: number,
  pageSize: number,
): { pages: Map<number, UserTask[]>; total: number; removed: Set<string> } {
  const numbers = [...after.keys()].sort((a, b) => a - b);
  const sameWindow = numbers.length === before.size && numbers.every((number, index) => before.has(number) && (index === 0 || number === numbers[index - 1]! + 1));
  if (!sameWindow || numbers.length === 0) return { pages: new Map(after), total, removed: new Set() };
  const rows = numbers.flatMap((number) => after.get(number)!);
  const returned = new Set(rows.map((row) => row.id));
  const removed = new Set<string>();
  numbers.flatMap((number) => before.get(number)!).forEach((row, index) => {
    if (returned.has(row.id)) return;
    removed.add(row.id);
    rows.splice(Math.min(index, rows.length), 0, row);
  });
  const pages = new Map(numbers.map((number, index) => [number, rows.slice(index * pageSize, (index + 1) * pageSize)] as const));
  return { pages, total: total + removed.size, removed };
}
