import { createApp, h, reactive, type Component } from 'vue';
import { startDevShell, type DevShellCoreOptions, type DevShellRenderer } from '@acme/bc-module-kit';
import { installTheme } from '@acme/bc-theme';

export const devShellFramework = 'vue';
export type DevShellOptions = DevShellCoreOptions<Component>;

/** The Vue component is the one imported from its source file; its props are reactive so that an update repaints it. */
const renderer: DevShellRenderer<Component> = {
  draw(target, component, given) {
    const props = reactive({ ...given });
    const app = createApp({ render: () => h(component, props) });
    app.mount(target);
    return { update: (next) => { Object.assign(props, next); }, stop: () => app.unmount() };
  },
};

/** Renders the dev shell into the element with the id; the page looks like the cockpit: the theme comes from the theme library. */
export function bootstrapDevShell(elementId: string, options: DevShellOptions): void {
  const target = document.getElementById(elementId);
  if (!target) throw new Error(`the page has no element with the id ${elementId}`);
  installTheme();
  startDevShell(target, options, renderer);
}
