// What every dev shell shares, whatever the framework of the module: the client of the GUI API, the layout of the task
// page and the case page, and the drawing of a part. A dev shell supplies only how its framework builds a web component.
import { ACTIONS, ERROR_CODES, REQUEST_EVENT, RESPONSE_EVENT, type BcElementDescriptor, type BcNotification, type BcRequestDetail, type BcResponseDetail } from '@acme/bc-types';
import { defineBcElement, type BcProps } from './define-element.js';
import { ActionFailed, createPage, type MessagePage as Page } from './page.js';
import { toast } from './toast.js';

export interface DevShellEntry { id: string; title?: Record<string, string> }
export interface DevShellUser { id: string; name: string }
export class DevShellNotAllowed extends Error {}

/** One block of the drop-down: its entries, and whether the server has more blocks behind it. */
export interface DevShellBlock { entries: DevShellEntry[]; more: boolean }
/** The drop-down loads its entries in blocks of 20 (dev-shell.md). */
export const DEV_SHELL_BLOCK_SIZE = 20;

/** The settings of the dev shell live in memory only: the simulator has no settings, and the dev shell stores nothing in the browser. */
export function createDevShellSettings() {
  const values = new Map<string, unknown>();
  return {
    read: <T = unknown>(key: string): T | undefined => values.get(key) as T | undefined,
    write: (key: string, value: unknown): void => { values.set(key, value); },
  };
}
const LANGUAGE_SETTING = 'bc:language';
const MODULE_SETTING = 'bc:workflow-module';

/** What every part gets besides its data: the user chosen and the language chosen. */
export interface DevShellContext { user: string; language: string; currentUser?: { id: string } }
export const DEV_SHELL_DEFAULT_LANGUAGE = 'en';

export type DevShellDataFunction = (data: Record<string, unknown> | undefined, area: string) => BcElementDescriptor | undefined | Promise<BcElementDescriptor | undefined>;

/** What a framework's dev shell hands the shell: how a component is drawn into the shadow root and updated. */
export interface DevShellRenderer<Component> {
  /** Draws the component, with the props, into a new element of the shadow root; returns what is needed to update and stop it. */
  draw(target: HTMLElement, component: Component, props: Record<string, unknown>): { update(props: Record<string, unknown>): void; stop(): void };
}

/** A page only the dev shell shows (dev-shell.md, "Pages of the dev shell"): a short id, a title per language, a framework component. */
export interface DevShellPage<Component> { id: string; title: Record<string, string>; component: Component }
/** The columns a module returns for one row of a list (types.md, Column), as far as the dev shell shows them. */
export interface DevShellColumn { title: Partial<Record<string, string>>; path: string; type?: 'value' | 'i18n' | 'person' | 'date' | 'date-time' | 'time' }
export type DevShellColumnsFunction = (row: any) => DevShellColumn[] | undefined;

/** Why a list of dev shell pages is refused, or undefined if it is fine: an id twice, or an id which is not a short name. */
export function devShellPagesNote(pages: DevShellPage<unknown>[]): string | undefined {
  const seen = new Set<string>();
  for (const { id } of pages) {
    if (!/^[a-z0-9-]+$/.test(id)) return `devShellPages: the id "${id}" is not a short name, it may hold only lower case letters, digits and "-".`;
    if (seen.has(id)) return `devShellPages: the id "${id}" is there twice, every page needs an id of its own.`;
    seen.add(id);
  }
  return undefined;
}

export interface DevShellCoreOptions<Component> {
  /** The address of the GUI API, the one the simulator of the dev shell maps to the cockpit paths. */
  guiApiBase: string;
  workflowModuleId: string;
  userTaskForm?: (userTask: any, area: string) => BcElementDescriptor | undefined;
  workflowPage?: (workflow: any, area: string) => BcElementDescriptor | undefined;
  /** The extension point `Header`: asked with the user chosen, answers the buttons of the header. */
  header?: (currentUser: { id: string }) => BcElementDescriptor[] | undefined;
  /** Pages only the dev shell shows, at `#/dev-shell-pages/<id>`; drawn by the dev shell itself, not in a host element. */
  devShellPages?: DevShellPage<Component>[];
  /** The data entries `UserTaskList` and `WorkflowList`: the columns of a row, shown at `#/columns`. */
  userTaskListColumns?: DevShellColumnsFunction;
  workflowListColumns?: DevShellColumnsFunction;
  /** The components by web component name, imported from their source files. */
  components: Record<string, Component>;
  /** The text of the style the module's web components write into their shadow roots. */
  style?: string;
}

