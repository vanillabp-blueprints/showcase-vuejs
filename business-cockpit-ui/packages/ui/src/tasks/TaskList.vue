<script setup lang="ts">
import { ref, watch } from 'vue';
import { VIcon, VTable, VTooltip } from 'vuetify/components';
import { mdiAccount, mdiAccountMultiple } from '@mdi/js';
import { OfficialTasklistApi, type Person, type UserTask } from '../generated/official-gui-api';
import { guiApiBasePath, myTasksBasePath } from '../config';
import { dateCellDetails, dateCellText } from '../i18n/format';
import { language, text } from '../i18n/messages';
import { pickTranslation } from '../i18n/translatable';
import { taskAddress } from '../routing';

const props = defineProps<{ own: boolean; currentUserId: string }>();

// the fixed columns of Q-TASK-COLUMNS, in the order of the interview
const columns = ['id', 'businessId', 'caseKind', 'title', 'dueDate', 'assignee', 'candidateUsers', 'note', 'followUpDate', 'endedAt'] as const;

const tasks = ref<UserTask[]>([]);

async function load(): Promise<void> {
  const baseUrl = props.own ? myTasksBasePath : guiApiBasePath;
  const answer = await new OfficialTasklistApi().getUserTasks({ userTasksRequest: { pageSize: 20 } }, { baseUrl });
  tasks.value = answer.userTasks;
}
watch(() => props.own, load, { immediate: true });

const dateAndDetails = (value?: string): { text: string; details: string } | undefined =>
  value ? { text: dateCellText(new Date(value), language.value), details: dateCellDetails(new Date(value), language.value) } : undefined;

const shortForm = (person: Person): string => person.displayShort ?? person.display ?? person.id;
</script>

<template>
  <v-table data-testid="task-list" class="task-list ma-4">
    <thead>
      <tr>
        <th
          v-for="column in columns"
          :key="column"
          :data-testid="`column-header-${column}`"
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
        <td data-testid="cell-followUpDate">
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
  <p v-if="tasks.length === 0" class="ma-4" data-testid="no-tasks">{{ text().noTasks }}</p>
</template>

<style scoped>
/* white, partly transparent, so the background shows through, blurred where the browser can (TL-032) */
.task-list { background-color: rgba(255, 255, 255, 0.85); color: #212121; backdrop-filter: blur(8px); }
.bar-slot { display: inline-block; width: 6px; margin-right: 6px; height: 1.2em; vertical-align: middle; }
.bar { display: block; width: 3px; height: 100%; background-color: rgb(var(--v-theme-primary)); }
.icon-cell { width: 48px; max-width: 48px; padding: 0 !important; text-align: center; }
</style>
