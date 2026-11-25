import { createModuleHost, createModuleRegistry, type ModuleHost, type ModuleRef, type RowOfModule } from '@acme/bc-module-host';
import { HEADER } from '@acme/bc-module-kit';
import { OfficialWorkflowModulesApi } from '../generated/official-gui-api';
import { FailedCall } from '../api/clients';
import { language } from '../i18n/messages';
import { cockpitActions } from './actions';

// The one registry and the one loader of the cockpit: no component of the user interface imports a part of a module itself.
const api = new OfficialWorkflowModulesApi();
const registry = createModuleRegistry({
  all: async () => (await api.getWorkflowModules()).modules,
  one: async (workflowModuleId) => {
    try { return await api.getWorkflowModule({ workflowModuleId }); } catch (error) {
      if (error instanceof FailedCall && error.status === 404) return undefined;
      throw error;
    }
  },
});
const newBuildListeners = new Set<(workflowModuleId: string) => void>();
let user: unknown;
/** The user who is logged in; every part gets it as `currentUser`. */
export const setCurrentUser = (value: unknown): void => { user = value; };

export const host: ModuleHost = createModuleHost({
  actions: cockpitActions(() => host),
  context: () => ({ language: language.value, currentUser: user }),
  moduleIds: () => registry.ids(),
  onNewBuild: (workflowModuleId) => newBuildListeners.forEach((listener) => listener(workflowModuleId)),
});

/** Tells `listener` when a module has a new build; returns the function which stops it. */
export function onNewBuild(listener: (workflowModuleId: string) => void): () => void {
  newBuildListeners.add(listener);
  return () => newBuildListeners.delete(listener);
}

/** Reads the list of the modules the user may see; called once, after the current user is known. */
export const startModules = (): Promise<void> => registry.start();

/** The parts of a row: `true` when its module could be reached, `false` when this cockpit cannot open the row. */
export async function loadPartsOf(row: RowOfModule): Promise<boolean> {
  const opening = await registry.opening(row);
  if (opening.kind === 'unknown') return false;
  if (opening.kind === 'parts') await host.askModules([opening.module], 'UserTaskList');
  return true;
}

/** The modules whose parts a page may show: every module of the registry with the folder to load it from. */
export async function modulesToAsk(): Promise<ModuleRef[]> {
  return (await registry.all()).map((module) => ({ workflowModuleId: module.id, webPath: `/wm/${module.id}/` }));
}
