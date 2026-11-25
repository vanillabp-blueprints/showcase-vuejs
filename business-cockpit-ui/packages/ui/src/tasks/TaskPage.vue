<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { updateStreamUrl } from '../api/clients';
import { text } from '../i18n/messages';
import { drawFormOf, leaveFormOf } from '../modules/modules';
import { USER_TASK_FORM } from '@acme/bc-module-kit';
import { noteOf, type NoteKind, type Step } from '../modules/partNote';
import { loadTask, openTask, openTaskFailed, tellTaskChanged } from './openTask';

const props = defineProps<{ id: string }>();

const container = ref<HTMLElement>();
// `loading-task`, `loading-form` (the data entry) and `loading-visual` (the visual entry and its web components) are the loading states;
// `unopenable`: the cockpit cannot reach the module of the task; `no-form`: the module names no form for it; `failed`: see the note
type State = 'loading-task' | 'loading-form' | 'loading-visual' | 'drawn' | 'unopenable' | 'no-form' | 'failed';
const state = ref<State>('loading-task');
const note = ref<{ kind: NoteKind | 'task-failed'; message: string }>();

// an update of the task shows in the header at once, for example a task activated again (ACT-017)
const updates = new EventSource(updateStreamUrl());
updates.addEventListener('UserTask', () => void loadTask(props.id, false));
onBeforeUnmount(() => { updates.close(); if (container.value) leaveFormOf(container.value); });

async function open(): Promise<void> {
  if (container.value) { leaveFormOf(container.value); container.value.replaceChildren(); }
  note.value = undefined;
  state.value = 'loading-task';
  await loadTask(props.id, true);
  const task = openTask.value;
  if (!task || openTaskFailed.value) { note.value = { kind: 'task-failed', message: text().taskNotLoaded }; state.value = 'failed'; return; }
  // opening marked it as read: the lists of the other tabs show it
  tellTaskChanged(task.id);
  state.value = 'loading-form';
  let step: Step = 'ask';
  let entry: string = USER_TASK_FORM;
  try {
    const drawn = await drawFormOf(task, container.value!, (visualEntry) => { step = 'load'; entry = visualEntry; state.value = 'loading-visual'; });
    state.value = drawn === 'unknown' ? 'unopenable' : drawn.length === 0 ? 'no-form' : 'drawn';
  } catch (error) {
    console.error(error instanceof Error ? error.message : error, error);
    note.value = noteOf(error, step, task.workflowModuleId, entry);
    state.value = 'failed';
  }
}

onMounted(() => { openTask.value = undefined; void open(); });
const retryable = computed(() => note.value?.kind === 'task-failed' || note.value?.kind === 'ask-failed' || note.value?.kind === 'load-failed');
</script>

<template>
  <div data-testid="task-page" class="task-page" :data-state="state">
    <p v-if="state.startsWith('loading')" data-testid="task-loading" role="status" class="ma-4">{{ text().taskLoading[state.slice(8) as 'task' | 'form' | 'visual'] }}</p>
    <p v-else-if="state === 'unopenable'" data-testid="cannot-open" class="ma-4">{{ text().cannotOpenHere }}</p>
    <p v-else-if="state === 'no-form'" data-testid="task-note" data-kind="no-form" class="ma-4">{{ text().noFormForTask }}</p>
    <p v-else-if="note" data-testid="task-note" :data-kind="note.kind" role="alert" class="ma-4">
      {{ note.message }}
      <button v-if="retryable" data-testid="task-retry" type="button" @click="open">{{ text().partNotes.retry }}</button>
    </p>
    <div ref="container" class="ma-4" />
  </div>
</template>

<style scoped>
/* long and wide content scrolls here; the application header stays and the frame keeps the height of the window */
.task-page { height: calc(100vh - var(--v-layout-top, 0px)); overflow: auto; }
</style>
