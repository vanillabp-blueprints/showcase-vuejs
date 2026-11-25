<script setup lang="ts">
import { ref, watch } from 'vue';
import { VTable, VTooltip } from 'vuetify/components';
import { OfficialTasklistApi, type Person, type UserTask } from '../generated/official-gui-api';
import { guiApiBasePath, myTasksBasePath } from '../config';
import { formatDate } from '../i18n/format';
import { language, text } from '../i18n/messages';
import { pickTranslation } from '../i18n/translatable';
import { taskAddress } from '../routing';

const props = defineProps<{ own: boolean }>();

// the fixed columns of Q-TASK-COLUMNS, in the order of the interview
const columns = ['id', 'businessId', 'caseKind', 'title', 'dueDate', 'assignee', 'candidateUsers', 'note', 'followUpDate', 'endedAt'] as const;

const tasks = ref<UserTask[]>([]);

async function load(): Promise<void> {
  const baseUrl = props.own ? myTasksBasePath : guiApiBasePath;
  const answer = await new OfficialTasklistApi().getUserTasks({ userTasksRequest: { pageSize: 20 } }, { baseUrl });
  tasks.value = answer.userTasks;
}
watch(() => props.own, load, { immediate: true });

const shortForm = (person: Person): string => person.displayShort ?? person.display ?? person.id;
const date = (value?: string): string => (value ? formatDate(new Date(value), language.value) : '');
</script>

<template>
  <v-table data-testid="task-list" class="ma-4">
    <thead>
      <tr>
        <th v-for="column in columns" :key="column" :data-testid="`column-header-${column}`">{{ text().columns[column] }}</th>
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
        <td data-testid="cell-dueDate">{{ date(task.dueDate) }}</td>
        <td data-testid="cell-assignee">
          <template v-if="task.assignee">
            {{ shortForm(task.assignee) }}
            <v-tooltip activator="parent" location="bottom">
              <div data-testid="assignee-details">
                <div>{{ task.assignee.display ?? task.assignee.id }}</div>
                <div>{{ task.assignee.id }}</div>
                <div v-if="task.assignee.email">{{ task.assignee.email }}</div>
              </div>
            </v-tooltip>
          </template>
        </td>
        <td data-testid="cell-candidateUsers">{{ (task.candidateUsers ?? []).map(shortForm).join(', ') }}</td>
        <td data-testid="cell-note">{{ task.note }}</td>
        <td data-testid="cell-followUpDate">{{ date(task.followUpDate) }}</td>
        <td data-testid="cell-endedAt">{{ date(task.endedAt) }}</td>
      </tr>
    </tbody>
  </v-table>
  <p v-if="tasks.length === 0" class="ma-4" data-testid="no-tasks">{{ text().noTasks }}</p>
</template>
