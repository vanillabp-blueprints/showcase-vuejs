import { addressOf, createModuleHost, createModuleRegistry, type ModuleHost, type ModuleRef, type RowOfModule } from '@acme/bc-module-host';
import { HEADER, UI_URI_TYPE_EXTERNAL, USER_TASK_FORM, USER_TASK_LIST } from '@acme/bc-module-kit';
import type { Column as ModuleColumn } from '@acme/bc-types';
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

/** What a module's list part answered for one row: its columns, none, or a failure to load the part. */
export type ColumnsOfRow = { columns: ModuleColumn[] } | { failed: true };

/**
 * Loads the list part of the module of a row, once, and calls its column function with the row. A module which names no
 * list part brings no columns; a part which cannot be loaded or throws is a failure, so the row shows a note.
 */
export async function columnsOfRow(row: RowOfModule): Promise<ColumnsOfRow | undefined> {
  try {
    const opening = await registry.opening(row);
    if (opening.kind !== 'parts') return undefined;
    const { workflowModuleId, webPath } = opening.module;
    if (!(await host.names(workflowModuleId, webPath, USER_TASK_LIST))) return { columns: [] };
    const answer = await host.ask(workflowModuleId, webPath, USER_TASK_LIST, row);
    return { columns: Array.isArray(answer) ? (answer as ModuleColumn[]) : [] };
  } catch { return { failed: true }; }
}

/** The parts of a row: `true` when its module could be reached, `false` when this cockpit cannot open the row. */
export async function loadPartsOf(row: RowOfModule): Promise<boolean> {
  return (await registry.opening(row)).kind !== 'unknown';
}

/** The address of a task: its `uiUri` when that is whole, else a path of its module (TF-020). */
export const addressOfTask = (task: RowOfModule): string => addressOf(task);

/** A task which the cockpit does not draw: its address opens in a tab of its own (TF-019). */
export const isExternal = (task: RowOfModule): boolean => task.uiUriType === UI_URI_TYPE_EXTERNAL;

/** The modules whose parts a page may show: every module of the registry with the folder to load it from. */
export async function modulesToAsk(): Promise<ModuleRef[]> {
  return (await registry.all()).map((module) => ({ workflowModuleId: module.id, webPath: `/wm/${module.id}/` }));
}

/** The areas of the cockpit on the page of a user task (Q-TASK-PAGE-AREAS). */
const taskPageAreas = ['body', 'information', 'actions'];

/** The task page is left; what was kept for its areas is dropped (TF-022). */
export const leaveFormOf = (container: Element): void => host.leavePage(container);

/** The task of the open page changed: the web components of its form get it again. */
export const updateFormOf = (task: RowOfModule, container: Element): void => host.setData(container, USER_TASK_FORM, task);

/**
 * Draws the form of the module of a task into `container`. Answers `unknown` when the cockpit cannot open the task,
 * else the areas drawn (none when the module names no form for it).
 * `onLoadingVisual` is called when the visual entry has to be loaded.
 */
export async function drawFormOf(task: RowOfModule, container: Element, onLoadingVisual?: (entry: string) => void): Promise<'unknown' | string[]> {
  const opening = await registry.opening(task);
  if (opening.kind !== 'parts') return 'unknown';
  const { workflowModuleId, webPath } = opening.module;
  if (!(await host.names(workflowModuleId, webPath, USER_TASK_FORM))) return [];
  return Object.keys(await host.drawPage(workflowModuleId, webPath, USER_TASK_FORM, task, taskPageAreas, container, onLoadingVisual));
}
