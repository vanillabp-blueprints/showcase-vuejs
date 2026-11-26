// A module as its developer writes it: data entries and Vue components, handed to the dev shell as they are, not through a manifest.
import { h } from 'vue';
import { bootstrapDevShell } from '@acme/bc-dev-shell-vue';
import { actions, areaNames, moduleOptions } from './module-data.js';

const part = (name) => ({
  props: ['userTask', 'workflow', 'area', 'user', 'language'],
  render() {
    const data = this.userTask ?? this.workflow;
    const text = h('div', { 'data-testid': `part-${name}`, class: 'part' }, `${name}: ${data?.title?.en ?? 'no data'}`);
    if (name !== 'task' && name !== 'case') return text;
    return h('div', [text, h('span', { 'data-testid': 'part-language' }, `language: ${this.language}`), ...actions.map((action) => h('button', { 'data-action': action }, action))]);
  },
});

bootstrapDevShell('dev-shell', { ...moduleOptions, components: Object.fromEntries(Object.entries(areaNames).map(([name, element]) => [element, part(name)])) });
