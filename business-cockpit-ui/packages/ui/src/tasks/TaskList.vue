<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { VBtn, VCard, VCardActions, VCardText, VDialog, VIcon, VSnackbar, VTable, VTooltip } from 'vuetify/components';
import { mdiAccount, mdiAccountMultiple, mdiArrowDown, mdiArrowUp, mdiCalendarClock, mdiClose, mdiDelete, mdiEmailOpenOutline, mdiEmailOutline, mdiNoteEditOutline } from '@mdi/js';
import { OfficialTasklistApi, type Person, type UserTask } from '../generated/official-gui-api';
import { FailedCall, updateStreamUrl } from '../api/clients';
import { guiApiBasePath, myTasksBasePath } from '../config';
import { dateCellDetails, dateCellText } from '../i18n/format';
import { language, text } from '../i18n/messages';
import { pickTranslation } from '../i18n/translatable';
import { taskAddress } from '../routing';
import { settingKey, settings } from '../settings/settings';
import { stateOf } from './taskState';
import { dayOf, startOfDay } from './followUp';
import StatusLine from './StatusLine.vue';
import SearchBar from './SearchBar.vue';
import { fullText, searchQueriesOf, type Suggestion } from './search';
import { isSortable, nextSort, sortPathOf, sortsByLanguage, type Sort } from './sorting';
import { countedOnMouseOver, defaultPrimaryFilter, isPrimaryFilter, showsEnded, showsFollowUp, type PrimaryFilter } from './primaryFilters';

const props = defineProps<{ own: boolean; currentUserId: string }>();

// the fixed columns of Q-TASK-COLUMNS, in the order of the interview
const allColumns = ['id', 'businessId', 'caseKind', 'title', 'dueDate', 'assignee', 'candidateUsers', 'note', 'followUpDate', 'endedAt'] as const;

// the follow-up column shows only for the primary filters that list tasks put aside (TL-009), the ended column only for closed tasks (TL-010)
const columns = computed(() =>
  allColumns.filter((column) => (column !== 'followUpDate' || showsFollowUp(filter.value)) && (column !== 'endedAt' || showsEnded(filter.value))),
);

// the path of the field of each column in the GUI API, which the list sorts and filters by (COL-021)
const paths: Record<(typeof allColumns)[number], string> = {
  id: 'id', businessId: 'businessId', caseKind: 'workflowTitle', title: 'title', dueDate: 'dueDate', assignee: 'assignee',
  candidateUsers: 'candidateUsers', note: 'note', followUpDate: 'followUpDate', endedAt: 'endedAt',
};

const tasks = ref<UserTask[]>([]);
// the moment the user started to look at this list; a new sort, a new search and opening the list start it again (SRCH-027)
const startedAt = ref<string>();
const sort = ref<Sort>();
const failed = ref(false);
// the text of a sort the server refused with 400, shown as it is (SRCH-034)
const refusedSort = ref<string>();
const filter = ref<PrimaryFilter>(defaultPrimaryFilter);
const counts = reactive<Partial<Record<PrimaryFilter, number>>>({});

// the searches by path, one entry per path (SRCH-005); the full-text search has the empty path (SRCH-001)
const searches = reactive<Record<string, string>>({});
const columnDrafts = reactive<Record<string, string>>({});
// the columns the user can set a filter on (COL-021)
const filterable: (typeof allColumns)[number][] = ['id', 'businessId', 'caseKind', 'title', 'note'];

function search(path: string, query: string): void {
  if (query === '') delete searches[path];
  else searches[path] = query;
  void load(true);
}
// a click on a sortable header sorts by it, a second turns the direction, a third goes back to the default (SRCH-007)
function sortBy(column: (typeof allColumns)[number]): void {
  if (!isSortable(column)) return;
  sort.value = nextSort(sort.value, column);
  void load(true);
}
const sortMarkOf = (column: (typeof allColumns)[number]): 'asc' | 'desc' | undefined =>
  sort.value?.column === column ? (sort.value.ascending ? 'asc' : 'desc') : undefined;