export function createDevShellApi(guiApiBase: string) {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(path, init);
    if (response.status === 401) throw new DevShellNotAllowed('no user is chosen');
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    return (await response.json()) as T;
  };
  const list = async (kind: 'usertask' | 'workflow', pageNumber: number, search: string): Promise<DevShellBlock> => {
    // the drop-down asks with the primary filter All, newest first, a block of 20 at a time, searched by name (dev-shell.md)
    const body = JSON.stringify({
      mode: 'All', pageNumber, pageSize: DEV_SHELL_BLOCK_SIZE, sort: 'createdAt', sortAscending: false,
      ...(search ? { searchQueries: [{ path: 'title', query: search, caseInsensitive: true }] } : {}),
    });
    const answer = await call<{ page?: { number: number; totalPages: number }; userTasks?: DevShellEntry[]; workflows?: DevShellEntry[] }>(
      `${guiApiBase}/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    return { entries: (kind === 'usertask' ? answer.userTasks : answer.workflows) ?? [], more: answer.page ? answer.page.number + 1 < answer.page.totalPages : false };
  };
  return {
    userTasks: (pageNumber = 0, search = '') => list('usertask', pageNumber, search),
    workflows: (pageNumber = 0, search = '') => list('workflow', pageNumber, search),
    userTask: (id: string) => call<Record<string, unknown>>(`${guiApiBase}/usertask/${encodeURIComponent(id)}`),
    workflow: (id: string) => call<Record<string, unknown>>(`${guiApiBase}/workflow/${encodeURIComponent(id)}`),
    /** The languages of the cockpit, as its application information names them. */
    languages: async (): Promise<string[]> => {
      const info = await call<{ additionalProperties?: { languages?: string } }>(`${guiApiBase}/app/info`);
      return (info.additionalProperties?.languages ?? DEV_SHELL_DEFAULT_LANGUAGE).split(',').map((language) => language.trim()).filter(Boolean);
    },
    /** The user tasks of a case, like the cockpit: POST /workflow/{id}/usertasks. */
    userTasksOfWorkflow: async (workflowId: string): Promise<Record<string, unknown>[]> =>
      (await call<{ userTasks: Record<string, unknown>[] }>(`${guiApiBase}/workflow/${encodeURIComponent(workflowId)}/usertasks`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'All' }),
      })).userTasks,
    /** The workflow modules the chosen user sees (GET /workflow-module lists them by the groups of the user). */
    modules: async (): Promise<string[]> => (await call<{ modules?: { id: string }[] }>(`${guiApiBase}/workflow-module`)).modules?.map((one) => one.id) ?? [],
    users: () => call<DevShellUser[]>('/dev-shell/user/all'),
    // the simulator answers the id as a JSON string, another one may answer it as plain text
    chosenUser: async () => {
      const answer = (await (await fetch('/dev-shell/user/')).text()).trim();
      return (answer.startsWith('"') ? (JSON.parse(answer) as string) : answer) || '---';
    },
    chooseUser: async (id: string) => { await fetch(`/dev-shell/user/${encodeURIComponent(id)}`, { method: 'POST' }); },
  };
}

const text = (args: unknown, name: string): string => {
  const value = (args as Record<string, unknown> | undefined)?.[name];
  if (typeof value !== 'string' || !value) throw new TypeError(`the argument ${name} is missing`);
  return value;
};
const goTo = (kind: 'tasks' | 'workflows', id: string) => { window.location.hash = `#/${kind}/${id}`; };

/** The functions the dev shell does not simulate: the simulator keeps no changes of a user task, so the developer is told. */
const NOT_ANSWERED = ['userTask.claim', 'userTask.unclaim', 'userTask.assign', 'userTask.unassign'];

/**
 * What the dev shell answers a part which asks the cockpit through its host element (the event protocol). Every request gets one
 * answer: a function which is not simulated says so in a toast and resolves, one nobody knows says so and fails.
 */
function answerRequests(element: HTMLElement, api: ReturnType<typeof createDevShellApi>, page: Page): void {
  const say = (level: BcNotification['level'], message: string) => toast({ level, text: `Dev shell: ${message}` });
  const handlers: Record<string, (args: unknown) => unknown> = {
    'cockpit.showNotification': (args) => toast(args as BcNotification),
    'userTask.open': (args) => goTo('tasks', text(args, 'userTaskId')),
    'workflow.navigateToWorkflow': (args) => goTo('workflows', text(args, 'workflowId')),
    'userTask.navigateToWorkflow': async (args) => {
      const { workflowId } = await api.userTask(text(args, 'userTaskId')) as { workflowId?: string };
      if (workflowId) goTo('workflows', workflowId);
    },
    'workflow.getUserTasks': async (args) => {
      const tasks = await api.userTasksOfWorkflow(text(args, 'workflowId'));
      return (args as { activeOnly?: boolean }).activeOnly ?? true ? tasks.filter((task) => !task.endedAt) : tasks;
    },
    [ACTIONS.sendTo]: (args) => page.send(element, text(args, 'target'), (args as { message: unknown }).message),
    [ACTIONS.subscribe]: () => ({ subscriptionId: page.subscribe(element) }),
    [ACTIONS.unsubscribe]: (args) => page.unsubscribe(text(args, 'subscriptionId')),
  };
  const respond = (detail: BcResponseDetail) => element.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail }));
  element.addEventListener(REQUEST_EVENT, async (event) => {
    const { requestId, action, args } = (event as CustomEvent<BcRequestDetail>).detail;
    if (NOT_ANSWERED.includes(action)) {
      say('warning', `the dev shell simulator does not answer ${action}; nothing was changed.`);
      return respond({ requestId, ok: true });
    }
    if (!Object.hasOwn(handlers, action)) {
      say('error', `the dev shell does not know ${action}.`);
      return respond({ requestId, ok: false, error: { code: ERROR_CODES.UNKNOWN_ACTION, message: `the dev shell does not know ${action}` } });
    }
    try {
      respond({ requestId, ok: true, result: await handlers[action]!(args) });
    } catch (error) {
      const code = error instanceof ActionFailed ? error.code : ERROR_CODES.FAILED;
      respond({ requestId, ok: false, error: { code, message: error instanceof Error ? error.message : String(error) } });
    }
  });
}

