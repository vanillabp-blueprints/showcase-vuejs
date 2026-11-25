import {
  ERROR_CODES, REQUEST_EVENT, RESPONSE_EVENT, USER_TASK_FORM, USER_TASK_LIST, WORKFLOW_LIST, WORKFLOW_PAGE,
  type BcRequestDetail, type BcResponseDetail,
  AREA_ALL, EXPORT_NAMES, MANIFEST_FILE_NAME, UI_URI_TYPE_ES_MODULES, elementPrefix, entryUrl, readManifest,
  type BcElementDescriptor, type BcManifest,
} from '@acme/bc-module-kit';

export const loadableUiUriTypes: readonly string[] = [UI_URI_TYPE_ES_MODULES];

export type DataEntry = keyof typeof EXPORT_NAMES;
type Exports = Record<string, unknown>;

export interface ModuleHostOptions {
  /** Reads the manifest text; the default is `fetch` with `cache: 'no-cache'`. */
  readText?: (url: string) => Promise<string>;
  /** The one place which loads a file of a module. */
  importFile?: (url: string) => Promise<Exports>;
  /** The actions of the cockpit by name; the host answers every other action with UNKNOWN_ACTION. */
  actions?: Record<string, ActionHandler>;
  /** Where a named entry which fails to load is reported; the default is `console.error`. */
  onProblem?: (workflowModuleId: string, error: unknown) => void;
}

export class ModuleNameError extends Error {}

/** What an action of the cockpit does; it throws `ActionRefused` when the server refuses. */
export type ActionHandler = (args: unknown, element: HTMLElement) => unknown | Promise<unknown>;

/** The server refused an action; `status` is its HTTP status. */
export class ActionRefused extends Error {
  constructor(readonly status: number, message?: string) { super(message ?? `the server answered ${status}`); }
}

/** The entries which ask only the module of the row; every other entry asks every module the user may see. */
export const ROW_ENTRIES: readonly string[] = [USER_TASK_LIST, WORKFLOW_LIST, USER_TASK_FORM, WORKFLOW_PAGE];

export interface ModuleRef { workflowModuleId: string; webPath: string }

const errorOf = (error: unknown): { code: string; status?: number; message?: string } => {
  const status = (error as { status?: unknown } | null)?.status;
  const message = error instanceof Error ? error.message : String(error);
  return typeof status === 'number' ? { code: ERROR_CODES.REFUSED, status, message } : { code: ERROR_CODES.FAILED, message };
};

const isDescriptor = (answer: unknown): answer is BcElementDescriptor => typeof (answer as BcElementDescriptor | undefined)?.element === 'string';
const isValidElementName = (name: string) => /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/.test(name) && !RESERVED.includes(name);
const RESERVED = ['annotation-xml', 'color-profile', 'font-face', 'font-face-src', 'font-face-uri', 'font-face-format', 'font-face-name', 'missing-glyph'];

