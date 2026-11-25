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
  /** How long the cockpit waits for a web component to be defined after its visual entry loaded; the default is 10 seconds. */
  definedWithinMs?: number;
  /** How old the manifest of a module may get before it is read again; the default is `MANIFEST_RECHECK_MS`. */
  manifestRecheckMs?: number;
  /** The ids of the modules of the registry; a name may not start with the longer prefix of another one. */
  moduleIds?: () => readonly string[];
}

/** After this time the loader reads the manifest of a module again before it asks a part of it. */
export const MANIFEST_RECHECK_MS = 60_000;

export class ModuleNameError extends Error {
  constructor(message: string, readonly workflowModuleId = '', readonly element = '') { super(message); }
}

/** A visual entry loaded and the web component it names was not defined within the time limit. */
export class ElementNotDefined extends Error {
  constructor(readonly workflowModuleId: string, readonly entry: string, readonly element: string, limitMs: number) {
    super(`module ${workflowModuleId}: the entry ${entry} did not define the web component ${element} within ${limitMs} ms`);
  }
}

/** The browser could not create the web component, for example because its constructor throws. */
export class ElementCreateFailed extends Error {
  constructor(readonly workflowModuleId: string, readonly element: string, cause?: unknown) {
    super(`module ${workflowModuleId}: the web component ${element} could not be created${cause instanceof Error ? `: ${cause.message}` : ''}`, { cause });
  }
}

export const DEFINED_WITHIN_MS = 10_000;

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

/** What a page function answers: one web component name, or one for each area. */
interface PageParts { entry: string; element: string | Record<string, string> }
const isDescriptor = (answer: unknown): answer is BcElementDescriptor => typeof (answer as BcElementDescriptor | undefined)?.element === 'string';
const isPageParts = (answer: unknown): answer is PageParts => {
  const element = (answer as PageParts | undefined)?.element;
  return typeof (answer as PageParts | undefined)?.entry === 'string' && (typeof element === 'string' || (typeof element === 'object' && element !== null));
};
const namesOf = (parts: PageParts): string[] => (typeof parts.element === 'string' ? [parts.element] : Object.values(parts.element));
const isValidElementName = (name: string) => /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/.test(name) && !RESERVED.includes(name);
const RESERVED = ['annotation-xml', 'color-profile', 'font-face', 'font-face-src', 'font-face-uri', 'font-face-format', 'font-face-name', 'missing-glyph'];