/** The user or the language changed: every part on the page gets it, without being drawn again. */
export function setDevShellContext(container: HTMLElement, context: Partial<DevShellContext>): void {
  for (const slot of container.children) Object.assign(slot.firstElementChild ?? {}, context);
}

/** Draws the web component of a name, without a framework of its own, into a new slot of the container. */
function drawElement<Component>(
  container: HTMLElement, name: string, options: DevShellCoreOptions<Component>, renderer: DevShellRenderer<Component>,
  page: Page, properties: Record<string, unknown>, area?: string,
): string | undefined {
  const prefix = options.workflowModuleId.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  if (!name.startsWith(`${prefix}-`)) return `Module ${options.workflowModuleId}: the name ${name} is refused, it has to start with ${prefix}-.`;
  const component = options.components[name];
  if (!component) return `no component was handed over for the web component ${name}`;
  define(name, component, options.style ?? '', renderer);
  const slot = container.appendChild(document.createElement('div'));
  if (area && area !== 'all') slot.dataset.area = area;
  const element = document.createElement(name);
  if (area) page.register(area, element);
  answerRequests(element, createDevShellApi(options.guiApiBase), page);
  Object.assign(element, properties);
  slot.append(element);
  return undefined;
}

/** Draws the buttons of the header the module's function names for the user chosen; none for no user. */
export function drawDevShellHeader<Component>(
  container: HTMLElement, options: DevShellCoreOptions<Component>, renderer: DevShellRenderer<Component>, context: DevShellContext,
): string | undefined {
  container.replaceChildren();
  if (!options.header || !context.currentUser) return undefined;
  const page = createPage();
  for (const { element } of options.header(context.currentUser) ?? []) {
    const note = drawElement(container, element, options, renderer, page, { ...context });
    if (note) return note;
  }
  return undefined;
}

