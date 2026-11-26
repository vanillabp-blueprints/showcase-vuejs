import { createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { startDevShell, type DevShellCoreOptions, type DevShellRenderer } from '@acme/bc-module-kit';
import { installTheme } from '@acme/bc-theme';

export const devShellFramework = 'react';
export type DevShellOptions = DevShellCoreOptions<ComponentType<any>>;

/** The React component is the one imported from its source file; the root is rendered again when the props change. */
const renderer: DevShellRenderer<ComponentType<any>> = {
  draw(target, component, given) {
    const root = createRoot(target);
    root.render(createElement(component, given));
    return { update: (next) => root.render(createElement(component, next)), stop: () => root.unmount() };
  },
};

/** Renders the dev shell into the element with the id; the page looks like the cockpit: the theme comes from the theme library. */
export function bootstrapDevShell(elementId: string, options: DevShellOptions): void {
  const target = document.getElementById(elementId);
  if (!target) throw new Error(`the page has no element with the id ${elementId}`);
  installTheme();
  startDevShell(target, options, renderer);
}
