import { UserRightsApi } from '../generated/cockpit-gui-api';
import type { GroupHierarchyOfUser } from '../generated/cockpit-gui-api';

export type Kind = 'role' | 'right';
export type RightsRow = { name: string; kind: Kind; givenBy: string; fromOrganisation: boolean };
/** The id of the table of the groups the organisation gives when no module has a hierarchy; it has no module name. */
export const organisationTable = 'organisation';
export type RightsTable = { workflowModuleId: string; rows: RightsRow[] };

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The tables of the overview of roles and rights, one for each module which has something to show.
 * A group which a hierarchy gives is a role in every table, but has its own row only in the tables of the modules
 * whose entries give it (NAV-030); a group of the organisation without an entry anywhere has its row in every table.
 */
export function tablesOf(answer: GroupHierarchyOfUser): RightsTable[] {
  const fromOrganisation = new Set(answer.givenByOrganisation);
  const roles = new Set(answer.modules.flatMap((module) => module.entries.map((entry) => entry.group)));
  const tables = answer.modules.map((module) => {
    const entryGroups = new Set(module.entries.map((entry) => entry.group));
    const organisationRows = [...fromOrganisation]
      .filter((group) => entryGroups.has(group) || !roles.has(group))
      .map((group): RightsRow => ({ name: group, kind: 'role', givenBy: '', fromOrganisation: true }));
    const targetRows = module.entries.flatMap((entry) => entry.targets
      .filter((target) => !fromOrganisation.has(target))
      .map((target): RightsRow => ({ name: target, kind: roles.has(target) ? 'role' : 'right', givenBy: entry.group, fromOrganisation: false })));
    const seen = new Set<string>();
    const rows = [...organisationRows, ...targetRows]
      .filter((row) => !seen.has(`${row.name}\n${row.givenBy}`) && !!seen.add(`${row.name}\n${row.givenBy}`))
      .sort((a, b) => Number(a.kind === 'right') - Number(b.kind === 'right') || byName(a.name, b.name) || byName(a.givenBy, b.givenBy));
    return { workflowModuleId: module.workflowModuleId, rows };
  });
  const withRows = tables.filter((table) => table.rows.length > 0);
  // no module has a hierarchy, but the organisation gives groups: they are the roles of the user, in a table of their own (CUST-006)
  if (withRows.length === 0 && fromOrganisation.size > 0) {
    const rows = [...fromOrganisation].sort(byName).map((group): RightsRow => ({ name: group, kind: 'role', givenBy: '', fromOrganisation: true }));
    return [{ workflowModuleId: organisationTable, rows }];
  }
  return withRows;
}

let asked: Promise<RightsTable[]> | undefined;

/** The tables of the user. Asked on the first call only and kept until the page is loaded again; a failed request leaves no table. */
export function loadRights(): Promise<RightsTable[]> {
  asked ??= new UserRightsApi().getGroupHierarchyOfCurrentUser({ throwOnError: true }).then(tablesOf, () => []);
  return asked;
}
