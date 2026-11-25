import type { UserTaskRetrieveMode } from '../generated/official-gui-api';

/** The primary filters of the task list (Q-PRIMARY-FILTERS), in the order of the status line. */
export const primaryFilters = ['OpenTasksWithoutFollowUp', 'OpenTasksWithFollowUp', 'ClosedTasksOnly'] as const;
export type PrimaryFilter = (typeof primaryFilters)[number] & UserTaskRetrieveMode;

export const defaultPrimaryFilter: PrimaryFilter = 'OpenTasksWithoutFollowUp';

/** Closed tasks only grow, so their count is asked on mouse-over and never kept (TL-003). */
export const countedOnMouseOver: PrimaryFilter = 'ClosedTasksOnly';

export const isPrimaryFilter = (value: unknown): value is PrimaryFilter => primaryFilters.includes(value as PrimaryFilter);

/** The follow-up column shows only where tasks put aside are part of the list (TL-009). */
export const showsFollowUp = (filter: PrimaryFilter): boolean => filter === 'OpenTasksWithFollowUp';
