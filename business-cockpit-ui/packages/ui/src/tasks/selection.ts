import type { UserTask } from '../generated/official-gui-api';

export type BulkAction = 'claim' | 'propose' | 'followUp' | 'note' | 'markRead' | 'markUnread';

// one request names at most this many tasks (GUI API)
export const idsPerRequest = 1000;

const hasEnded = (task: UserTask): boolean => Boolean(task.endedAt);
const isSuspended = (task: UserTask): boolean => Boolean(task.suspendedAt && !task.endedAt);

// what a bulk action does with ended and suspended tasks in the selection (ACT-009, ACT-018)
const leavesOutEnded = (action: BulkAction): boolean => action !== 'markRead' && action !== 'markUnread';
const leavesOutSuspended = (action: BulkAction): boolean => action === 'claim' || action === 'propose';
export const asksBeforeLeavingOut = (action: BulkAction): boolean => action === 'claim' || action === 'propose';

export const targetsOf = (action: BulkAction, selected: UserTask[]): UserTask[] =>
  selected.filter((task) => !(leavesOutEnded(action) && hasEnded(task)) && !(leavesOutSuspended(action) && isSuspended(task)));

export const hasTasksToLeaveOut = (action: BulkAction, selected: UserTask[]): boolean => targetsOf(action, selected).length < selected.length;

// claiming takes a task out of a colleague's hands, so the user is asked (ACT-012)
export const heldByOthers = (selected: UserTask[], userId: string): boolean =>
  selected.some((task) => task.assignee !== undefined && task.assignee.id !== userId);

export function chunksOf<T>(items: T[], size: number = idsPerRequest): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}
