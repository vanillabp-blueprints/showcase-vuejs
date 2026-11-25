import {
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
}

export class ModuleNameError extends Error {}

const isDescriptor = (answer: unknown): answer is BcElementDescriptor => typeof (answer as BcElementDescriptor | undefined)?.element === 'string';
const isValidElementName = (name: string) => /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/.test(name) && !RESERVED.includes(name);
const RESERVED = ['annotation-xml', 'color-profile', 'font-face', 'font-face-src', 'font-face-uri', 'font-face-format', 'font-face-name', 'missing-glyph'];

/** The registry and the loader of the modules: ask, load, draw. */
export function createModuleHost(options: ModuleHostOptions = {}) {
  const readText = options.readText ?? (async (url: string) => (await fetch(url, { cache: 'no-cache' })).text());
  const importFile = options.importFile ?? ((url: string) => import(/* @vite-ignore */ url) as Promise<Exports>);
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
      container.append(element);
      return element;
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