// an i18n column sorts by the language the list shows, so a new language sorts again
watch(language, () => {
  if (sort.value && sortsByLanguage(sort.value.column)) void load(true);
});
const setColumnFilter = (column: (typeof allColumns)[number]) => search(paths[column], (columnDrafts[column] ?? '').trim());
function clearColumnFilter(column: (typeof allColumns)[number]): void {
  columnDrafts[column] = '';
  setColumnFilter(column);
}
function resetSearches(): void {
  for (const path of Object.keys(searches)) delete searches[path];
  for (const column of Object.keys(columnDrafts)) delete columnDrafts[column];
  void load(true);
}
async function suggest(query: string): Promise<Suggestion[]> {
  const others = searchQueriesOf({ ...searches, [fullText]: '' });
  try {
    return (await new OfficialTasklistApi().getUserTaskKwicResults({ query, kwicRequest: { searchQueries: others } }, { baseUrl: baseUrl() })).result;
  } catch {
    return [];
  }
}

const baseUrl = (): string => (props.own ? myTasksBasePath : guiApiBasePath);
// each list keeps the primary filter its user chose last (TL-005)
const filterSetting = (): string => settingKey('tasks', props.own ? 'own' : 'all', 'primaryFilter');

async function askCounts(filters: PrimaryFilter[]): Promise<void> {
  try {
    const answer = await new OfficialTasklistApi().countUserTasks(
      { userTaskCountsRequest: { filters: filters.map((mode) => ({ key: mode, mode })) } },
      { baseUrl: baseUrl() },
    );
    for (const { key, count } of answer.counts) counts[key as PrimaryFilter] = count;
  } catch {
    // a count which cannot be asked stays as it was
  }
}

async function load(startAgain = false): Promise<void> {
  if (startAgain) startedAt.value = undefined;
  refusedSort.value = undefined;
  try {
    const sorted = sort.value ? { sort: sortPathOf(sort.value.column, language.value), sortAscending: sort.value.ascending } : {};
    const answer = await new OfficialTasklistApi().getUserTasks(
      { initialTimestamp: startedAt.value, userTasksRequest: { pageSize: 20, mode: filter.value, searchQueries: searchQueriesOf(searches), ...sorted } },
      { baseUrl: baseUrl() },
    );
    startedAt.value ??= answer.serverTimestamp;
    // the count of the chosen primary filter comes with the rows
    if (filter.value !== countedOnMouseOver || counts[countedOnMouseOver] !== undefined) counts[filter.value] = answer.page.totalElements;
    tasks.value = answer.userTasks;
    failed.value = false;
  } catch (error) {
    if (sort.value && error instanceof FailedCall && error.status === 400 && error.answer) {
      // the list falls back to its default order, and no column carries the sort mark
      sort.value = undefined;
      await load(true);
      refusedSort.value = error.answer;
      return;
    }
    // no rows, the toolbar stays, and the toast says it without a status code (TL-033)
    tasks.value = [];
    failed.value = true;
  }
}

async function open(): Promise<void> {
  const chosenLast = await settings.read(filterSetting());
  filter.value = isPrimaryFilter(chosenLast) ? chosenLast : defaultPrimaryFilter;
  delete counts[countedOnMouseOver];
  void askCounts(['OpenTasksWithoutFollowUp', 'OpenTasksWithFollowUp']);
  await load(true);
}
watch(() => props.own, open, { immediate: true });

function choose(chosen: PrimaryFilter): void {
  if (chosen === filter.value) return;
  filter.value = chosen;
  settings.write(filterSetting(), chosen);
  void load();
}

const dateAndDetails = (value?: string): { text: string; details: string } | undefined =>
  value ? { text: dateCellText(new Date(value), language.value), details: dateCellDetails(new Date(value), language.value) } : undefined;

// the tools of a row (ACT-001, ACT-003, ACT-004, TL-025): each asks the server, then the list is read again so the row shows the answer
const actionFailed = ref(false);
type Failure = 'failed' | 'ended' | 'suspendedNow' | 'heldByOther';
const failure = ref<Failure>('failed');
// a 409 means the task ended or was suspended in the meantime (ACT-013), a 400 of unclaim that another user holds it (ACT-015);
// the list is read again either way, and the reread row tells which of the two it was
async function act(call: () => Promise<unknown>, about?: { task: UserTask; unclaim?: boolean }): Promise<void> {
  let status: number | undefined;
  try {
    await call();
    actionFailed.value = false;
  } catch (error) {
    status = error instanceof FailedCall ? error.status : undefined;
    failure.value = 'failed';
    actionFailed.value = true;
  }
  await load();
  if (!about || !actionFailed.value) return;
  if (status === 409) {
    const reread = tasks.value.find((candidate) => candidate.id === about.task.id);
    failure.value = reread?.suspendedAt && !reread.endedAt ? 'suspendedNow' : 'ended';
  } else if (status === 400 && about.unclaim) failure.value = 'heldByOther';
}

