import { reactive } from 'vue';
import { OfficialTasklistApi, OfficialWorkflowlistApi } from '../generated/official-gui-api';
import { myTasksBasePath, toggleCaseFilter, toggleTaskFilter } from '../config';
import { openUpdateStream } from '../api/updateStream';

/** The counts of the header toggle. A count is missing until its first answer arrives. */
export const counts = reactive<{ myTasks?: number; allTasks?: number; cases?: number }>({});

const key = 'toggle';

async function askMyTasks(): Promise<void> {
  const answer = await new OfficialTasklistApi().countUserTasks(
    { userTaskCountsRequest: { filters: [{ key, mode: toggleTaskFilter }] } },
    { baseUrl: myTasksBasePath },
  );
  counts.myTasks = answer.counts[0]?.count;
}

async function askAllTasks(): Promise<void> {
  const answer = await new OfficialTasklistApi().countUserTasks(
    { userTaskCountsRequest: { filters: [{ key, mode: toggleTaskFilter }] } },
  );
  counts.allTasks = answer.counts[0]?.count;
}

async function askCases(): Promise<void> {
  const answer = await new OfficialWorkflowlistApi().countWorkflows(
    { workflowCountsRequest: { filters: [{ key, mode: toggleCaseFilter }] } },
  );
  counts.cases = answer.counts[0]?.count;
}

// A count which cannot be asked keeps its last value; the next reason asks again.
const quietly = (asking: () => Promise<void>): Promise<void> => asking().catch(() => undefined);

export const askUserTaskCountsAgain = (): Promise<unknown> => Promise.all([quietly(askMyTasks), quietly(askAllTasks)]);
export const askCaseCountAgain = (): Promise<void> => quietly(askCases);
export const askAllCountsAgain = (): Promise<unknown> => Promise.all([askUserTaskCountsAgain(), askCaseCountAgain()]);

/**
 * Asks the counts when the application opens, on every event of the update stream of their kind
 * (one event is one delivery, so one request per count) and when the user returns to the tab.
 */
export function keepCountsCurrent(): void {
  void askAllCountsAgain();
  const stream = openUpdateStream();
  stream.addEventListener('UserTask', () => void askUserTaskCountsAgain());
  stream.addEventListener('Workflow', () => void askCaseCountAgain());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void askAllCountsAgain();
  });
}
