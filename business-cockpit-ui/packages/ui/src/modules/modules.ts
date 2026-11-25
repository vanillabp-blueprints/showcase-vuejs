import { createModuleHost, createModuleRegistry, type ModuleRef, type RowOfModule } from '@acme/bc-module-host';
import { HEADER } from '@acme/bc-module-kit';
import { OfficialWorkflowModulesApi } from '../generated/official-gui-api';
import { FailedCall } from '../api/clients';

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
const host = createModuleHost();

/** Reads the list of the modules the user may see; called once, after the current user is known. */
export const startModules = (): Promise<void> => registry.start();

/** The parts of a row: `true` when its module could be reached, `false` when this cockpit cannot open the row. */
export async function loadPartsOf(row: RowOfModule): Promise<boolean> {
  const opening = await registry.opening(row);
  if (opening.kind === 'unknown') return false;
  if (opening.kind === 'parts') await host.askModules([opening.module], 'UserTaskList');
  return true;
}

/** Asks every module of the registry for its Header and draws what the modules answer into the container. */
export async function drawHeaders(container: Element): Promise<void> {
  const modules: ModuleRef[] = [];
  for (const module of await registry.all()) modules.push({ workflowModuleId: module.id, webPath: `/wm/${module.id}/` });
  const answers = await host.askModules(modules, HEADER);
  for (const [id, descriptor] of answers) {
    await host.draw(id, `/wm/${id}/`, descriptor as { element: string; entry: string }, container.appendChild(document.createElement('span')));
  }
}
