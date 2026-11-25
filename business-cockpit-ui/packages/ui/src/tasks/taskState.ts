import type { UserTask } from '../generated/official-gui-api';

export type TaskState = 'active' | 'completed' | 'cancelled' | 'suspended';

// endedAt decides before suspendedAt, so a task cancelled while suspended looks cancelled (TL-023)
export function stateOf(task: UserTask): TaskState {
  if (task.endedAt) return task.endReason === 'CANCELLED' ? 'cancelled' : 'completed';
  return task.suspendedAt ? 'suspended' : 'active';
}
