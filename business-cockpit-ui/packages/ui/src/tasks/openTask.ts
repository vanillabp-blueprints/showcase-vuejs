import { ref, shallowRef } from 'vue';
import { OfficialTasklistApi, type UserTask } from '../generated/official-gui-api';

/** The task the page shows, as the server answered last; the header and the page read it. */
export const openTask = shallowRef<UserTask>();
export const openTaskFailed = ref(false);

/** Loads the task; opening it marks it as read, so a reload after an action does not. */
export async function loadTask(userTaskId: string, markAsRead: boolean): Promise<void> {
  try {
    openTask.value = await new OfficialTasklistApi().getUserTask({ userTaskId, markAsRead });
    openTaskFailed.value = false;
  } catch {
    openTaskFailed.value = true;
  }
}

// The tabs of the cockpit tell each other which task changed, so a list in another tab reads its rows again
// without waiting for the update stream (ACT-019).
const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('bc-cockpit');

export const tellTaskChanged = (userTaskId: string): void => channel?.postMessage({ userTaskId });

/** Calls `listener` with the id of each task another tab changed; returns the function which stops it. */
export function onTaskChangedInAnotherTab(listener: (userTaskId: string) => void): () => void {
  const received = (event: MessageEvent<{ userTaskId?: string }>) => { if (event.data?.userTaskId) listener(event.data.userTaskId); };
  channel?.addEventListener('message', received);
  return () => channel?.removeEventListener('message', received);
}
