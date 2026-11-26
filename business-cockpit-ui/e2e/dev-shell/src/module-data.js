// The data entries of the test module, the same for every framework: which web component draws which area.
import { createElementNames } from '@acme/bc-module-kit';

export const names = createElementNames('dev-module', 'dev');
export const areaNames = {
  body: names.userTask('areas', 'check', 'body'),
  information: names.userTask('areas', 'check', 'information'),
  actions: names.userTask('areas', 'check', 'actions'),
  task: names.userTask('ride', 'check', 'page'),
  case: names.workflow('ride', 'page'),
};

export const moduleOptions = {
  guiApiBase: '/official-api/gui/api/v1',
  workflowModuleId: 'dev-module',
  style: '.part { font-size: 14px; }',
  userTaskForm: (task) => task?.bpmnProcessId === 'areas'
    ? { element: { body: areaNames.body, information: areaNames.information, actions: areaNames.actions }, entry: 'Form' }
    : { element: areaNames.task, entry: 'Form' },
  workflowPage: () => ({ element: areaNames.case, entry: 'Page' }),
};
