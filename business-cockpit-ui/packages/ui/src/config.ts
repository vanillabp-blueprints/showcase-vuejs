// The one place which names the base path of the GUI API. Set VITE_GUI_API_BASE_PATH to move it.
export const guiApiBasePath: string = import.meta.env.VITE_GUI_API_BASE_PATH ?? '/gui/api/v1';

/** The list of what is assigned to the user personally, which the toggle of the header counts as My tasks. */
export const myTasksBasePath: string = `${guiApiBasePath}/current-user`;

/** The primary filters the counts of the header toggle use: the defaults of the interview, never the one chosen last. */
export const toggleTaskFilter = 'OpenTasksWithoutFollowUp';
export const toggleCaseFilter = 'InProgress';
