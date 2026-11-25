import type { BcNotification } from '@acme/bc-module-kit';
import type { ActionHandler } from './index.js';

/** What the cockpit does for the actions of the minimum set; each one resolves once the server accepted the change. */
export interface CockpitActions {
  openUserTask(userTaskId: string): void | Promise<void>;
  navigateToWorkflowOfUserTask(userTaskId: string): void | Promise<void>;
  claim(userTaskId: string): Promise<void>;
  unclaim(userTaskId: string): Promise<void>;
  assign(userTaskId: string, userId: string): Promise<void>;
  unassign(userTaskId: string, userId: string): Promise<void>;
  navigateToWorkflow(workflowId: string): void | Promise<void>;
  getUserTasks(workflowId: string, activeOnly: boolean, limitListAccordingToCurrentUsersPermissions: boolean): Promise<unknown[]>;
  showNotification(notification: BcNotification): void | Promise<void>;
  openDialog(dialog: { element: string; entry: string; data?: unknown }, opener: HTMLElement): Promise<unknown>;
  closeDialog(result: unknown, element: HTMLElement): void | Promise<void>;
}

const field = <T>(args: unknown, name: string): T => (args as Record<string, T> | undefined)?.[name] as T;
const text = (args: unknown, name: string): string => {
  const value = field<unknown>(args, name);
  if (typeof value !== 'string' || !value) throw new TypeError(`the argument ${name} is missing`);
  return value;
};
const nothing = async (done: unknown) => { await done; };

/** The actions of the minimum set (module-loading.md, Actions) except the three of `page.*`, which the host answers itself. */
export function minimumActions(cockpit: CockpitActions): Record<string, ActionHandler> {
  return {
    'userTask.open': (args) => nothing(cockpit.openUserTask(text(args, 'userTaskId'))),
    'userTask.navigateToWorkflow': (args) => nothing(cockpit.navigateToWorkflowOfUserTask(text(args, 'userTaskId'))),
    'userTask.claim': (args) => nothing(cockpit.claim(text(args, 'userTaskId'))),
    'userTask.unclaim': (args) => nothing(cockpit.unclaim(text(args, 'userTaskId'))),
    'userTask.assign': (args) => nothing(cockpit.assign(text(args, 'userTaskId'), text(args, 'userId'))),
    'userTask.unassign': (args) => nothing(cockpit.unassign(text(args, 'userTaskId'), text(args, 'userId'))),
    'workflow.navigateToWorkflow': (args) => nothing(cockpit.navigateToWorkflow(text(args, 'workflowId'))),
    'workflow.getUserTasks': (args) => cockpit.getUserTasks(
      text(args, 'workflowId'), field<boolean>(args, 'activeOnly') ?? true, field<boolean>(args, 'limitListAccordingToCurrentUsersPermissions') ?? true),
    'cockpit.showNotification': (args) => nothing(cockpit.showNotification(args as BcNotification)),
    'cockpit.openDialog': (args, element) => cockpit.openDialog(args as { element: string; entry: string; data?: unknown }, element),
    'cockpit.closeDialog': (args, element) => nothing(cockpit.closeDialog(field<unknown>(args, 'result'), element)),
  };
}
