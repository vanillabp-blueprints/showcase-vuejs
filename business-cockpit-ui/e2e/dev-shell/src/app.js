// A module as its developer writes it: data entries and Vue components, handed to the dev shell as they are, not through a manifest.
import { h } from 'vue';
import { bootstrapDevShell } from '@acme/bc-dev-shell-vue';
import { areaNames, moduleOptions } from './module-data.js';

const part = (name) => ({
  props: ['userTask', 'workflow', 'area'],
  render() {
    const data = this.userTask ?? this.workflow;
    return h('div', { 'data-testid': `part-${name}`, class: 'part' }, `${name}: ${data?.title?.en ?? 'no data'}`);
  },
});

bootstrapDevShell('dev-shell', { ...moduleOptions, components: Object.fromEntries(Object.entries(areaNames).map(([name, element]) => [element, part(name)])) });
