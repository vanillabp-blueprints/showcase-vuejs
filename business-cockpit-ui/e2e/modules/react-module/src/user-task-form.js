import { AREAS, names, partOf } from './element-names.js';

const element = (area) => names.userTask('TaxiRide', 'assessRisk', partOf(area));

// A task of the process `areas` names one web component for each area of the page; any other task names the whole page.
export const userTaskForm = (task, area = 'all') => {
  if (task?.bpmnProcessId === 'areas') {
    return { element: Object.fromEntries(['body', 'information', 'actions'].map((one) => [one, element(one)])), entry: 'FormViews' };
  }
  return AREAS.includes(area) ? { element: element(area), entry: 'FormViews' } : undefined;
};
