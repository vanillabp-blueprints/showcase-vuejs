import { createApp, h, shallowRef } from 'vue';
import { defineBcElement } from '@acme/bc-module-kit';
import { AREAS, names, partOf } from './element-names.js';

const apps = new WeakMap();
// One small application per web component; update only sets the new properties on the ref.
const mountIn = (root, props, area) => {
  const state = shallowRef(props);
  const app = createApp({ render: () => h('div', { 'data-testid': `vue-${area}`, 'data-framework': 'vue' }, `Vue ${area} of ${state.value.workflow?.id ?? 'case'}`) });
  const host = root.appendChild(document.createElement('div'));
  app.mount(host);
  apps.set(root, { app, state });
};

for (const area of AREAS) {
  defineBcElement(names.workflow('TaxiRide', partOf(area)), {
    mount: (root, props) => mountIn(root, props, area),
    update: (root, props) => { apps.get(root).state.value = props; },
    unmount: (root) => { apps.get(root)?.app.unmount(); apps.delete(root); },
  });
}
