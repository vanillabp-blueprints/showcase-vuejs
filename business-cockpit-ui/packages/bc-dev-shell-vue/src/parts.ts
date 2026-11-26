import { createApp, h, reactive, type Component } from 'vue';
import { defineBcElement, type BcElementDescriptor } from '@acme/bc-module-kit';

export type DataFunction = (data: Record<string, unknown> | undefined, area: string) => BcElementDescriptor | undefined | Promise<BcElementDescriptor | undefined>;

/** The areas of the task page and of the case page of the cockpit (Q-TASK-PAGE-AREAS, Q-WORKFLOW-PAGE-AREAS). */
const PAGE_AREAS = ['body', 'information', 'actions'];

/**
 * Defines the web component of a name once: a host element with an open shadow root, the style of the module in front of the
 * Vue root, as the module's own visual entry does. The Vue component is the one imported from its source file.
 */
function define(name: string, component: Component, style: string): void {
  if (customElements.get(name)) return;
  const apps = new WeakMap<ShadowRoot, { props: Record<string, unknown>; stop: () => void }>();
  const draw = (root: ShadowRoot, given: Record<string, unknown>) => {
    const known = apps.get(root);
    if (known) { Object.assign(known.props, given); return; }
    const props = reactive({ ...given });
    const target = document.createElement('div');
    root.append(Object.assign(document.createElement('style'), { textContent: style }), target);
    const app = createApp({ render: () => h(component, props) });
    app.mount(target);
    apps.set(root, { props, stop: () => app.unmount() });
  };
  defineBcElement(name, {
    mount: (root, props) => draw(root, props),
    update: (root, props) => draw(root, props),
    unmount: (root) => { apps.get(root)?.stop(); apps.delete(root); },
  });
}

/** Asks the data entry and draws what it names into the container: the areas of the page, or `all`, as the cockpit picks them. */
export async function drawPart(
  container: HTMLElement, ask: DataFunction | undefined, data: Record<string, unknown>, dataName: 'userTask' | 'workflow',
  components: Record<string, Component>, style: string, user: unknown, workflowModuleId: string,
): Promise<string | undefined> {
  container.replaceChildren();
  const first = await ask?.(data, 'all');
  if (!first) return `the module names no part for ${dataName} ${String(data.id)}`;
  const named: Record<string, string> = typeof first.element === 'string' ? { all: first.element } : first.element;
  const prefix = workflowModuleId.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const areas = PAGE_AREAS.filter((area) => Object.hasOwn(named, area));
  for (const area of areas.length ? areas : ['all']) {
    const name = named[area];
    if (name === undefined) return `the module names no web component for the area ${area}`;
    if (!name.startsWith(`${prefix}-`)) return `the name ${name} is refused, it has to start with ${prefix}-`;
    const component = components[name];
    if (!component) return `no component was handed over for the web component ${name}`;
    define(name, component, style);
    const slot = container.appendChild(document.createElement('div'));
    if (area !== 'all') slot.dataset.area = area;
    const element = document.createElement(name);
    Object.assign(element, { [dataName]: data, area, user });
    slot.append(element);
  }
  return undefined;
}
