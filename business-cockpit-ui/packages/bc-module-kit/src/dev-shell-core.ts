// What every dev shell shares, whatever the framework of the module: the client of the GUI API, the layout of the task
// page and the case page, and the drawing of a part. A dev shell supplies only how its framework builds a web component.
import type { BcElementDescriptor } from '@acme/bc-types';
import { defineBcElement, type BcProps } from './define-element.js';

export interface DevShellEntry { id: string; title?: Record<string, string> }
export interface DevShellUser { id: string; name: string }
export class DevShellNotAllowed extends Error {}

export type DevShellDataFunction = (data: Record<string, unknown> | undefined, area: string) => BcElementDescriptor | undefined | Promise<BcElementDescriptor | undefined>;

/** What a framework's dev shell hands the shell: how a component is drawn into the shadow root and updated. */
export interface DevShellRenderer<Component> {
  /** Draws the component, with the props, into a new element of the shadow root; returns what is needed to update and stop it. */
  draw(target: HTMLElement, component: Component, props: Record<string, unknown>): { update(props: Record<string, unknown>): void; stop(): void };
}

export interface DevShellCoreOptions<Component> {
  /** The address of the GUI API, the one the simulator of the dev shell maps to the cockpit paths. */
  guiApiBase: string;
  workflowModuleId: string;
  userTaskForm?: (userTask: any, area: string) => BcElementDescriptor | undefined;
  workflowPage?: (workflow: any, area: string) => BcElementDescriptor | undefined;
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
  const list = async (kind: 'usertask' | 'workflow'): Promise<DevShellEntry[]> => {
    // the drop-down asks with the primary filter All, newest first, in blocks of 20 (dev-shell.md)
    const body = JSON.stringify({ mode: 'All', pageNumber: 0, pageSize: 20, sort: 'createdAt', sortAscending: false });
    const answer = await call<{ userTasks?: DevShellEntry[]; workflows?: DevShellEntry[] }>(`${guiApiBase}/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    return (kind === 'usertask' ? answer.userTasks : answer.workflows) ?? [];
  };
  return {
    userTasks: () => list('usertask'),
    workflows: () => list('workflow'),
    userTask: (id: string) => call<Record<string, unknown>>(`${guiApiBase}/usertask/${encodeURIComponent(id)}`),
    workflow: (id: string) => call<Record<string, unknown>>(`${guiApiBase}/workflow/${encodeURIComponent(id)}`),
    users: () => call<DevShellUser[]>('/dev-shell/user/all'),
    chosenUser: async () => (await (await fetch('/dev-shell/user/')).text()) || '---',
    chooseUser: async (id: string) => { await fetch(`/dev-shell/user/${encodeURIComponent(id)}`, { method: 'POST' }); },
  };
}

/** The layout boxes of the task page and the case page of the cockpit: the same elements, the same CSS (TaskPage.vue). */
export const DEV_SHELL_LAYOUT_CSS = `
/* what the cockpit's application passes down to a part: the text colour and the line height (Vuetify's .v-application) */
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
.bc-note { margin: 16px; }
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
  options: DevShellCoreOptions<Component>, renderer: DevShellRenderer<Component>, user: unknown,
): Promise<string | undefined> {
  container.replaceChildren();
  const first = await ask?.(data, 'all');
  if (!first) return `the module names no part for ${dataName} ${String(data.id)}`;
  const named: Record<string, string> = typeof first.element === 'string' ? { all: first.element } : first.element;
  const prefix = options.workflowModuleId.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const areas = PAGE_AREAS.filter((area) => Object.hasOwn(named, area));
  for (const area of areas.length ? areas : ['all']) {
    const name = named[area];
    if (name === undefined) return `the module names no web component for the area ${area}`;
    if (!name.startsWith(`${prefix}-`)) return `the name ${name} is refused, it has to start with ${prefix}-`;
    const component = options.components[name];
    if (!component) return `no component was handed over for the web component ${name}`;
    define(name, component, options.style ?? '', renderer);
    const slot = container.appendChild(document.createElement('div'));
    if (area !== 'all') slot.dataset.area = area;
    const element = document.createElement(name);
    Object.assign(element, { [dataName]: data, area, user });
    slot.append(element);
  }
  return undefined;
}

const routeOf = () => /^#\/(tasks|workflows)\/(.+)$/.exec(window.location.hash)?.slice(1, 3) as ['tasks' | 'workflows', string] | undefined;

/**
 * The page of the dev shell for the frameworks which draw into an element they are given: the bar with the choice of kind, entry
 * and user, a note, and the stage with the parts. The behaviour is the one of the Vue dev shell.
 */
export function startDevShell<Component>(target: HTMLElement, options: DevShellCoreOptions<Component>, renderer: DevShellRenderer<Component>): void {
  const api = createDevShellApi(options.guiApiBase);
  document.head.append(Object.assign(document.createElement('style'), { textContent: DEV_SHELL_LAYOUT_CSS }));
  const page = Object.assign(document.createElement('div'), { className: 'bc-page' });
  const bar = Object.assign(document.createElement('div'), { className: 'bc-bar' });
  bar.dataset.testid = 'shell-bar';
  const note = Object.assign(document.createElement('p'), { className: 'bc-note', hidden: true });
  note.dataset.testid = 'shell-note';
  note.setAttribute('role', 'alert');
  const stage = Object.assign(document.createElement('div'), { className: 'bc-stage' });
  const container = stage.appendChild(Object.assign(document.createElement('div'), { className: 'bc-container' }));
  const select = (testid: string) => {
    const element = bar.appendChild(document.createElement('select'));
    element.dataset.testid = testid;
    return element;
  };
  const kindSelect = select('kind-select');
  const entrySelect = select('entry-select');
  const userSelect = select('user-select');
  const fill = (element: HTMLSelectElement, choices: [string, string][], value: string) => {
    element.replaceChildren(...choices.map(([id, label]) => Object.assign(document.createElement('option'), { value: id, textContent: label })));
    element.value = value;
  };
  fill(kindSelect, [['tasks', 'User tasks'], ['workflows', 'Cases']], 'tasks');
  page.append(bar, note, stage);
  target.append(page);

  const say = (text: string | undefined) => { note.textContent = text ?? ''; note.hidden = !text; };
  let user = '---';
  let shown = 0;
  const go = (to: 'tasks' | 'workflows', id: string) => { window.location.hash = `#/${to}/${id}`; };

  // loads the drop-down of the kind and draws the entry of the address; run again after every change of the address or the user
  async function load(): Promise<void> {
    const turn = ++shown;
    say(undefined);
    const route = routeOf();
    const kind = route?.[0] ?? (kindSelect.value as 'tasks' | 'workflows');
    try {
      const entries = await (kind === 'tasks' ? api.userTasks() : api.workflows());
      if (turn !== shown) return;
      fill(kindSelect, [['tasks', 'User tasks'], ['workflows', 'Cases']], kind);
      fill(entrySelect, entries.map((entry) => [entry.id, entry.title?.en ?? entry.id]), route?.[1] ?? '');
      if (!route) {
        container.replaceChildren();
        if (entries[0]) go(kind, entries[0].id);
        return;
      }
      const data = await (kind === 'tasks' ? api.userTask(route[1]) : api.workflow(route[1]));
      if (turn !== shown) return;
      const ask = (kind === 'tasks' ? options.userTaskForm : options.workflowPage) as DevShellDataFunction | undefined;
      say(await drawDevShellPart(container, ask, data, kind === 'tasks' ? 'userTask' : 'workflow', options, renderer, user));
    } catch (error) {
      if (turn !== shown) return;
      container.replaceChildren();
      say(error instanceof DevShellNotAllowed ? 'No user is chosen: the simulator answers only for a user.' : String(error));
    }
  }

  entrySelect.addEventListener('change', () => go((routeOf()?.[0] ?? kindSelect.value) as 'tasks', entrySelect.value));
  kindSelect.addEventListener('change', async () => {
    const to = kindSelect.value as 'tasks' | 'workflows';
    window.location.hash = '';
    const entries = await (to === 'tasks' ? api.userTasks() : api.workflows()).catch(() => []);
    if (entries[0]) go(to, entries[0].id);
    else { fill(entrySelect, [], ''); container.replaceChildren(); }
  });
  userSelect.addEventListener('change', () => { user = userSelect.value; void api.chooseUser(user).then(load); });
  window.addEventListener('hashchange', () => void load());
  void (async () => {
    const [users, chosen] = await Promise.all([api.users(), api.chosenUser()]);
    user = chosen;
    fill(userSelect, [['---', 'no user'], ...users.map((one) => [one.id, one.name] as [string, string])], user);
    await load();
  })();
}