const claim = (task: UserTask, unclaim: boolean) =>
  act(() => new OfficialTasklistApi().claimTask({ userTaskId: task.id, unclaim }, { baseUrl: baseUrl() }), { task, unclaim });
// claiming takes a task out of a colleague's hands, so the user is asked first, every time (ACT-012)
const claimAskedOf = ref<UserTask>();
function claimClicked(task: UserTask, event: Event): void {
  const box = event.target as HTMLInputElement;
  if (task.assignee && task.assignee.id !== props.currentUserId) {
    box.checked = false;
    claimAskedOf.value = task;
    return;
  }
  void claim(task, Boolean(task.assignee));
}
const holderName = computed(() => claimAskedOf.value?.assignee?.display ?? claimAskedOf.value?.assignee?.id ?? '');
function answerClaimQuestion(yes: boolean): void {
  const asked = claimAskedOf.value;
  claimAskedOf.value = undefined;
  if (yes && asked) void claim(asked, false);
}
// claim, unclaim, propose and remove candidate need a task that has not ended and is not suspended (ACT-009, ACT-016)
const workedOn = (task: UserTask): boolean => Boolean(task.endedAt || task.suspendedAt);

// an update of a task may show it activated again, so the rows are read again without a reload (ACT-017)
const updates = new EventSource(updateStreamUrl());
updates.addEventListener('UserTask', () => void load());
onBeforeUnmount(() => updates.close());

const candidatesOpenOf = ref<string>();
const proposals = ref<Person[]>([]);
const proposalsAsked = ref(false);
async function searchPersons(query: string): Promise<void> {
  try {
    proposals.value = (await new OfficialTasklistApi().findUsers({ query, limit: 10 }, { baseUrl: baseUrl() })).users ?? [];
    proposalsAsked.value = true;
  } catch {
    actionFailed.value = true;
  }
}
function closeCandidates(): void {
  candidatesOpenOf.value = undefined;
  proposals.value = [];
  proposalsAsked.value = false;
}
const propose = (task: UserTask, person: Person) =>
  act(() => new OfficialTasklistApi().assignTask({ userTaskId: task.id, userId: person.id }, { baseUrl: baseUrl() }));
const removeCandidate = (task: UserTask, person: Person) =>
  act(() => new OfficialTasklistApi().assignTask({ userTaskId: task.id, userId: person.id, unassign: true }, { baseUrl: baseUrl() }));

const noteHoveredOf = ref<string>();
const noteEditedOf = ref<string>();
const noteDraft = ref('');
function editNote(task: UserTask): void {
  noteDraft.value = task.note ?? '';
  noteEditedOf.value = task.id;
}
async function saveNote(task: UserTask): Promise<void> {
  noteEditedOf.value = undefined;
  await act(() => new OfficialTasklistApi().setUserTaskNote({ userTaskId: task.id, noteRequest: { text: noteDraft.value } }, { baseUrl: baseUrl() }));
}

const markAsRead = (task: UserTask, unread: boolean) =>
  act(() => new OfficialTasklistApi().markTaskAsRead({ userTaskId: task.id, unread }, { baseUrl: baseUrl() }));

const followUpOpenOf = ref<string>();
const followUpDraft = ref('');
function editFollowUp(task: UserTask): void {
  followUpDraft.value = task.followUpDate ? dayOf(task.followUpDate) : '';
  followUpOpenOf.value = task.id;
}
async function setFollowUp(task: UserTask, day: string | undefined): Promise<void> {
  followUpOpenOf.value = undefined;
  await act(() => new OfficialTasklistApi().setFollowUpDate(
    { userTaskId: task.id, followUpDateRequest: day ? { timestamp: startOfDay(day) } : {} },
    { baseUrl: baseUrl() },
  ));
}

const shortForm = (person: Person): string => person.displayShort ?? person.display ?? person.id;
</script>