/** The registry and the loader of the modules: ask, load, draw. */
export function createModuleHost(options: ModuleHostOptions = {}) {
  const readText = options.readText ?? (async (url: string) => (await fetch(url, { cache: 'no-cache' })).text());
  const importFile = options.importFile ?? ((url: string) => import(/* @vite-ignore */ url) as Promise<Exports>);
  const actions = options.actions ?? {};
  const onProblem = options.onProblem ?? ((id: string, error: unknown) => console.error(`module ${id}:`, error));
  type Read = { manifest: BcManifest; url: string };
  const manifests = new Map<string, { promise: Promise<Read>; readAt: number }>();
  const recheckMs = options.manifestRecheckMs ?? MANIFEST_RECHECK_MS;
  const moduleIds = options.moduleIds ?? (() => []);
  const files = new Map<string, Promise<Exports>>();
  const definedWithinMs = options.definedWithinMs ?? DEFINED_WITHIN_MS;
  const failures = new Map<string, number>();

  /** A failure is not kept: the next call reads the manifest again and calls `import()` again. */
  const keepUnlessFailed = <T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> => {
    if (!cache.has(key)) {
      const promise = make();
      cache.set(key, promise);
      promise.catch(() => { if (cache.get(key) === promise) cache.delete(key); });
    }
    return cache.get(key)!;
  };

  const readFresh = (webPath: string): Promise<Read> => {
    const url = new URL(`${webPath.replace(/\/?$/, '/')}${MANIFEST_FILE_NAME}`, globalThis.location?.href ?? 'http://localhost/').href;
    return readText(url).then((text) => ({ manifest: readManifest(text), url }));
  };

  /** The manifest of the module; it is read again when the last read is older than the recheck time, and a failed read keeps the old one. */
  const manifestOf = (workflowModuleId: string, webPath: string): Promise<Read> => {
    const held = manifests.get(workflowModuleId);
    if (!held) {
      const promise = readFresh(webPath);
      const entry = { promise, readAt: Date.now() };
      manifests.set(workflowModuleId, entry);
      promise.catch(() => { if (manifests.get(workflowModuleId) === entry) manifests.delete(workflowModuleId); });
      return promise;
    }
    if (Date.now() - held.readAt <= recheckMs) return held.promise;
    // the time is set first, so that parts which ask while the read runs wait for this one read
    const fresh = { promise: held.promise, readAt: Date.now() };
    manifests.set(workflowModuleId, fresh);
    fresh.promise = readFresh(webPath).catch(() => {
      // the old manifest serves; the next ask tries again
      fresh.readAt = held.readAt;
      return held.promise;
    });
    return fresh.promise;
  };

  // The browser keeps a failed `import()` of an address; a new query makes the second call a real one.
  const importAgain = async (address: string) => {
    const count = failures.get(address) ?? 0;
    try { return await importFile(count === 0 ? address : `${address}?retry=${count}`); } catch (error) {
      failures.set(address, count + 1);
      throw error;
    }
  };

  const load = async (workflowModuleId: string, webPath: string, entry: string) => {
    const { manifest, url } = await manifestOf(workflowModuleId, webPath);
    const address = entryUrl(manifest, entry, url);
    // a failed import may mean the module was deployed again: its manifest is read again as well
    return keepUnlessFailed(files, address, () => importAgain(address).catch((error) => { manifests.delete(workflowModuleId); throw error; }));
  };

  /** Waits for the browser to define the web component, for no longer than the time limit. */
  const defined = async (workflowModuleId: string, entry: string, element: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ElementNotDefined(workflowModuleId, entry, element, definedWithinMs)), definedWithinMs);
    });
    try { await Promise.race([customElements.whenDefined(element), late]); } finally { clearTimeout(timer); }
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
    const prefix = elementPrefix(workflowModuleId);
    const longerPrefixOfAnother = moduleIds().some((other) => {
      const otherPrefix = elementPrefix(other);
      return otherPrefix.length > prefix.length && name.startsWith(`${otherPrefix}-`);
    });
    if (!isValidElementName(name) || !name.startsWith(`${prefix}-`) || longerPrefixOfAnother) {
      throw new ModuleNameError(`module ${workflowModuleId}: the name ${name} is refused, it has to start with ${prefix}-`, workflowModuleId, name);
    }
  };

  return {
    /** Step 1: calls the function of a data entry; `undefined` or the names of the web components. */
    async ask(workflowModuleId: string, webPath: string, entry: DataEntry, ...args: unknown[]): Promise<unknown> {
      const exports = await load(workflowModuleId, webPath, entry);
      const answer = (await (exports[EXPORT_NAMES[entry]] as ((...a: unknown[]) => unknown) | undefined)?.(...args)) as unknown;
      if (isPageParts(answer)) namesOf(answer).forEach((name) => checkName(workflowModuleId, name));
      return answer;
    },
    /** Whether the manifest of the module names the entry; a module which does not has nothing to add. */
    async names(workflowModuleId: string, webPath: string, entry: string): Promise<boolean> {
      return (await manifestOf(workflowModuleId, webPath)).manifest.entries[entry] !== undefined;
    },
    /** Whether every web component of the part is defined already, so that drawing it needs no import and no wait. */
    isDefined(descriptor: PageParts): boolean {
      return namesOf(descriptor).every((name) => customElements.get(name) !== undefined);
    },
    /** Step 2: loads the visual entry, unless the web component is defined already, and waits until it is defined. */
    async loadVisual(workflowModuleId: string, webPath: string, descriptor: BcElementDescriptor): Promise<void> {
      checkName(workflowModuleId, descriptor.element);
      if (customElements.get(descriptor.element)) return;
      await load(workflowModuleId, webPath, descriptor.entry);
      await defined(workflowModuleId, descriptor.entry, descriptor.element);
    },
    /** Steps 2 and 3: loads the visual entry and puts the web component into the container. */
    async draw(workflowModuleId: string, webPath: string, descriptor: BcElementDescriptor, container: Element, properties: Record<string, unknown> = {}): Promise<HTMLElement> {
      await this.loadVisual(workflowModuleId, webPath, descriptor);
      let element: HTMLElement;
      try {
        element = document.createElement(descriptor.element);
        // a constructor which throws leaves the browser with a plain element instead of the web component
        if (!(element instanceof customElements.get(descriptor.element)!)) throw new Error('the constructor of the web component failed');
        Object.assign(element, properties);
      } catch (error) { throw new ElementCreateFailed(workflowModuleId, descriptor.element, error); }
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
    /**
     * The page of a user task or a case: the areas of the cockpit which the module names are drawn and the others are ignored;
     * when none is left, or the cockpit has none, the web component of `all` is drawn. Returns what was drawn by area.
     */
    async drawPage(workflowModuleId: string, webPath: string, entry: DataEntry, data: unknown, cockpitAreas: readonly string[], container: Element): Promise<Record<string, HTMLElement>> {
      const parts = await this.ask(workflowModuleId, webPath, entry, data, AREA_ALL);
      if (!isPageParts(parts)) return {};
      const named: Record<string, string> = typeof parts.element === 'string' ? { [AREA_ALL]: parts.element } : parts.element;
      const known = cockpitAreas.filter((area) => Object.hasOwn(named, area));
      const areas = known.length ? known : Object.hasOwn(named, AREA_ALL) ? [AREA_ALL] : [];
      const drawn: Record<string, HTMLElement> = {};
      for (const area of areas) {
        const slot = container.appendChild(document.createElement('div'));
        slot.dataset.area = area;
        drawn[area] = await this.draw(workflowModuleId, webPath, { element: named[area], entry: parts.entry }, slot, { userTask: data, workflow: data, area });
      }
      return drawn;
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
