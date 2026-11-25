// The one place which names the base path of the GUI API. Set VITE_GUI_API_BASE_PATH to move it.
export const guiApiBasePath: string = import.meta.env.VITE_GUI_API_BASE_PATH ?? '/gui/api/v1';