<template>
  <search-bar :applied="searches[fullText] ?? ''" :suggest="suggest" @apply="search(fullText, $event)" @reset="resetSearches" />
  <v-table data-testid="task-list" class="task-list ma-4" fixed-header height="calc(100vh - 192px)">
    <thead>
      <tr>
        <th
          v-for="column in columns"
          :key="column"
          :data-testid="`column-header-${column}`"
          :data-path="paths[column]"
          :data-sortable="isSortable(column)"
          :data-sort="sortMarkOf(column)"
          @click="sortBy(column)"
          :class="{ 'icon-cell': column === 'candidateUsers', sortable: isSortable(column) }"
          :aria-label="column === 'candidateUsers' ? text().columns[column] : undefined"
        >
          <v-icon v-if="column === 'candidateUsers'" data-testid="candidate-header-icon" :icon="mdiAccountMultiple" />
          <template v-else>{{ text().columns[column] }}</template>
          <v-icon v-if="sortMarkOf(column)" data-testid="sort-mark" size="small" :icon="sortMarkOf(column) === 'asc' ? mdiArrowUp : mdiArrowDown" />
        </th>
        <th data-testid="column-header-tools" class="tools-header" :aria-label="text().actions.tools" />
      </tr>
      <tr class="filter-row">
        <th v-for="column in columns" :key="column" class="filter-cell">
          <template v-if="filterable.includes(column)">
            <input
              v-model="columnDrafts[column]"
              :data-testid="`column-filter-${column}`"
              class="column-filter"
              type="text"
              :aria-label="`${text().search.filterBy} ${text().columns[column]}`"
              @change="setColumnFilter(column)"
            />
            <v-btn
              v-if="columnDrafts[column]"
              :data-testid="`column-filter-clear-${column}`"
              variant="text"
              size="x-small"
              icon
              :aria-label="text().search.clear"
              @click="clearColumnFilter(column)"
            ><v-icon :icon="mdiClose" /></v-btn>
          </template>
        </th>
        <th class="filter-cell" />
      </tr>
    </thead>
    <tbody>
      <tr v-for="task in tasks" :key="task.id" data-testid="task-row" :data-state="stateOf(task)" :class="['task-row', stateOf(task), { unread: !task.read }]">
        <td data-testid="cell-id">{{ task.id }}</td>
        <td data-testid="cell-businessId">{{ task.businessId }}</td>
        <td data-testid="cell-caseKind">{{ pickTranslation(task.workflowTitle ?? {}, language) }}</td>
        <td data-testid="cell-title">
          <a data-testid="task-title" :href="taskAddress(task.id)">{{ pickTranslation(task.title, language) }}</a>
        </td>
        <td data-testid="cell-dueDate">
          <template v-if="dateAndDetails(task.dueDate)">
            {{ dateAndDetails(task.dueDate)!.text }}
            <v-tooltip activator="parent" location="bottom">
              <span data-testid="date-details">{{ dateAndDetails(task.dueDate)!.details }}</span>
            </v-tooltip>
          </template>
        </td>
        <td data-testid="cell-assignee" class="assignee-cell">
          <input
            type="checkbox"
            class="claim-checkbox"
            data-testid="claim-checkbox"
            :aria-label="task.assignee ? text().actions.unclaim : text().actions.claim"
            :checked="Boolean(task.assignee)"
            :disabled="workedOn(task)"
            @change="claimClicked(task, $event)"
          />
          <template v-if="task.assignee">
            <span class="bar-slot"><span v-if="task.assignee.id === currentUserId" data-testid="claimed-bar" class="bar" /></span>
            <span data-testid="assignee-name">{{ shortForm(task.assignee) }}</span>
            <v-tooltip activator="parent" location="bottom">
              <div data-testid="assignee-details">
                <div>{{ task.assignee.display ?? task.assignee.id }}</div>
                <div>{{ task.assignee.id }}</div>
                <div v-if="task.assignee.email">{{ task.assignee.email }}</div>
              </div>
            </v-tooltip>
          </template>
        </td>
        <td
          data-testid="cell-candidateUsers"
          class="icon-cell candidate-cell"
          @mouseenter="candidatesOpenOf = task.id"
          @mouseleave="closeCandidates"
        >
          <v-icon
            v-if="(task.candidateUsers ?? []).length > 0"
            data-testid="candidate-icon"
            :data-persons="task.candidateUsers!.length === 1 ? 'one' : 'several'"
            :icon="task.candidateUsers!.length === 1 ? mdiAccount : mdiAccountMultiple"
          />
          <div v-if="candidatesOpenOf === task.id" class="over-list candidate-popup" data-testid="candidate-popup">
            <div v-for="person in task.candidateUsers ?? []" :key="person.id" data-testid="candidate-person" class="candidate-person">
              <span>{{ person.display ?? person.id }}</span>
              <v-btn
                data-testid="candidate-remove"
                variant="text"
                size="x-small"
                icon
                :aria-label="text().actions.remove"
                :disabled="workedOn(task)"
                @click="removeCandidate(task, person)"
              ><v-icon :icon="mdiDelete" /></v-btn>
            </div>
            <input
              data-testid="propose-search"
              class="propose-search"
              :disabled="workedOn(task)"
              type="search"
              :placeholder="text().actions.proposeTo + ': ' + text().actions.searchPerson"
              @input="searchPersons(($event.target as HTMLInputElement).value)"
            />
            <button v-for="person in proposals" :key="person.id" type="button" data-testid="propose-result" class="propose-result" @click="propose(task, person)">
              {{ person.display ?? person.id }}
            </button>
            <div v-if="proposalsAsked && proposals.length === 0" data-testid="propose-none">{{ text().actions.noPerson }}</div>
          </div>
        </td>
        <td data-testid="cell-note" class="note-cell" @mouseenter="noteHoveredOf = task.id" @mouseleave="noteHoveredOf = undefined">
          <span>{{ task.note }}</span>
          <v-btn
            v-if="noteHoveredOf === task.id && noteEditedOf !== task.id"
            data-testid="note-edit"
            :disabled="Boolean(task.endedAt)"
            variant="text"
            size="x-small"
            icon
            :aria-label="text().actions.editNote"
            @click="editNote(task)"
          ><v-icon :icon="mdiNoteEditOutline" /></v-btn>
          <div v-if="noteEditedOf === task.id" class="over-list note-popup" data-testid="note-popup">
            <textarea v-model="noteDraft" data-testid="note-input" rows="4" maxlength="10000" :aria-label="text().actions.note" />
            <div>
              <v-btn data-testid="note-save" size="small" @click="saveNote(task)">{{ text().actions.save }}</v-btn>
              <v-btn data-testid="note-cancel" size="small" variant="text" @click="noteEditedOf = undefined">{{ text().actions.cancel }}</v-btn>
            </div>
          </div>
        </td>
        <td v-if="showsFollowUp(filter)" data-testid="cell-followUpDate">
          <template v-if="dateAndDetails(task.followUpDate)">
            {{ dateAndDetails(task.followUpDate)!.text }}
            <v-tooltip activator="parent" location="bottom">
              <span data-testid="date-details">{{ dateAndDetails(task.followUpDate)!.details }}</span>
            </v-tooltip>
          </template>
        </td>
        <td v-if="showsEnded(filter)" data-testid="cell-endedAt">
          <template v-if="dateAndDetails(task.endedAt)">
            {{ dateAndDetails(task.endedAt)!.text }}
            <v-tooltip activator="parent" location="bottom">
              <span data-testid="date-details">{{ dateAndDetails(task.endedAt)!.details }}</span>
            </v-tooltip>
          </template>
        </td>
        <td data-testid="cell-tools" class="tools-cell">
          <v-btn
            :data-testid="task.read ? 'mark-unread' : 'mark-read'"
            variant="text"
            size="x-small"
            icon
            :aria-label="task.read ? text().actions.markUnread : text().actions.markRead"
            @click="markAsRead(task, Boolean(task.read))"
          ><v-icon :icon="task.read ? mdiEmailOutline : mdiEmailOpenOutline" /></v-btn>
          <v-btn
            data-testid="follow-up-edit"
            variant="text"
            size="x-small"
            icon
            :disabled="Boolean(task.endedAt)"
            :aria-label="text().actions.followUp"
            @click="editFollowUp(task)"
          ><v-icon :icon="mdiCalendarClock" /></v-btn>
          <div v-if="followUpOpenOf === task.id" class="over-list follow-up-popup" data-testid="follow-up-popup">
            <input v-model="followUpDraft" type="date" data-testid="follow-up-input" :aria-label="text().actions.followUp" />
            <div>
              <v-btn data-testid="follow-up-save" size="small" :disabled="!followUpDraft" @click="setFollowUp(task, followUpDraft)">{{ text().actions.save }}</v-btn>
              <v-btn data-testid="follow-up-delete" size="small" variant="text" @click="setFollowUp(task, undefined)">{{ text().actions.deleteFollowUp }}</v-btn>
              <v-btn data-testid="follow-up-cancel" size="small" variant="text" @click="followUpOpenOf = undefined">{{ text().actions.cancel }}</v-btn>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </v-table>
  <p v-if="tasks.length === 0 && !failed" class="ma-4" data-testid="no-tasks">{{ text().noTasks }}</p>
  <status-line :selected="filter" :counts="counts" @choose="choose" @ask-count="askCounts([$event])" />
   <v-snackbar :model-value="actionFailed" data-testid="action-toast" timeout="4000" color="error" @update:model-value="actionFailed = false">{{ text().actions[failure] }}</v-snackbar>
  <v-dialog :model-value="Boolean(claimAskedOf)" max-width="420" @update:model-value="claimAskedOf = undefined">
    <v-card data-testid="claim-confirm">
      <v-card-text>{{ text().actions.claimFromOther.replace('{name}', holderName) }}</v-card-text>
      <v-card-actions>
        <v-btn data-testid="claim-confirm-yes" @click="answerClaimQuestion(true)">{{ text().actions.yes }}</v-btn>
        <v-btn data-testid="claim-confirm-no" variant="text" @click="answerClaimQuestion(false)">{{ text().actions.no }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-snackbar :model-value="failed || refusedSort !== undefined" data-testid="list-toast" timeout="-1" color="error">{{ refusedSort ?? text().listNotLoaded }}</v-snackbar>
</template>

<style scoped>
th.sortable { cursor: pointer; user-select: none; }
.filter-cell { position: sticky; top: 56px; z-index: 2; padding: 0 4px !important; height: 36px !important; }
.column-filter { width: 100%; border: 1px solid #bdbdbd; border-radius: 4px; padding: 2px 24px 2px 6px; font-size: 0.85em; }
.filter-cell .v-btn { position: absolute; right: 6px; top: 6px; }
/* both scroll bars are always there, so the list does not draw itself again when one appears (COL-018) */
.task-list :deep(.v-table__wrapper) { overflow: scroll; }
.task-list :deep(table) { min-width: 1100px; }
/* white, partly transparent, so the background shows through, blurred where the browser can (TL-032) */
.task-list { background-color: rgba(255, 255, 255, 0.85); color: #212121; backdrop-filter: blur(8px); }
.bar-slot { display: inline-block; width: 6px; margin-right: 6px; height: 1.2em; vertical-align: middle; }
.bar { display: block; width: 3px; height: 100%; background-color: rgb(var(--v-theme-primary)); }
.icon-cell { width: 48px; max-width: 48px; padding: 0 !important; text-align: center; }
/* the look of a state (TL-023), a row the user has not read is bold, the whole row (TL-007) */
.task-row.unread td, .task-row.unread a { font-weight: 700; }
.task-row.completed, .task-row.cancelled { background-color: #e0e0e0; }
.task-row.cancelled a { text-decoration: line-through; }
.task-row.suspended td, .task-row.suspended a { color: rgba(33, 33, 33, 0.55); }
/* the claim checkbox shows on mouse-over of the assignee cell only (TL-014) */
.assignee-cell { position: relative; }
.claim-checkbox { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); visibility: hidden; }
.assignee-cell:hover .claim-checkbox { visibility: visible; }
/* the tools over the list do not move it (TL-030) */
.candidate-cell, .note-cell, .tools-cell { position: relative; }
.tools-cell, .tools-header { width: 96px; white-space: nowrap; }
.tools-cell { right: 0; }
.follow-up-popup { right: 0; left: auto; }
.over-list { position: absolute; z-index: 5; top: 100%; left: 0; min-width: 240px; padding: 8px; text-align: left; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
.candidate-person { display: flex; align-items: center; justify-content: space-between; }
.propose-search, .note-popup textarea { width: 100%; border: 1px solid #9e9e9e; padding: 4px; }
.propose-result { display: block; width: 100%; padding: 4px; text-align: left; }
</style>
