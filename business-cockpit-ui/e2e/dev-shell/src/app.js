// A module as its developer writes it: data entries and Vue components, handed to the dev shell as they are, not through a manifest.
import { h } from 'vue';
import { createElementNames } from '@acme/bc-module-kit';
import { bootstrapDevShell } from '@acme/bc-dev-shell-vue';

const names = createElementNames('dev-module', 'dev');
const part = (name) => ({
  props: ['userTask', 'workflow', 'area'],
  render() {
    const data = this.userTask ?? this.workflow;
    return h('div', { 'data-testid': `part-${name}`, class: 'part' }, `${name}: ${data?.title?.en ?? 'no data'}`);
  },
});

const components = {
  [names.userTask('areas', 'check', 'body')]: part('body'),
  [names.userTask('areas', 'check', 'information')]: part('information'),
  [names.userTask('areas', 'check', 'actions')]: part('actions'),
  [names.userTask('ride', 'check', 'page')]: part('task'),
  [names.workflow('ride', 'page')]: part('case'),
};

bootstrapDevShell('dev-shell', {
  guiApiBase: '/official-api/gui/api/v1',
  workflowModuleId: 'dev-module',
  components,
  style: '.part { font-size: 14px; }',
  userTaskForm: (task) => task?.bpmnProcessId === 'areas'
    ? { element: Object.fromEntries(['body', 'information', 'actions'].map((area) => [area, names.userTask('areas', 'check', area)])), entry: 'Form' }
    : { element: names.userTask('ride', 'check', 'page'), entry: 'Form' },
  workflowPage: () => ({ element: names.workflow('ride', 'page'), entry: 'Page' }),
});
