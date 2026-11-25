<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { updateStreamUrl } from '../api/clients';
import { text } from '../i18n/messages';
import { drawFormOf, leaveFormOf, updateFormOf } from '../modules/modules';
import { USER_TASK_FORM } from '@acme/bc-module-kit';
import { noteOf, type NoteKind, type Step } from '../modules/partNote';
import { barrierOf } from './taskState';
import { loadTask, openTask, openTaskFailed, tellTaskChanged } from './openTask';

const props = defineProps<{ id: string; currentUserId: string }>();

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

// The barrier lies over the drawn page while the task is suspended or not claimed (TF-035, TF-043); the form decides itself what is read-only (TF-038).
const barrier = computed(() => (state.value === 'drawn' ? barrierOf(openTask.value, props.currentUserId) : undefined));
const hostsOfForm = () => [...(container.value?.querySelectorAll<HTMLElement>(':scope > [data-area] > *') ?? [])];
watch([barrier, state], () => hostsOfForm().forEach((host) => { host.inert = barrier.value !== undefined; }), { flush: 'post' });
// a task which changed (claimed, activated again) is given to the web components again (TF-031, TF-044)
watch(openTask, (task) => { if (task && state.value === 'drawn' && container.value) updateFormOf(task, container.value); });

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
    <div class="stage ma-4">
      <div ref="container" class="container" />
      <div v-if="barrier" data-testid="task-barrier" class="barrier" :data-reason="barrier" role="note">{{ text().taskBarrier[barrier] }}</div>
    </div>
  </div>
</template>

<style scoped>
/* long and wide content scrolls here; the application header stays and the frame keeps the height of the window */
.task-page { height: calc(100vh - var(--v-layout-top, 0px)); overflow: auto; }
/* the barrier does not take the mouse nor the touch: the areas beneath stay readable and scroll, while their web components are inert */
.stage { position: relative; }
.stage:has(> .container > [data-area='body'], > .container > [data-area='information'], > .container > [data-area='actions']) { height: calc(100% - 32px); }
.barrier { position: absolute; inset: 0; pointer-events: none; background: rgba(128, 128, 128, 0.12); padding: 8px; font-weight: 500; z-index: 1; }
/* With areas (TF-041): `body` on the left, `information` and `actions` in the column on the right. The container has the visible height,
   `information` scrolls on its own and `actions` stays at the bottom, while a long `body` scrolls in its own area. The area `all` is not laid out. */
.container:has(> [data-area='body'], > [data-area='information'], > [data-area='actions']) {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 320px); grid-template-rows: minmax(0, 1fr) auto; gap: 16px;
  height: 100%;
}
.container :deep([data-area='body']) { grid-column: 1; grid-row: 1 / 3; min-height: 0; overflow: auto; }
.container :deep([data-area='information']) { grid-column: 2; grid-row: 1; min-height: 0; overflow-y: auto; }
.container :deep([data-area='actions']) { grid-column: 2; grid-row: 2; }
</style>
