import { AREAS, names, partOf } from './element-names.js';

export const workflowPage = (_workflow, area = 'all') => (AREAS.includes(area) ? { element: names.workflow('TaxiRide', partOf(area)), entry: 'PageViews' } : undefined);