/** The layout boxes of the task page and the case page of the cockpit: the same elements, the same CSS (TaskPage.vue). */
export const DEV_SHELL_LAYOUT_CSS = `
/* what the cockpit's application passes down to a part: the text colour and the line height (Vuetify's .v-application) */
html { overflow-x: hidden; overflow-y: auto; }
/* the boxes around the page in the cockpit: Vuetify's .v-application, .v-application__wrap and the main element */
.bc-app { display: flex; }
.bc-wrap { display: flex; position: relative; flex: 1 1 auto; min-width: 0; }
.bc-main { display: block; flex: 1 1 auto; min-width: 0; }
.bc-page { height: 100vh; overflow: auto; color: rgba(0, 0, 0, 0.87); line-height: 1.5; }
@media (prefers-color-scheme: dark) { .bc-page { color: rgba(255, 255, 255, 0.87); } }
.bc-stage { position: relative; margin: 16px; }
.bc-stage:has(> .bc-container > [data-area='body'], > .bc-container > [data-area='information'], > .bc-container > [data-area='actions']) { height: calc(100% - 32px); }
.bc-container:has(> [data-area='body'], > [data-area='information'], > [data-area='actions']) {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 320px); grid-template-rows: minmax(0, 1fr) auto; gap: 16px; height: 100%;
}
.bc-container > [data-area='body'] { grid-column: 1; grid-row: 1 / 3; min-height: 0; overflow: auto; }
.bc-container > [data-area='information'] { grid-column: 2; grid-row: 1; min-height: 0; overflow-y: auto; }
.bc-container > [data-area='actions'] { grid-column: 2; grid-row: 2; }
.bc-bar { display: flex; gap: 8px; align-items: center; padding: 8px 16px; background: var(--bc-color-surface); }
.bc-header { display: flex; gap: 8px; align-items: center; margin-left: auto; }
.bc-header > div { display: flex; }
.bc-note { margin: 16px; }
.bc-start { margin: 16px; }
.bc-start a { display: block; padding: 2px 0; }
.bc-columns { margin: 16px; }
.bc-columns table { border-collapse: collapse; margin-bottom: 16px; }
.bc-columns th, .bc-columns td { border: 1px solid rgba(128, 128, 128, 0.4); padding: 4px 8px; text-align: left; }
.bc-columns td[data-empty='true'] { font-style: italic; opacity: 0.6; background: rgba(255, 160, 0, 0.15); }
`;

/** The areas of the task page and of the case page of the cockpit (Q-TASK-PAGE-AREAS, Q-WORKFLOW-PAGE-AREAS). */
const PAGE_AREAS = ['body', 'information', 'actions'];

/**
 * Defines the web component of a name once: a host element with an open shadow root, the style of the module in front of the
 * framework's root, as the module's own visual entry does.
 */
function define<Component>(name: string, component: Component, style: string, renderer: DevShellRenderer<Component>): void {
  if (customElements.get(name)) return;
  const drawn = new WeakMap<ShadowRoot, ReturnType<DevShellRenderer<Component>['draw']>>();
  const draw = (root: ShadowRoot, given: BcProps) => {
    const known = drawn.get(root);
    if (known) return known.update(given);
    const target = document.createElement('div');
    root.append(Object.assign(document.createElement('style'), { textContent: style }), target);
    drawn.set(root, renderer.draw(target, component, given));
  };
  defineBcElement(name, {
    mount: draw,
    update: draw,
    unmount: (root) => { drawn.get(root)?.stop(); drawn.delete(root); },
  });
}

