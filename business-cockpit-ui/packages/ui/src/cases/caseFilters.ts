import type { WorkflowRetrieveMode } from '../generated/official-gui-api';

/** The primary filters of the case list (Q-WORKFLOW-FILTERS), in the order of the status line. */
export const caseFilters = ['InProgress', 'Done'] as const satisfies readonly WorkflowRetrieveMode[];
export type CaseFilter = (typeof caseFilters)[number];

export const defaultCaseFilter: CaseFilter = 'InProgress';

/** The ended column shows only for the primary filters which can hold an ended case (WL-013). */
export const showsEndedOfCases = (filter: CaseFilter): boolean => filter === 'Done';

// the fixed columns of Q-WORKFLOW-COLUMNS, in the order of the interview, with the path of their field in the GUI API (COL-021)
export const caseColumns = [
  { key: 'id', path: 'id' },
  { key: 'businessId', path: 'businessId' },
  { key: 'title', path: 'title' },
  { key: 'note', path: 'note' },
  { key: 'createdAt', path: 'createdAt' },
  { key: 'endedAt', path: 'endedAt' },
] as const;
