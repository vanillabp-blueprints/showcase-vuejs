export * from './generated/index.js';

// One constant for each entry of ui-uri-types.json; the types jar is generated from that file.
export const UI_URI_TYPE_ES_MODULES = 'ES_MODULES';
export const UI_URI_TYPE_EXTERNAL = 'EXTERNAL';

/** The CSS custom properties the theme sets on the root. A module part may use them in its shadow DOM. */
export const THEME_TOKENS = [
  '--bc-color-primary',
  '--bc-color-background',
  '--bc-color-surface',
  '--bc-color-text',
  '--bc-color-row-new',
  '--bc-color-row-changed',
  '--bc-color-row-removed',
  '--bc-color-row-ended',
  '--bc-text-opacity-suspended',
  '--bc-font-family',
  '--bc-spacing',
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

// The minimum, the same as in the VanillaBP kit @vanillabp/bc-module-kit
export const USER_TASK_LIST = 'UserTaskList';
export const WORKFLOW_LIST = 'WorkflowList';
export const USER_TASK_FORM = 'UserTaskForm';
export const WORKFLOW_PAGE = 'WorkflowPage';
export const AREA_ALL = 'all';

// Extension point of this organisation (Q-EXTENSION-POINTS); `Pages` was not chosen
export const HEADER = 'Header';

// Areas of the page of a user task and of a case (Q-TASK-PAGE-AREAS, Q-WORKFLOW-PAGE-AREAS)
export const AREA_BODY = 'body';
export const AREA_INFORMATION = 'information';
export const AREA_ACTIONS = 'actions';

/** Entry -> the function the entry's file exports. The one list of the data entries of this cockpit. */
export const EXPORT_NAMES = {
  [USER_TASK_LIST]: 'userTaskListColumns',
  [WORKFLOW_LIST]: 'workflowListColumns',
  [USER_TASK_FORM]: 'userTaskForm',
  [WORKFLOW_PAGE]: 'workflowPage',
  [HEADER]: 'header',
} as const;

/** The entries which carry no framework; bc-check-entries checks their size and content. */
export const DATA_ENTRIES = Object.freeze(Object.keys(EXPORT_NAMES)) as readonly (keyof typeof EXPORT_NAMES)[];

// The event protocol between a part and the cockpit (module-loading.md, The event protocol)
export const REQUEST_EVENT = 'bc-request';
export const RESPONSE_EVENT = 'bc-response';
export const MESSAGE_EVENT = 'bc-message';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MANIFEST_FILE_NAME = 'bc-manifest.json';
export const MANIFEST_VERSION = 1;

export const ACTIONS = {
  openDialog: 'cockpit.openDialog',
  showNotification: 'cockpit.showNotification',
  claim: 'userTask.claim',
  sendTo: 'page.sendTo',
  subscribe: 'page.subscribe',
  unsubscribe: 'page.unsubscribe',
} as const;
export const ACTIONS_WITHOUT_TIMEOUT: readonly string[] = [ACTIONS.openDialog];

export const ERROR_CODES = { DISCONNECTED: 'DISCONNECTED', TIMEOUT: 'TIMEOUT', REFUSED: 'REFUSED' } as const;

export interface BcRequestDetail { requestId: string; action: string; args?: unknown }
export type BcResponseDetail =
  | { requestId: string; ok: true; result?: unknown }
  | { requestId: string; ok: false; error: { code: string; status?: number; message?: string } };

export interface BcManifest {
  manifestVersion: 1;
  buildVersion?: string;
  buildTimestamp?: string;
  /** Entry name -> file, relative to the manifest. */
  entries: { [entry: string]: string };
}

/** What a data entry answers: the web component to draw and the visual entry that defines it. */
export interface BcElementDescriptor { element: string; entry: string }
