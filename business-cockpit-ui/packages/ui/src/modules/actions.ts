import { minimumActions, type CockpitActions, type ModuleHost } from '@acme/bc-module-host';
import { OfficialTasklistApi, OfficialWorkflowlistApi } from '../generated/official-gui-api';
import { caseAddress, taskAddress } from '../routing';
import { placeToasts, toast } from './toast';

export { toast };

// What the actions of a part do in the cockpit. The user interface only changes a task through the GUI API
// the way a user does with a click; it never completes a task and never calls a module (EXT-057).
const tasks = () => new OfficialTasklistApi();

function navigate(address: string): void {
  window.history.pushState({}, '', address);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const open = new WeakMap<HTMLElement, (result: unknown) => void>();

/** Shows the web component in a modal dialog; resolves with what `closeDialog` hands over. */
function showDialog(host: ModuleHost, dialog: { element: string; entry: string; data?: unknown }, opener: HTMLElement): Promise<unknown> {
  const module = host.moduleOf(opener);
  if (!module) return Promise.reject(new Error('the part is unknown to the cockpit'));
  const shell = document.body.appendChild(document.createElement('dialog'));
  shell.dataset.testid = 'module-dialog';
  return new Promise<unknown>((resolve, reject) => {
    open.set(shell, resolve);
    // the user closes the dialog with Escape: the part which opened it is not left waiting
    shell.addEventListener('close', () => { open.delete(shell); removeShell(shell); resolve(undefined); });
    host.draw(module.workflowModuleId, module.webPath, { element: dialog.element, entry: dialog.entry }, shell, { data: dialog.data })
      .then(() => { shell.showModal?.(); placeToasts(); }, (error) => { removeShell(shell); reject(error); });
  });
}

function removeShell(shell: HTMLElement): void {
  shell.remove();
  placeToasts();
}

function hideDialog(result: unknown, element: HTMLElement): void {
  const shell = element.closest('dialog');
  const resolve = shell && open.get(shell);
  if (!shell || !resolve) throw new Error('the part is in no dialog');
  open.delete(shell);
  // the answer to the request goes out first, then the dialog and its web component are removed
  setTimeout(() => removeShell(shell), 0);
  resolve(result);
}

/** The actions of the minimum set; `host` is asked late, because the host is made with them. */
export function cockpitActions(host: () => ModuleHost) {
  const cockpit: CockpitActions = {
    openUserTask: (userTaskId) => navigate(taskAddress(userTaskId)),
    navigateToWorkflowOfUserTask: async (userTaskId) => {
      const { workflowId } = await tasks().getUserTask({ userTaskId });
      if (workflowId) navigate(caseAddress(workflowId));
    },
    claim: async (userTaskId) => void (await tasks().claimTask({ userTaskId })),
    unclaim: async (userTaskId) => void (await tasks().claimTask({ userTaskId, unclaim: true })),
    assign: async (userTaskId, userId) => void (await tasks().assignTask({ userTaskId, userId })),
    unassign: async (userTaskId, userId) => void (await tasks().assignTask({ userTaskId, userId, unassign: true })),
    navigateToWorkflow: (workflowId) => navigate(caseAddress(workflowId)),
    getUserTasks: async (workflowId, activeOnly, limit) => {
      const answer = await new OfficialWorkflowlistApi().getUserTasksOfWorkflow({ workflowId, llatcup: limit, userTasksRequest: { mode: 'All' } });
      return activeOnly ? answer.userTasks.filter((task) => !task.endedAt) : answer.userTasks;
    },
    showNotification: toast,
    openDialog: (dialog, opener) => showDialog(host(), dialog, opener),
    closeDialog: hideDialog,
  };
  return minimumActions(cockpit);
}