/** The registry and the loader of the modules: ask, load, draw. */
export function createModuleHost(options: ModuleHostOptions = {}) {
  const readText = options.readText ?? (async (url: string) => (await fetch(url, { cache: 'no-cache' })).text());
  const importFile = options.importFile ?? ((url: string) => import(/* @vite-ignore */ url) as Promise<Exports>);
  const actions = options.actions ?? {};
  const onProblem = options.onProblem ?? ((id: string, error: unknown) => console.error(`module ${id}:`, error));
  const manifests = new Map<string, Promise<{ manifest: BcManifest; url: string }>>();
  const files = new Map<string, Promise<Exports>>();

  const manifestOf = (workflowModuleId: string, webPath: string) => {
    if (!manifests.has(workflowModuleId)) {
      const url = new URL(`${webPath.replace(/\/?$/, '/')}${MANIFEST_FILE_NAME}`, globalThis.location?.href ?? 'http://localhost/').href;
      manifests.set(workflowModuleId, readText(url).then((text) => ({ manifest: readManifest(text), url })));
    }
    return manifests.get(workflowModuleId)!;
  };

  const load = async (workflowModuleId: string, webPath: string, entry: string) => {
    const { manifest, url } = await manifestOf(workflowModuleId, webPath);
    const address = entryUrl(manifest, entry, url);
    if (!files.has(address)) files.set(address, importFile(address));
    return files.get(address)!;
  };

  /** Answers every `bc-request` of the element with exactly one `bc-response`. */
  const answerRequests = (element: HTMLElement) => {
    const respond = (detail: BcResponseDetail) => element.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail }));
    element.addEventListener(REQUEST_EVENT, async (event) => {
      const { requestId, action, args } = (event as CustomEvent<BcRequestDetail>).detail;
      const handler = Object.hasOwn(actions, action) ? actions[action] : undefined;
      if (!handler) {
        return respond({ requestId, ok: false, error: { code: ERROR_CODES.UNKNOWN_ACTION, message: `the cockpit does not know ${action}` } });
      }
      try {
        respond({ requestId, ok: true, result: await handler(args, element) });
      } catch (error) {
        respond({ requestId, ok: false, error: errorOf(error) });
      }
    });
  };

  const checkName = (workflowModuleId: string, name: string) => {
    if (!isValidElementName(name) || !name.startsWith(`${elementPrefix(workflowModuleId)}-`)) {
      throw new ModuleNameError(`module ${workflowModuleId}: the name ${name} is refused, it has to start with ${elementPrefix(workflowModuleId)}-`);
    }
  };

  return {
    /** Step 1: calls the function of a data entry; `undefined` or the names of the web components. */
    async ask(workflowModuleId: string, webPath: string, entry: DataEntry, ...args: unknown[]): Promise<unknown> {
      const exports = await load(workflowModuleId, webPath, entry);
      const answer = (await (exports[EXPORT_NAMES[entry]] as ((...a: unknown[]) => unknown) | undefined)?.(...args)) as unknown;
      if (isDescriptor(answer)) checkName(workflowModuleId, answer.element);
      return answer;
    },
    /** Steps 2 and 3: loads the visual entry and puts the web component into the container. */
    async draw(workflowModuleId: string, webPath: string, descriptor: BcElementDescriptor, container: Element, properties: Record<string, unknown> = {}): Promise<HTMLElement> {
      checkName(workflowModuleId, descriptor.element);
      await load(workflowModuleId, webPath, descriptor.entry);
      const element = document.createElement(descriptor.element);
      Object.assign(element, properties);
      answerRequests(element);
      container.append(element);
      return element;
    },
    /**
     * Asks the modules for an entry. A row entry asks the one module of the row; any other entry asks every module.
     * A module whose manifest does not name the entry is skipped without a message; a named entry which fails is reported.
     */
    async askModules(modules: readonly ModuleRef[], entry: DataEntry, ...args: unknown[]): Promise<Map<string, unknown>> {
      if (ROW_ENTRIES.includes(entry) && modules.length !== 1) {
        throw new Error(`${entry} asks only the module of the row, got ${modules.length} modules`);
      }
      const answers = new Map<string, unknown>();
      await Promise.all(modules.map(async ({ workflowModuleId, webPath }) => {
        try {
          const { manifest } = await manifestOf(workflowModuleId, webPath);
          if (manifest.entries[entry] === undefined) return;
          const answer = await this.ask(workflowModuleId, webPath, entry, ...args);
          if (answer !== undefined) answers.set(workflowModuleId, answer);
        } catch (error) { onProblem(workflowModuleId, error); }
      }));
      return answers;
    },
    /** Asks the entry once for each area (the areas of the interview, or `all`) and draws what is answered. */
    async drawAreas(workflowModuleId: string, webPath: string, entry: DataEntry, data: unknown, areas: readonly string[], container: Element): Promise<Record<string, HTMLElement>> {
      const drawn: Record<string, HTMLElement> = {};
      for (const area of areas.length ? areas : [AREA_ALL]) {
        const descriptor = await this.ask(workflowModuleId, webPath, entry, data, area);
        if (!isDescriptor(descriptor)) continue;
        const slot = container.appendChild(document.createElement('div'));
        slot.dataset.area = area;
        drawn[area] = await this.draw(workflowModuleId, webPath, descriptor, slot, { userTask: data, workflow: data, area });
      }
      return drawn;
    },
  };
}
export * from './registry.js';
