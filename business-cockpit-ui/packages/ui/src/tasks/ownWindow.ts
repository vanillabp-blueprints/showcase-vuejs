import { pageOf } from '../routing';

/** The name of the window which shows a list, so a task tab can find it again (TF-007, TF-018). */
export const LIST_WINDOW = 'bc-list';

// the same channel as the tabs use to tell a changed task (ACT-019); a message with `question` or `list` is about the lists
const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('bc-cockpit');
const ANSWER_WAIT_MS = 300;

/** A click on the title of a task opens the task in a tab of its own, which keeps `window.opener` so the task tab can bring the list back. */
export function openInOwnTab(address: string): void {
  window.name = LIST_WINDOW;
  window.open(address);
}

/** A list page answers the question of a task tab with its visibility (TF-045); returns the function which stops answering. */
export function answerListQuestions(): () => void {
  if (!channel) return () => undefined;
  const asked = (event: MessageEvent<{ question?: string }>) => {
    if (event.data?.question === 'list') channel.postMessage({ list: true, visibility: document.visibilityState });
  };
  channel.addEventListener('message', asked);
  return () => channel.removeEventListener('message', asked);
}

const isListWindow = (other: Window): boolean => {
  try { return other.location.origin === window.location.origin && ['allTasks', 'myTasks'].includes(pageOf(other.location.pathname)); } catch { return false; }
};

const aListAnswers = (): Promise<boolean> => new Promise((resolve) => {
  if (!channel) { resolve(false); return; }
  const answered = (event: MessageEvent<{ list?: boolean }>) => { if (event.data?.list) done(true); };
  const done = (answer: boolean) => { clearTimeout(timer); channel.removeEventListener('message', answered); resolve(answer); };
  const timer = setTimeout(() => done(false), ANSWER_WAIT_MS);
  channel.addEventListener('message', answered);
  channel.postMessage({ question: 'list' });
});

/** Brings the list to the front: the opener when it still shows a list, else the window of the name when a list answers. Tells whether a list was found. */
export async function bringListToFront(): Promise<boolean> {
  const opener = window.opener as Window | null;
  if (opener && !opener.closed && isListWindow(opener)) { opener.focus(); return true; }
  if (!(await aListAnswers())) return false;
  window.open('', LIST_WINDOW);
  return true;
}
