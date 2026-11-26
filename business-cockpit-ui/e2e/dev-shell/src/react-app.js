// A module as its developer writes it: data entries and React components, handed to the dev shell as they are.
import { createElement } from 'react';
import { bootstrapDevShell } from '@acme/bc-dev-shell-react';
import { actions, areaNames, devShellPages, hasButtons, moduleOptions } from './module-data.js';

const part = (name) => ({ userTask, workflow, language }) => {
  const text = createElement('div', { 'data-testid': `part-${name}`, className: 'part' }, `${name}: ${(userTask ?? workflow)?.title?.en ?? 'no data'}`);
  if (!hasButtons(name)) return text;
  return createElement('div', null, text, createElement('span', { 'data-testid': 'part-language' }, `language: ${language}`), ...actions.map((action) => createElement('button', { key: action, 'data-action': action }, action)));
};

const devPage = ({ user, language }) => createElement('div', { 'data-testid': 'dev-page' }, `page: ${user} ${language}`);

bootstrapDevShell('dev-shell', { ...moduleOptions, devShellPages: devShellPages(devPage), components: Object.fromEntries(Object.entries(areaNames).map(([name, element]) => [element, part(name)])) });
