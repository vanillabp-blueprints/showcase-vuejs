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
