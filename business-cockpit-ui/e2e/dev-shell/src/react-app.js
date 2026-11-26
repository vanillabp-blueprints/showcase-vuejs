// A module as its developer writes it: data entries and React components, handed to the dev shell as they are.
import { createElement } from 'react';
import { bootstrapDevShell } from '@acme/bc-dev-shell-react';
import { areaNames, moduleOptions } from './module-data.js';

const part = (name) => ({ userTask, workflow }) => createElement('div', { 'data-testid': `part-${name}`, className: 'part' }, `${name}: ${(userTask ?? workflow)?.title?.en ?? 'no data'}`);

bootstrapDevShell('dev-shell', { ...moduleOptions, components: Object.fromEntries(Object.entries(areaNames).map(([name, element]) => [element, part(name)])) });
