import { UI_URI_TYPE_ES_MODULES, UI_URI_TYPE_EXTERNAL, elementPrefix } from '@acme/bc-module-kit';
import type { ModuleRef } from './index.js';

export interface RegisteredModule { id: string; version: number; uri: string }

/** The two calls of the GUI API the registry needs. `one` answers `undefined` for a module the user may not see. */
export interface ModuleSource {
  all(): Promise<RegisteredModule[]>;
  one(workflowModuleId: string): Promise<RegisteredModule | undefined>;
}

/** The part of a row which says what to load. */
export interface RowOfModule { workflowModuleId: string; uiUriType?: string; uiUri?: string }

export type RowOpening =
  | { kind: 'parts'; module: ModuleRef }
  | { kind: 'external'; address: string }
  | { kind: 'unknown' };

const isWholeAddress = (uiUri: string) => /^https?:\/\//.test(uiUri);

/** The address of a row: a whole address stays, any other `uiUri` is a path of the module. */
export const addressOf = (row: RowOfModule): string =>
  isWholeAddress(row.uiUri ?? '') ? row.uiUri! : `/wm/${row.workflowModuleId}/${(row.uiUri ?? '').replace(/^\//, '')}`;

/** The folder of the manifest which the address names; the loader reads the manifest from it. */
const webPathOf = (address: string): string => address.replace(/[^/]*$/, '');

/** The modules the user may see. It asks the server once at the start and once for each module of a row it does not know. */
export function createModuleRegistry(source: ModuleSource, onWarning: (message: string) => void = (message) => console.warn(message)) {
  const modules = new Map<string, Promise<RegisteredModule | undefined>>();
  let started: Promise<void> | undefined;
  const known = new Set<string>();
  const remember = (module: RegisteredModule | undefined) => {
    if (module && !known.has(module.id)) {
      const twin = [...known].find((id) => elementPrefix(id) === elementPrefix(module.id));
      if (twin) onWarning(`the modules ${twin} and ${module.id} have the same prefix ${elementPrefix(module.id)}, their web components may clash`);
      known.add(module.id);
    }
    return module;
  };

  return {
    /** Fills the registry from `GET /workflow-module`; a second call returns the first one's promise. */
    start(): Promise<void> {
      started ??= source.all().then((list) => {
        for (const module of list) if (!modules.has(module.id)) modules.set(module.id, Promise.resolve(remember(module)));
      });
      return started;
    },
    /** The ids of the modules known now, for the check of the names. */
    ids(): string[] { return [...known]; },
    /** Every module known now which has a web path to load from. */
    async all(): Promise<RegisteredModule[]> {
      await this.start();
      return (await Promise.all(modules.values())).filter((module): module is RegisteredModule => module !== undefined && module.uri !== '');
    },
    /** The module of a row; a module which registered after the start is asked for once and then kept. */
    async find(workflowModuleId: string): Promise<RegisteredModule | undefined> {
      await this.start();
      if (!modules.has(workflowModuleId)) modules.set(workflowModuleId, source.one(workflowModuleId).then(remember));
      return modules.get(workflowModuleId);
    },
    /** What the row asks for; the type decides, never the form of the address. */
    async opening(row: RowOfModule): Promise<RowOpening> {
      if (row.uiUriType === UI_URI_TYPE_EXTERNAL) return { kind: 'external', address: addressOf(row) };
      if (row.uiUriType !== UI_URI_TYPE_ES_MODULES) return { kind: 'unknown' };
      const module = await this.find(row.workflowModuleId);
      if (!module || !module.uri) return { kind: 'unknown' };
      return { kind: 'parts', module: { workflowModuleId: module.id, webPath: webPathOf(addressOf(row)) } };
    },
  };
}
