<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { BcElementDescriptor } from '@acme/bc-module-kit';
import type { DataEntry, ModuleRef } from '@acme/bc-module-host';
import { text } from '../i18n/messages';
import { host, onNewBuild } from './modules';
import { noteOf, type NoteKind, type Step } from './partNote';

// One part of a module in a page: ask, load and draw, each with its own state and its own error.
const props = defineProps<{ module: ModuleRef; entry: DataEntry; args?: unknown[]; properties?: Record<string, unknown>; asksAgainOnNewBuild?: boolean }>();

// `none`: the module has nothing for this entry, which is no error
const state = ref<'asking' | 'loading' | 'drawn' | 'none' | 'failed'>('asking');
const note = ref<{ kind: NoteKind; message: string }>();
const retried = ref(false);
const container = ref<HTMLElement>();

const isDescriptor = (answer: unknown): answer is BcElementDescriptor => typeof (answer as BcElementDescriptor | undefined)?.element === 'string';

async function run(): Promise<void> {
  const { workflowModuleId, webPath } = props.module;
  container.value?.replaceChildren();
  note.value = undefined;
  state.value = 'asking';
  let step: Step = 'ask';
  let entry: string = props.entry;
  try {
    if (!(await host.names(workflowModuleId, webPath, props.entry))) { state.value = 'none'; return; }
    const answer = await host.ask(workflowModuleId, webPath, props.entry, ...(props.args ?? []));
    if (!isDescriptor(answer)) { state.value = 'none'; return; }
    entry = answer.entry;
    step = 'load';
    // a web component defined already is drawn at once, without a loading state
    if (!host.isDefined(answer)) state.value = 'loading';
    await host.loadVisual(workflowModuleId, webPath, answer);
    step = 'draw';
    await host.draw(workflowModuleId, webPath, answer, container.value!, props.properties);
    state.value = 'drawn';
  } catch (error) {
    console.error(error instanceof Error ? error.message : error, error);
    note.value = noteOf(error, step, props.module.workflowModuleId, entry);
    state.value = 'failed';
  }
}

async function retry(): Promise<void> {
  retried.value = true;
  await run();
}

const reload = () => window.location.reload();

// a part of the header or the menu asks again when its module has a new build; a part of a page stays until the page is left
let stopWatching: (() => void) | undefined;
onMounted(() => {
  void run();
  if (props.asksAgainOnNewBuild) stopWatching = onNewBuild((id) => { if (id === props.module.workflowModuleId) void run(); });
});
onUnmounted(() => stopWatching?.());
</script>

<template>
  <span v-if="state !== 'none'" data-testid="module-part" :data-state="state" :data-module="module.workflowModuleId" :data-entry="entry" class="module-part">
    <span ref="container" />
    <span v-if="note" data-testid="part-note" :data-kind="note.kind" class="part-note">
      {{ note.message }}
      <button v-if="note.kind === 'ask-failed' || note.kind === 'load-failed'" data-testid="part-retry" type="button" @click="retry">{{ text().partNotes.retry }}</button>
      <button v-if="note.kind === 'module-updated'" data-testid="part-reload" type="button" @click="reload">{{ text().partNotes.reload }}</button>
      <button v-if="retried && (note.kind === 'ask-failed' || note.kind === 'load-failed')" data-testid="part-reload" type="button" @click="reload">{{ text().partNotes.reload }}</button>
    </span>
  </span>
</template>

<style scoped>
.module-part { display: inline-flex; align-items: center; gap: 8px; }
.part-note { font-size: 0.8rem; opacity: 0.8; }
</style>
