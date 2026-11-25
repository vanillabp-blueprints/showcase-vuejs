import { AREAS, names, partOf } from './element-names.js';

export const userTaskForm = (_task, area = 'all') => (AREAS.includes(area) ? { element: names.userTask('TaxiRide', 'assessRisk', partOf(area)), entry: 'FormViews' } : undefined);
