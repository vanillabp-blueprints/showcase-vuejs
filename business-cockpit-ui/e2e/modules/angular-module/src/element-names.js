import { createElementNames } from '@acme/bc-module-kit';
import { WORKFLOW_MODULE_ID, BUILD_ID } from './bc-build.js';

export const names = createElementNames(WORKFLOW_MODULE_ID, BUILD_ID);
export const AREAS = ['body', 'information', 'actions', 'all'];
// The part of a page: the whole page for `all`, otherwise the area.
export const partOf = (area) => (area === 'all' ? 'page' : area);
