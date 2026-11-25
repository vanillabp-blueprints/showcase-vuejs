import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { defineBcElement } from '@acme/bc-module-kit';
import { AREAS, names, partOf } from './element-names.js';

const roots = new WeakMap();
const draw = (root, props, area) => {
  if (!roots.has(root)) roots.set(root, createRoot(root));
  roots.get(root).render(createElement('div', { 'data-testid': `react-${area}`, 'data-framework': 'react' }, `React ${area} of ${props.userTask?.id ?? 'task'}`));
};

for (const area of AREAS) {
  defineBcElement(names.userTask('TaxiRide', 'assessRisk', partOf(area)), {
    mount: (root, props) => draw(root, props, area),
    update: (root, props) => draw(root, props, area),
    unmount: (root) => { roots.get(root)?.unmount(); roots.delete(root); },
  });
}