/** Asks the data entry and draws what it names into the container: the areas of the page, or `all`, as the cockpit picks them. */
export async function drawDevShellPart<Component>(
  container: HTMLElement, ask: DevShellDataFunction | undefined, data: Record<string, unknown>, dataName: 'userTask' | 'workflow',
  options: DevShellCoreOptions<Component>, renderer: DevShellRenderer<Component>, context: DevShellContext,
): Promise<string | undefined> {
  container.replaceChildren();
  const first = await ask?.(data, 'all');
  if (!first) return `the module names no part for ${dataName} ${String(data.id)}`;
  const named: Record<string, string> = typeof first.element === 'string' ? { all: first.element } : first.element;
  const page = createPage();
  const areas = PAGE_AREAS.filter((area) => Object.hasOwn(named, area));
  for (const area of areas.length ? areas : ['all']) {
    const name = named[area];
    if (name === undefined) return `the module names no web component for the area ${area}`;
    const note = drawElement(container, name, options, renderer, page, { [dataName]: data, area, ...context }, area);
    if (note) return note;
  }
  return undefined;
}

type Kind = 'tasks' | 'workflows';
type Route = { kind: Kind; id: string } | { kind: 'header' } | { kind: 'columns' } | { kind: 'page'; id: string } | undefined;
const partRoute = (route: Route): { kind: Kind; id: string } | undefined => route && (route.kind === 'tasks' || route.kind === 'workflows') ? route : undefined;
const routeOf = (): Route => {
  const hash = window.location.hash;
  if (hash === '#/header') return { kind: 'header' };
  if (hash === '#/columns') return { kind: 'columns' };
  const devPage = /^#\/dev-shell-pages\/(.+)$/.exec(hash);
  if (devPage) return { kind: 'page', id: devPage[1]! };
  const found = /^#\/(tasks|workflows)\/(.+)$/.exec(hash);
  return found ? { kind: found[1] as Kind, id: found[2]! } : undefined;
};

const NO_VALUE = '(no value)';

/** What a cell shows for the value at the path of a column, drawn by the type of the column as the cockpit does; undefined: no value. */
export function devShellCellText(value: unknown, column: DevShellColumn, language: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const moment = typeof value === 'string' ? new Date(value) : undefined;
  if (column.type === 'i18n') { const texts = value as Record<string, string>; return texts[language] ?? texts.en ?? Object.values(texts)[0] ?? ''; }
  if (column.type === 'person') { const person = value as { id?: string; displayShort?: string; email?: string }; return person.displayShort ?? person.email ?? person.id ?? ''; }
  if (column.type === 'date' && moment) return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(`${(value as string).slice(0, 10)}T12:00:00`));
  if (column.type === 'date-time' && moment) return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'medium' }).format(moment);
  if (column.type === 'time' && typeof value === 'string') { const [hours = 0, minutes = 0] = value.split(':').map(Number); return new Intl.DateTimeFormat(language, { timeStyle: 'short' }).format(new Date(2000, 0, 1, hours, minutes)); }
  if (typeof value === 'object') return '(an object: the column needs a type)';
  if (typeof value === 'number') return new Intl.NumberFormat(language).format(value);
  return String(value);
}

const valueAt = (row: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined), row);

/** One table of the page /columns: a row per entry, a column per column the module returned (merged by path, in order of appearance). */
export function drawDevShellColumnsTable(
  title: string, testid: string, rows: DevShellEntry[], columnsOf: DevShellColumnsFunction | undefined, language: string, missing: string,
): HTMLElement {
  const section = document.createElement('section');
  section.append(Object.assign(document.createElement('h2'), { textContent: title }));
  if (!columnsOf) return (section.append(Object.assign(document.createElement('p'), { textContent: missing })), section);
  const answers = rows.map((row) => ({ row, columns: columnsOf(row) }));
  const merged = new Map<string, DevShellColumn>();
  for (const { columns } of answers) for (const column of columns ?? []) if (!merged.has(column.path)) merged.set(column.path, column);
  const table = Object.assign(document.createElement('table'), {});
  table.dataset.testid = testid;
  const cell = (tag: 'th' | 'td', text: string) => Object.assign(document.createElement(tag), { textContent: text });
  const head = table.createTHead().insertRow();
  head.append(cell('th', ''));
  for (const column of merged.values()) head.append(cell('th', `${column.title[language] ?? Object.values(column.title)[0] ?? column.path} (${column.path})`));
  const body = table.createTBody();
  for (const { row, columns } of answers) {
    const line = body.insertRow();
    line.append(cell('th', row.title?.[language] ?? row.title?.en ?? row.id));
    if (!columns) { line.append(Object.assign(cell('td', 'the module has no columns for this entry'), { colSpan: Math.max(merged.size, 1) })); continue; }
    for (const [path, column] of merged) {
      const own = columns.find((one) => one.path === path);
      const shown = own ? devShellCellText(valueAt(row, path), own, language) : '';
      const td = cell('td', shown ?? NO_VALUE);
      if (own && shown === undefined) td.dataset.empty = 'true';
      line.append(td);
    }
  }
  section.append(table);
  return section;
}

