<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { updateStreamUrl } from '../api/clients';
import { text } from '../i18n/messages';
import { drawFormOf } from '../modules/modules';
import { loadTask, openTask, openTaskFailed, tellTaskChanged } from './openTask';

const props = defineProps<{ id: string }>();

const container = ref<HTMLElement>();
// `unopenable`: the cockpit cannot reach the module of the task; `failed`: the task or its form could not be loaded
const state = ref<'loading' | 'drawn' | 'unopenable' | 'failed'>('loading');

// an update of the task shows in the header at once, for example a task activated again (ACT-017)
const updates = new EventSource(updateStreamUrl());
updates.addEventListener('UserTask', () => void loadTask(props.id, false));
onBeforeUnmount(() => updates.close());

onMounted(async () => {
  await loadTask(props.id, true);
  const task = openTask.value;
  if (!task) { state.value = 'failed'; return; }
  // opening marked it as read: the lists of the other tabs show it
  tellTaskChanged(task.id);
  try {
    state.value = (await drawFormOf(task, container.value!)) === 'unknown' ? 'unopenable' : 'drawn';
  } catch (error) {
    console.error(error instanceof Error ? error.message : error, error);
    state.value = 'failed';
  }
});
</script>

<template>
  <div data-testid="task-page" class="task-page" :data-state="state">
    <p v-if="state === 'unopenable'" data-testid="cannot-open" class="ma-4">{{ text().cannotOpenHere }}</p>
    <p v-else-if="state === 'failed' || openTaskFailed" data-testid="task-not-loaded" class="ma-4">{{ text().taskNotLoaded }}</p>
    <div ref="container" class="ma-4" />
  </div>
</template>
