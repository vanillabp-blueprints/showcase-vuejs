<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { text } from '../i18n/messages';
import { drawCasePageOf, leaveFormOf, updateCasePageOf } from '../modules/modules';
import { noteOf, type NoteKind, type Step } from '../modules/partNote';
import { WORKFLOW_PAGE } from '@acme/bc-module-kit';
import { loadCase, openCase, openCaseFailed } from './openCase';

const props = defineProps<{ id: string }>();

const container = ref<HTMLElement>();
// `loading-case`, `loading-page` (the data entry) and `loading-visual` (the visual entry and its web components) are the loading states;
// `unopenable`: the cockpit cannot reach the module of the case; `no-page`: the module names no page for it; `failed`: see the note
type State = 'loading-case' | 'loading-page' | 'loading-visual' | 'drawn' | 'unopenable' | 'no-page' | 'failed';
const state = ref<State>('loading-case');
const note = ref<{ kind: NoteKind | 'case-failed'; message: string }>();

onBeforeUnmount(() => { if (container.value) leaveFormOf(container.value); });

async function open(): Promise<void> {
  if (container.value) { leaveFormOf(container.value); container.value.replaceChildren(); }
  note.value = undefined;
  state.value = 'loading-case';
  await loadCase(props.id);
  const workflow = openCase.value;
  if (!workflow || openCaseFailed.value) { note.value = { kind: 'case-failed', message: text().caseNotLoaded }; state.value = 'failed'; return; }
  state.value = 'loading-page';
  let step: Step = 'ask';
  let entry: string = WORKFLOW_PAGE;
  try {
    const drawn = await drawCasePageOf(workflow, container.value!, (visualEntry) => { step = 'load'; entry = visualEntry; state.value = 'loading-visual'; });
    state.value = drawn === 'unknown' ? 'unopenable' : drawn.length === 0 ? 'no-page' : 'drawn';
  } catch (error) {
    console.error(error instanceof Error ? error.message : error, error);
    note.value = noteOf(error, step, workflow.workflowModuleId, entry);
    state.value = 'failed';
  }
}

// a case which changed (its note, for example) is given to the web components again
watch(openCase, (workflow) => { if (workflow && state.value === 'drawn' && container.value) updateCasePageOf(workflow, container.value); });

onMounted(() => { openCase.value = undefined; void open(); });
const retryable = computed(() => note.value?.kind === 'case-failed' || note.value?.kind === 'ask-failed' || note.value?.kind === 'load-failed');
</script>

<template>
  <div data-testid="case-page" class="case-page" :data-state="state">
    <p v-if="state.startsWith('loading')" data-testid="case-loading" role="status" class="ma-4">{{ text().caseLoading[state.slice(8) as 'case' | 'page' | 'visual'] }}</p>
    <p v-else-if="state === 'unopenable'" data-testid="cannot-open" class="ma-4">{{ text().cannotOpenCaseHere }}</p>
    <p v-else-if="state === 'no-page'" data-testid="case-note" data-kind="no-page" class="ma-4">{{ text().noPageForCase }}</p>
    <p v-else-if="note" data-testid="case-note" :data-kind="note.kind" role="alert" class="ma-4">
      {{ note.message }}
      <button v-if="retryable" data-testid="case-retry" type="button" @click="open">{{ text().partNotes.retry }}</button>
    </p>
    <div class="stage ma-4">
      <div ref="container" class="container" />
    </div>
  </div>
</template>

<style scoped>
/* long and wide content scrolls here; the application header stays and the frame keeps the height of the window */
.case-page { height: calc(100vh - var(--v-layout-top, 0px)); overflow: auto; }
.stage:has(> .container > [data-area='body'], > .container > [data-area='information'], > .container > [data-area='actions']) { height: calc(100% - 32px); }
/* With areas (WP-008): `body` on the left, `information` and `actions` in the column on the right, as on the page of a task. */
.container:has(> [data-area='body'], > [data-area='information'], > [data-area='actions']) {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 320px); grid-template-rows: minmax(0, 1fr) auto; gap: 16px;
  height: 100%;
}
.container :deep([data-area='body']) { grid-column: 1; grid-row: 1 / 3; min-height: 0; overflow: auto; }
.container :deep([data-area='information']) { grid-column: 2; grid-row: 1; min-height: 0; overflow-y: auto; }
.container :deep([data-area='actions']) { grid-column: 2; grid-row: 2; }
</style>
