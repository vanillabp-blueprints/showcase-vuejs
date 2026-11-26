import { languages, messagesOf, text, type Language } from './i18n/messages';

export type Page = 'allTasks' | 'myTasks' | 'cases' | 'case' | 'task' | 'none';

/** Every path of the interview works in every language, so the page is found in the paths of all languages. */
export function pageOf(pathname: string): Page {
  for (const code of languages) {
    const routes = messagesOf(code).routes;
    if (pathname === routes.allTasks) return 'allTasks';
    if (pathname === routes.myTasks) return 'myTasks';
    if (pathname === routes.cases) return 'cases';
  }
  if (caseIdOf(pathname) !== undefined) return 'case';
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

/** The address of the page of one case, in the language in use. */
export const caseAddress = (id: string): string => `${text().routes.case}/${encodeURIComponent(id)}`;

/** The id of the case whose page the address names, in the path of any language; `undefined` for another address. */
export function caseIdOf(pathname: string): string | undefined {
  for (const code of languages) {
    const prefix = `${messagesOf(code).routes.case}/`;
    if (pathname.startsWith(prefix) && pathname.length > prefix.length && !pathname.slice(prefix.length).includes('/')) {
      return decodeURIComponent(pathname.slice(prefix.length));
    }
  }
  return undefined;
}

const pagesOfOnePath = ['allTasks', 'myTasks', 'cases', 'notifications'] as const;
const pagesWithAnId = ['task', 'case'] as const;

/** The same screen in the path of another language; an address which is no screen of ours stays as it is. */
export function pathInLanguage(pathname: string, to: Language): string {
  const target = messagesOf(to).routes;
  for (const from of languages) {
    const routes = messagesOf(from).routes;
    for (const page of pagesOfOnePath) if (pathname === routes[page]) return target[page];
    for (const page of pagesWithAnId) {
      if (pathname.startsWith(`${routes[page]}/`)) return `${target[page]}${pathname.slice(routes[page].length)}`;
    }
  }
  return pathname;
}

/** Puts the path of the language into the address bar, keeping query and fragment, without a new entry in the history. */
export function replaceAddressWithLanguage(to: Language): void {
  const { pathname, search, hash } = window.location;
  const replaced = pathInLanguage(pathname, to);
  if (replaced !== pathname) window.history.replaceState(window.history.state, '', replaced + search + hash);
}
