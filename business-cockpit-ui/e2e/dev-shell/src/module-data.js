// The data entries of the test module, the same for every framework: which web component draws which area.
import { createElementNames, functionsOf as functions } from '@acme/bc-module-kit';

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

/**
 * What a form of a module does with the functions of the cockpit, the same for every framework: a button with `data-action`
 * calls the function through the event protocol of its host element and writes the outcome into an `output` in the shadow root.
 */
const requests = {
  'notify-info': (host) => functions(host).showNotification({ level: 'info', text: 'Saved' }),
  'notify-sticky': (host) => functions(host).showNotification({ level: 'error', text: 'Stays here', sticky: true }),
  claim: (host) => functions(host).request('userTask.claim', { userTaskId: 't1' }),
  'unknown-action': (host) => functions(host).request('cockpit.makeCoffee', {}),
  'tasks-all': (host) => functions(host).request('workflow.getUserTasks', { workflowId: 'c1', activeOnly: false }).then((tasks) => tasks.map((task) => task.id).join(',')),
  'tasks-active': (host) => functions(host).request('workflow.getUserTasks', { workflowId: 'c1', activeOnly: true }).then((tasks) => tasks.map((task) => task.id).join(',')),
};
document.addEventListener('click', async (event) => {
  const button = event.composedPath()[0];
  const action = button?.dataset?.action;
  if (!action || !requests[action]) return;
  const root = button.getRootNode();
  const output = root.querySelector('output') ?? root.appendChild(Object.assign(document.createElement('output'), { }));
  output.dataset.testid = 'result';
  try { output.textContent = `${action}: ${(await requests[action](root.host)) ?? 'done'}`; } catch (error) { output.textContent = `${action}: failed ${error.code ?? error.message}`; }
});

export const actions = Object.keys(requests);
