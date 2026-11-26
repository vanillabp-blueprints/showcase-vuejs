import { createApp, h, reactive, type Component } from 'vue';
import { drawDevShellPart, type DevShellContext, type DevShellCoreOptions, type DevShellDataFunction, type DevShellRenderer } from '@acme/bc-module-kit';

export type DataFunction = DevShellDataFunction;

/** The Vue component is the one imported from its source file; its props are reactive so that an update repaints it. */
const renderer: DevShellRenderer<Component> = {
  draw(target, component, given) {
    const props = reactive({ ...given });
    const app = createApp({ render: () => h(component, props) });
    app.mount(target);
    return { update: (next) => { Object.assign(props, next); }, stop: () => app.unmount() };
  },
};

export const drawPart = (
  container: HTMLElement, ask: DataFunction | undefined, data: Record<string, unknown>, dataName: 'userTask' | 'workflow',
  options: DevShellCoreOptions<Component>, style: string, context: DevShellContext,
) => drawDevShellPart(container, ask, data, dataName, { ...options, style }, renderer, context);
