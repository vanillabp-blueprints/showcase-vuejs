import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { defineBcElement } from '@acme/bc-module-kit';
import { names } from './element-names.js';

const roots = new WeakMap();

defineBcElement(names.custom('risk-badge'), {
  mount: (root) => {
    roots.set(root, createRoot(root));
    roots.get(root).render(createElement('span', { 'data-testid': 'react-header', 'data-framework': 'react' }, 'React risk'));
  },
  unmount: (root) => { roots.get(root)?.unmount(); roots.delete(root); },
});
