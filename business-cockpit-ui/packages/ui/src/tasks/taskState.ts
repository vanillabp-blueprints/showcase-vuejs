import type { UserTask } from '../generated/official-gui-api';

export type TaskState = 'active' | 'completed' | 'cancelled' | 'suspended';

// endedAt decides before suspendedAt, so a task cancelled while suspended looks cancelled (TL-023)
export function stateOf(task: Pick<UserTask, 'endedAt' | 'endReason' | 'suspendedAt'>): TaskState {
  if (task.endedAt) return task.endReason === 'CANCELLED' ? 'cancelled' : 'completed';
  return task.suspendedAt ? 'suspended' : 'active';
}

// Q-CLAIM = hard: a task is worked on only by the user who holds it
const CLAIM_IS_HARD = true;

export type Barrier = 'suspended' | 'claim';

/** What keeps the user from the form of an open task: the suspension first, then a claim which has not been made (TF-035, TF-043); an ended task has none. */
export function barrierOf(task: UserTask | undefined, currentUserId: string): Barrier | undefined {
  if (!task || task.endedAt) return undefined;
  if (task.suspendedAt) return 'suspended';
  return CLAIM_IS_HARD && task.assignee?.id !== currentUserId ? 'claim' : undefined;
}
