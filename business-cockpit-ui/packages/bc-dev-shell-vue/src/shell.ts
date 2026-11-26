import { defineComponent, h, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import { createDevShellApi as createApi, DEV_SHELL_DEFAULT_LANGUAGE, setDevShellContext, DevShellNotAllowed as NotAllowed, DEV_SHELL_LAYOUT_CSS, type DevShellUser, type DevShellEntry as Entry } from '@acme/bc-module-kit';
import { drawPart, type DataFunction } from './parts.js';
import type { BcElementDescriptor } from '@acme/bc-module-kit';

export interface DevShellOptions {
  /** The address of the GUI API, the one the simulator of the dev shell maps. */
  guiApiBase: string;
  workflowModuleId: string;
  /** The data entries of the module, imported from their source files. */
  userTaskForm?: (userTask: any, area: string) => BcElementDescriptor | undefined;
  workflowPage?: (workflow: any, area: string) => BcElementDescriptor | undefined;
  /** The components by web component name, imported from their source files. */
  components: Record<string, Component>;
  /** The text of the style the module's web components write into their shadow roots. */
  style?: string;
}

const routeOf = () => /^#\/(tasks|workflows)\/(.+)$/.exec(window.location.hash)?.slice(1, 3) as ['tasks' | 'workflows', string] | undefined;

export function createDevShell(options: DevShellOptions) {
  const api = createApi(options.guiApiBase);
  const style = options.style ?? '';

  return defineComponent({
    setup() {
      const route = ref(routeOf());
      const entries = ref<Entry[]>([]);
      const users = ref<DevShellUser[]>([]);
      const user = ref('---');
      const languages = ref<string[]>([DEV_SHELL_DEFAULT_LANGUAGE]);
      const language = ref(DEV_SHELL_DEFAULT_LANGUAGE);
      const note = ref<string>();
      const container = ref<HTMLElement>();
      const onHash = () => { route.value = routeOf(); };

      const kind = () => route.value?.[0] ?? 'tasks';
      const go = (to: 'tasks' | 'workflows', id: string) => { window.location.hash = `#/${to}/${id}`; };

      // loads the drop-down of the kind and draws the entry of the address; the user is read again after every change of the user
      async function load(): Promise<void> {
        note.value = undefined;
        try {
          entries.value = await (kind() === 'tasks' ? api.userTasks() : api.workflows());
          if (!route.value && entries.value[0]) return go(kind(), entries.value[0].id);
          if (!route.value || !container.value) return;
          const [which, id] = route.value;
          const data = await (which === 'tasks' ? api.userTask(id) : api.workflow(id));
          const ask = (which === 'tasks' ? options.userTaskForm : options.workflowPage) as DataFunction | undefined;
          note.value = await drawPart(container.value, ask, data, which === 'tasks' ? 'userTask' : 'workflow', options, style, { user: user.value, language: language.value });
        } catch (error) {
          container.value?.replaceChildren();
          note.value = error instanceof NotAllowed ? 'No user is chosen: the simulator answers only for a user.' : String(error);
        }
      }

      onMounted(async () => {
        document.head.append(Object.assign(document.createElement('style'), { textContent: DEV_SHELL_LAYOUT_CSS }));
        window.addEventListener('hashchange', onHash);
        [users.value, user.value, languages.value] = await Promise.all([api.users(), api.chosenUser(), api.languages().catch(() => [DEV_SHELL_DEFAULT_LANGUAGE])]);
        await load();
      });
      onUnmounted(() => window.removeEventListener('hashchange', onHash));
      watch(route, () => void load());

      const select = (testid: string, value: string, choices: [string, string][], change: (value: string) => void) =>
        h('select', { 'data-testid': testid, value, onChange: (event: Event) => change((event.target as HTMLSelectElement).value) },
          choices.map(([id, label]) => h('option', { value: id, selected: id === value }, label)));

      return () => h('div', { class: 'bc-page' }, [
        h('div', { class: 'bc-bar', 'data-testid': 'shell-bar' }, [
          select('kind-select', kind(), [['tasks', 'User tasks'], ['workflows', 'Cases']], (to) => { route.value = undefined; window.location.hash = ''; void (async () => { const next = await (to === 'tasks' ? api.userTasks() : api.workflows()).catch(() => []); if (next[0]) go(to as 'tasks', next[0].id); else { entries.value = []; container.value?.replaceChildren(); } })(); }),
          select('entry-select', route.value?.[1] ?? '', entries.value.map((entry) => [entry.id, entry.title?.[language.value] ?? entry.title?.en ?? entry.id]), (id) => go(kind(), id)),
          select('user-select', user.value, [['---', 'no user'], ...users.value.map((one) => [one.id, one.name] as [string, string])], (id) => { user.value = id; void api.chooseUser(id).then(load); }),
          select('language-select', language.value, languages.value.map((one) => [one, one] as [string, string]), (one) => { language.value = one; if (container.value) setDevShellContext(container.value, { language: one }); }),
        ]),
        note.value ? h('p', { 'data-testid': 'shell-note', role: 'alert', class: 'bc-note' }, note.value) : undefined,
        h('div', { class: 'bc-stage' }, h('div', { class: 'bc-container', ref: container })),
      ]);
    },
  });
}