/**
 * The page of the dev shell for the frameworks which draw into an element they are given: the bar with the choice of kind, entry
 * and user, a note, the start page and the stage with the parts. The routes are `#/` (start page), `#/tasks/<id>`,
 * `#/workflows/<id>`, `#/header`, `#/columns` and `#/dev-shell-pages/<id>`.
 */
export function startDevShell<Component>(target: HTMLElement, options: DevShellCoreOptions<Component>, renderer: DevShellRenderer<Component>): void {
  const refused = devShellPagesNote(options.devShellPages ?? []);
  if (refused) {
    target.append(Object.assign(document.createElement('p'), { textContent: `The dev shell is stopped. ${refused}` }));
    target.lastElementChild!.setAttribute('data-testid', 'dev-shell-stopped');
    target.lastElementChild!.setAttribute('role', 'alert');
    return;
  }
  const api = createDevShellApi(options.guiApiBase);
  const settings = createDevShellSettings();
  document.head.append(Object.assign(document.createElement('style'), { textContent: DEV_SHELL_LAYOUT_CSS }));
  const element = (tag: string, testid: string, props: Record<string, unknown> = {}): HTMLElement & Record<string, any> => {
    const created = Object.assign(document.createElement(tag), props);
    created.dataset.testid = testid;
    return created;
  };
  const page = Object.assign(document.createElement('div'), { className: 'bc-page' });
  const bar = element('div', 'shell-bar', { className: 'bc-bar' });
  const header = element('div', 'shell-header', { className: 'bc-header' });
  const note = element('p', 'shell-note', { className: 'bc-note', hidden: true });
  note.setAttribute('role', 'alert');
  const start = element('div', 'start-page', { className: 'bc-start', hidden: true });
  const columnsPage = element('div', 'columns-page', { className: 'bc-columns', hidden: true });
  const stage = element('div', 'shell-stage', { className: 'bc-stage' });
  const container = stage.appendChild(Object.assign(document.createElement('div'), { className: 'bc-container' }));
  bar.append(element('a', 'start-link', { href: '#/', textContent: 'Start page' }));
  const select = (testid: string) => bar.appendChild(element('select', testid)) as HTMLSelectElement;
  const kindSelect = select('kind-select');
  const searchInput = bar.appendChild(element('input', 'entry-search', { type: 'search', placeholder: 'Search by name' })) as HTMLInputElement;
  const entrySelect = select('entry-select');
  const moreButton = bar.appendChild(element('button', 'entry-more', { textContent: 'More', hidden: true }));
  const userSelect = select('user-select');
  const languageSelect = select('language-select');
  const fill = (choice: HTMLSelectElement, choices: [string, string][], value: string) => {
    choice.replaceChildren(...choices.map(([id, label]) => Object.assign(document.createElement('option'), { value: id, textContent: label })));
    choice.value = value;
  };
  const kinds: [string, string][] = [['tasks', 'User tasks'], ['workflows', 'Cases']];
  fill(kindSelect, kinds, 'tasks');
  bar.append(header);
  page.append(bar, note, start, columnsPage, stage);
  const main = Object.assign(document.createElement('main'), { className: 'bc-main' });
  const wrap = Object.assign(document.createElement('div'), { className: 'bc-wrap' });
  const application = Object.assign(document.createElement('div'), { className: 'bc-app' });
  main.append(page);
  wrap.append(main);
  application.append(wrap);
  target.append(application);

  const say = (text: string | undefined) => { note.textContent = text ?? ''; note.hidden = !text; };
  let user = '---';
  let language = settings.read<string>(LANGUAGE_SETTING) ?? DEV_SHELL_DEFAULT_LANGUAGE;
  const contextOf = (): DevShellContext => ({ user, language, ...(user === '---' ? {} : { currentUser: { id: user } }) });
  let shown = 0;
  let pageHandle: ReturnType<DevShellRenderer<Component>['draw']> | undefined;
  const go = (to: Kind, id: string) => { window.location.hash = `#/${to}/${id}`; };
  const labelOf = (entry: DevShellEntry) => entry.title?.[language] ?? entry.title?.en ?? entry.id;
  const block = (kind: Kind, number = 0, search = '') => kind === 'tasks' ? api.userTasks(number, search) : api.workflows(number, search);

  // the entries of the drop-down: blocks of 20, searched by name; a block is added at the end
  let loadedKind: Kind | undefined;
  let entries: DevShellEntry[] = [];
  let blocks = 0;
  let more = false;
  let search = '';
  const showEntries = (selected: string) => {
    fill(entrySelect, entries.map((entry) => [entry.id, labelOf(entry)]), selected);
    moreButton.hidden = !more;
  };
  let entryTurn = 0;
  async function loadEntries(kind: Kind, again: boolean): Promise<void> {
    const turn = ++entryTurn;
    const fetched = await block(kind, again ? 0 : blocks, search);
    if (turn !== entryTurn) return;
    entries = again ? fetched.entries : [...entries, ...fetched.entries];
    blocks = again ? 1 : blocks + 1;
    more = fetched.more;
    loadedKind = kind;
  }

  const link = (testid: string, to: string, text: string) => {
    const item = document.createElement('div');
    item.append(element('a', testid, { href: to, textContent: text }));
    return item;
  };
  async function drawStart(): Promise<void> {
    const [tasks, cases, visibleModules] = await Promise.all([block('tasks'), block('workflows'), api.modules()]);
    const chosenModule = settings.read<string>(MODULE_SETTING);
    const moduleChoice = element('select', 'module-select') as HTMLSelectElement;
    fill(moduleChoice, visibleModules.map((id) => [id, id]), visibleModules.includes(chosenModule ?? '') ? chosenModule! : visibleModules.includes(options.workflowModuleId) ? options.workflowModuleId : visibleModules[0] ?? '');
    moduleChoice.addEventListener('change', () => settings.write(MODULE_SETTING, moduleChoice.value));
    start.replaceChildren(
      Object.assign(document.createElement('h2'), { textContent: 'Workflow module' }),
      visibleModules.length ? moduleChoice : element('p', 'start-no-modules', { textContent: 'The chosen user sees no workflow module.' }),
      Object.assign(document.createElement('h2'), { textContent: 'User tasks' }),
      ...tasks.entries.map((entry) => link(`start-task-${entry.id}`, `#/tasks/${entry.id}`, labelOf(entry))),
      Object.assign(document.createElement('h2'), { textContent: 'Cases' }),
      ...cases.entries.map((entry) => link(`start-workflow-${entry.id}`, `#/workflows/${entry.id}`, labelOf(entry))),
      Object.assign(document.createElement('h2'), { textContent: 'Extension points' }),
      ...(options.header ? [link('start-extension-header', '#/header', 'Header')] : []),
      Object.assign(document.createElement('h2'), { textContent: 'Pages' }),
      link('start-columns', '#/columns', 'Columns of the lists'),
      ...(options.devShellPages ?? []).map((one) => link(`start-dev-page-${one.id}`, `#/dev-shell-pages/${one.id}`, one.title[language] ?? Object.values(one.title)[0] ?? one.id)),
    );
  }

  // draws what the address names; run again after every change of the address or the user
  async function load(userChanged = false): Promise<void> {
    const turn = ++shown;
    say(undefined);
    const route = routeOf();
    start.hidden = Boolean(route);
    columnsPage.hidden = route?.kind !== 'columns';
    stage.hidden = !route || route.kind === 'columns';
    container.replaceChildren();
    pageHandle?.stop();
    pageHandle = undefined;
    const headerNote = drawDevShellHeader(header, options, renderer, contextOf());
    try {
      if (!route) {
        start.replaceChildren();
        await drawStart();
        return;
      }
      if (route.kind === 'columns') {
        const [tasks, cases] = await Promise.all([block('tasks'), block('workflows')]);
        if (turn !== shown) return;
        columnsPage.replaceChildren(
          drawDevShellColumnsTable('User tasks', 'columns-usertasks', tasks.entries, options.userTaskListColumns, language, 'The module names no UserTaskList entry, so it has no columns for user tasks.'),
          drawDevShellColumnsTable('Cases', 'columns-workflows', cases.entries, options.workflowListColumns, language, 'The module names no WorkflowList entry, so it has no columns for cases.'),
        );
        return;
      }
      if (route.kind === 'page') {
        const found = options.devShellPages?.find((one) => one.id === route.id);
        if (!found) return say(`The dev shell has no page ${route.id}.`);
        pageHandle = renderer.draw(container, found.component, { ...contextOf() });
        return;
      }
      if (route.kind === 'header') {
        say(user === '---' ? 'No user is chosen: the header has no buttons.' : drawDevShellHeader(container, options, renderer, contextOf()) ?? headerNote);
        return;
      }
      if (userChanged || loadedKind !== route.kind) await loadEntries(route.kind, true);
      if (turn !== shown) return;
      fill(kindSelect, kinds, route.kind);
      showEntries(route.id);
      const data = await (route.kind === 'tasks' ? api.userTask(route.id) : api.workflow(route.id));
      if (turn !== shown) return;
      const ask = (route.kind === 'tasks' ? options.userTaskForm : options.workflowPage) as DevShellDataFunction | undefined;
      const drawn = await drawDevShellPart(container, ask, data, route.kind === 'tasks' ? 'userTask' : 'workflow', options, renderer, contextOf());
      if (turn === shown) say(drawn ?? headerNote);
    } catch (error) {
      if (turn !== shown) return;
      container.replaceChildren();
      start.replaceChildren();
      say(error instanceof DevShellNotAllowed ? 'No user is chosen: the simulator answers only for a user.' : String(error));
    }
  }

  const currentKind = (): Kind => partRoute(routeOf())?.kind ?? (kindSelect.value as Kind);
  entrySelect.addEventListener('change', () => go(currentKind(), entrySelect.value));
  moreButton.addEventListener('click', async () => {
    await loadEntries(currentKind(), false);
    showEntries(partRoute(routeOf())?.id ?? '');
  });
  let typing: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(async () => {
      if (searchInput.value === search) return;
      search = searchInput.value;
      await loadEntries(currentKind(), true).catch(() => undefined);
      showEntries(partRoute(routeOf())?.id ?? '');
    }, 250);
  });
  kindSelect.addEventListener('change', async () => {
    const to = kindSelect.value as Kind;
    clearTimeout(typing);
    search = '';
    searchInput.value = '';
    await loadEntries(to, true).catch(() => undefined);
    if (entries[0]) go(to, entries[0].id);
    else { fill(entrySelect, [], ''); container.replaceChildren(); }
  });
  userSelect.addEventListener('change', () => { user = userSelect.value; void api.chooseUser(user).then(() => load(true)); });
  languageSelect.addEventListener('change', () => {
    language = languageSelect.value;
    settings.write(LANGUAGE_SETTING, language);
    setDevShellContext(container, { language });
    setDevShellContext(header, { language });
    pageHandle?.update({ ...contextOf() });
    if (!routeOf()) void drawStart().catch(() => undefined);
    if (routeOf()?.kind === 'columns') void load();
  });
  window.addEventListener('hashchange', () => void load());
  void (async () => {
    const [users, chosen, languages] = await Promise.all([api.users(), api.chosenUser(), api.languages().catch(() => [DEV_SHELL_DEFAULT_LANGUAGE])]);
    user = chosen;
    fill(languageSelect, languages.map((one) => [one, one]), language);
    fill(userSelect, [['---', 'no user'], ...users.map((one) => [one.id, one.name] as [string, string])], user);
    await load(true);
  })();
}
