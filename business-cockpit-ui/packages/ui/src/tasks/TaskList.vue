<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { VIcon, VSnackbar, VTable, VTooltip } from 'vuetify/components';
import { mdiAccount, mdiAccountMultiple } from '@mdi/js';
import { OfficialTasklistApi, type Person, type UserTask } from '../generated/official-gui-api';
import { guiApiBasePath, myTasksBasePath } from '../config';
import { dateCellDetails, dateCellText } from '../i18n/format';
import { language, text } from '../i18n/messages';
import { pickTranslation } from '../i18n/translatable';
import { taskAddress } from '../routing';
import { settingKey, settings } from '../settings/settings';
import StatusLine from './StatusLine.vue';
import { countedOnMouseOver, defaultPrimaryFilter, isPrimaryFilter, showsFollowUp, type PrimaryFilter } from './primaryFilters';

const props = defineProps<{ own: boolean; currentUserId: string }>();

// the fixed columns of Q-TASK-COLUMNS, in the order of the interview
const allColumns = ['id', 'businessId', 'caseKind', 'title', 'dueDate', 'assignee', 'candidateUsers', 'note', 'followUpDate', 'endedAt'] as const;

// the follow-up column shows only for the primary filters that list tasks put aside (TL-009)
const columns = computed(() => allColumns.filter((column) => column !== 'followUpDate' || showsFollowUp(filter.value)));

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
      <tr v-for="task in tasks" :key="task.id" data-testid="task-row">
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
        <td data-testid="cell-assignee">
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
        <td data-testid="cell-candidateUsers" class="icon-cell">
          <v-icon
            v-if="(task.candidateUsers ?? []).length > 0"
            data-testid="candidate-icon"
            :data-persons="task.candidateUsers!.length === 1 ? 'one' : 'several'"
            :icon="task.candidateUsers!.length === 1 ? mdiAccount : mdiAccountMultiple"
          />
        </td>
        <td data-testid="cell-note">{{ task.note }}</td>
        <td v-if="showsFollowUp(filter)" data-testid="cell-followUpDate">
          <template v-if="dateAndDetails(task.followUpDate)">
            {{ dateAndDetails(task.followUpDate)!.text }}
            <v-tooltip activator="parent" location="bottom">
              <span data-testid="date-details">{{ dateAndDetails(task.followUpDate)!.details }}</span>
            </v-tooltip>
          </template>
        </td>
        <td data-testid="cell-endedAt">
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
</style>
