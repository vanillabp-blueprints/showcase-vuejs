<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { VBtn, VIcon, VSnackbar, VTable, VTooltip } from 'vuetify/components';
import { mdiAccount, mdiAccountMultiple, mdiDelete, mdiNoteEditOutline } from '@mdi/js';
import { OfficialTasklistApi, type Person, type UserTask } from '../generated/official-gui-api';
import { guiApiBasePath, myTasksBasePath } from '../config';
import { dateCellDetails, dateCellText } from '../i18n/format';
import { language, text } from '../i18n/messages';
import { pickTranslation } from '../i18n/translatable';
import { taskAddress } from '../routing';
import { settingKey, settings } from '../settings/settings';
import { stateOf } from './taskState';
import StatusLine from './StatusLine.vue';
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
const failed = ref(false);
const filter = ref<PrimaryFilter>(defaultPrimaryFilter);
const counts = reactive<Partial<Record<PrimaryFilter, number>>>({});

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

async function load(): Promise<void> {
  try {
    const answer = await new OfficialTasklistApi().getUserTasks({ userTasksRequest: { pageSize: 20, mode: filter.value } }, { baseUrl: baseUrl() });
    // the count of the chosen primary filter comes with the rows
    if (filter.value !== countedOnMouseOver || counts[countedOnMouseOver] !== undefined) counts[filter.value] = answer.page.totalElements;
    tasks.value = answer.userTasks;
    failed.value = false;
  } catch {
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
  await load();
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
async function act(call: () => Promise<unknown>): Promise<void> {
  try {
    await call();
    actionFailed.value = false;
  } catch {
    actionFailed.value = true;
  }
  await load();
}

const claim = (task: UserTask, unclaim: boolean) =>
  act(() => new OfficialTasklistApi().claimTask({ userTaskId: task.id, unclaim }, { baseUrl: baseUrl() }));
// a task can be claimed while nobody holds it, and given back by the one who holds it
const claimable = (task: UserTask): boolean => !task.endedAt && (!task.assignee || task.assignee.id === props.currentUserId);

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

const shortForm = (person: Person): string => person.displayShort ?? person.display ?? person.id;
</script>

<template>
  <v-table data-testid="task-list" class="task-list ma-4" fixed-header height="calc(100vh - 144px)">
    <thead>
      <tr>
        <th
          v-for="column in columns"
          :key="column"
          :data-testid="`column-header-${column}`"
          :data-path="paths[column]"
          :class="{ 'icon-cell': column === 'candidateUsers' }"
          :aria-label="column === 'candidateUsers' ? text().columns[column] : undefined"
        >
          <v-icon v-if="column === 'candidateUsers'" data-testid="candidate-header-icon" :icon="mdiAccountMultiple" />
          <template v-else>{{ text().columns[column] }}</template>
        </th>
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
            v-if="claimable(task)"
            type="checkbox"
            class="claim-checkbox"
            data-testid="claim-checkbox"
            :aria-label="task.assignee ? text().actions.unclaim : text().actions.claim"
            :checked="Boolean(task.assignee)"
            @change="claim(task, Boolean(task.assignee))"
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
                :disabled="Boolean(task.endedAt)"
                @click="removeCandidate(task, person)"
              ><v-icon :icon="mdiDelete" /></v-btn>
            </div>
            <template v-if="!task.endedAt">
              <input
                data-testid="propose-search"
                class="propose-search"
                type="search"
                :placeholder="text().actions.proposeTo + ': ' + text().actions.searchPerson"
                @input="searchPersons(($event.target as HTMLInputElement).value)"
              />
              <button v-for="person in proposals" :key="person.id" type="button" data-testid="propose-result" class="propose-result" @click="propose(task, person)">
                {{ person.display ?? person.id }}
              </button>
              <div v-if="proposalsAsked && proposals.length === 0" data-testid="propose-none">{{ text().actions.noPerson }}</div>
            </template>
          </div>
        </td>
        <td data-testid="cell-note" class="note-cell" @mouseenter="noteHoveredOf = task.id" @mouseleave="noteHoveredOf = undefined">
          <span>{{ task.note }}</span>
          <v-btn
            v-if="noteHoveredOf === task.id && noteEditedOf !== task.id"
            data-testid="note-edit"
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
      </tr>
    </tbody>
  </v-table>
  <p v-if="tasks.length === 0 && !failed" class="ma-4" data-testid="no-tasks">{{ text().noTasks }}</p>
  <status-line :selected="filter" :counts="counts" @choose="choose" @ask-count="askCounts([$event])" />
   <v-snackbar :model-value="actionFailed" data-testid="action-toast" timeout="4000" color="error" @update:model-value="actionFailed = false">{{ text().actions.failed }}</v-snackbar>
  <v-snackbar :model-value="failed" data-testid="list-toast" timeout="-1" color="error">{{ text().listNotLoaded }}</v-snackbar>
</template>

<style scoped>
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
.candidate-cell, .note-cell { position: relative; }
.over-list { position: absolute; z-index: 5; top: 100%; left: 0; min-width: 240px; padding: 8px; text-align: left; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
.candidate-person { display: flex; align-items: center; justify-content: space-between; }
.propose-search, .note-popup textarea { width: 100%; border: 1px solid #9e9e9e; padding: 4px; }
.propose-result { display: block; width: 100%; padding: 4px; text-align: left; }
</style>
