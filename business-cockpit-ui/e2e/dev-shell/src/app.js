// A module as its developer writes it: data entries and Vue components, handed to the dev shell as they are, not through a manifest.
import { h } from 'vue';
import { bootstrapDevShell } from '@acme/bc-dev-shell-vue';
import { actions, areaNames, devShellPages, hasButtons, moduleOptions } from './module-data.js';

const part = (name) => ({
  props: ['userTask', 'workflow', 'area', 'user', 'language'],
  render() {
    const data = this.userTask ?? this.workflow;
    const text = h('div', { 'data-testid': `part-${name}`, class: 'part' }, `${name}: ${data?.title?.en ?? 'no data'}`);
    if (!hasButtons(name)) return text;
    return h('div', [text, h('span', { 'data-testid': 'part-language' }, `language: ${this.language}`), ...actions.map((action) => h('button', { 'data-action': action }, action))]);
  },
});

const devPage = { props: ['user', 'language'], render() { return h('div', { 'data-testid': 'dev-page' }, `page: ${this.user} ${this.language}`); } };

bootstrapDevShell('dev-shell', { ...moduleOptions, devShellPages: devShellPages(devPage), components: Object.fromEntries(Object.entries(areaNames).map(([name, element]) => [element, part(name)])) });
