import { createApp } from 'vue';
import { installTheme } from '@acme/bc-theme';
import { createDevShell, type DevShellOptions } from './shell.js';

export const devShellFramework = 'vue';
export { createDevShell, type DevShellOptions };

/** Renders the dev shell into the element with the id; the page looks like the cockpit: the theme comes from the theme library. */
export function bootstrapDevShell(elementId: string, options: DevShellOptions): void {
  const target = document.getElementById(elementId);
  if (!target) throw new Error(`the page has no element with the id ${elementId}`);
  installTheme();
  createApp(createDevShell(options)).mount(target);
}
