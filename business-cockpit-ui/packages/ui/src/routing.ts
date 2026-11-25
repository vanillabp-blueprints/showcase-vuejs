import { languages, messagesOf, text } from './i18n/messages';

export type Page = 'allTasks' | 'myTasks' | 'cases' | 'task' | 'none';

/** Every path of the interview works in every language, so the page is found in the paths of all languages. */
export function pageOf(pathname: string): Page {
  for (const code of languages) {
    const routes = messagesOf(code).routes;
    if (pathname === routes.allTasks) return 'allTasks';
    if (pathname === routes.myTasks) return 'myTasks';
    if (pathname === routes.cases) return 'cases';
  }
  return taskIdOf(pathname) === undefined ? 'none' : 'task';
}

/** The address of the page of one task, in the language in use. */
export const taskAddress = (id: string): string => `${text().routes.task}/${encodeURIComponent(id)}`;

/** The id of the task whose page the address names, in the path of any language; `undefined` for another address. */
export function taskIdOf(pathname: string): string | undefined {
  for (const code of languages) {
    const prefix = `${messagesOf(code).routes.task}/`;
    if (pathname.startsWith(prefix) && pathname.length > prefix.length && !pathname.slice(prefix.length).includes('/')) {
      return decodeURIComponent(pathname.slice(prefix.length));
    }
  }
  return undefined;
}
