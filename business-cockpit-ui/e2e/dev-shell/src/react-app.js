// A module as its developer writes it: data entries and React components, handed to the dev shell as they are.
import { createElement } from 'react';
import { bootstrapDevShell } from '@acme/bc-dev-shell-react';
import { actions, areaNames, moduleOptions } from './module-data.js';

const part = (name) => ({ userTask, workflow, language }) => {
  const text = createElement('div', { 'data-testid': `part-${name}`, className: 'part' }, `${name}: ${(userTask ?? workflow)?.title?.en ?? 'no data'}`);
  if (name !== 'task' && name !== 'case') return text;
  return createElement('div', null, text, createElement('span', { 'data-testid': 'part-language' }, `language: ${language}`), ...actions.map((action) => createElement('button', { key: action, 'data-action': action }, action)));
};

bootstrapDevShell('dev-shell', { ...moduleOptions, components: Object.fromEntries(Object.entries(areaNames).map(([name, element]) => [element, part(name)])) });
