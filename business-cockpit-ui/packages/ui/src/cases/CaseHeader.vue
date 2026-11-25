<script setup lang="ts">
import { computed, ref } from 'vue';
import { VIcon } from 'vuetify/components';
import { mdiNoteEditOutline } from '@mdi/js';
import { OfficialWorkflowlistApi } from '../generated/official-gui-api';
import { text } from '../i18n/messages';
import { loadCase, openCase } from './openCase';

// The actions on the open case (Q-WORKFLOW-HEADER-ACTIONS: the note), always in the same place of the application header.
// The interview names no information for the header of a case (Q-WORKFLOW-HEADER-INFO), so none is shown.
const workflow = computed(() => openCase.value);
const ended = computed(() => Boolean(workflow.value?.endedAt));
const failed = ref(false);

// The note is an input field of the header, saved on Enter and when the field loses focus, as for a task.
const typed = ref<string>();
const note = computed({ get: () => typed.value ?? workflow.value?.note ?? '', set: (value: string) => { typed.value = value; } });
async function saveNote(): Promise<void> {
  if (typed.value === undefined || typed.value === (workflow.value?.note ?? '')) { typed.value = undefined; return; }
  const noteText = typed.value;
  const workflowId = workflow.value!.id;
  typed.value = undefined;
  try { await new OfficialWorkflowlistApi().setWorkflowNote({ workflowId, noteRequest: { text: noteText } }); failed.value = false; } catch { failed.value = true; }
  await loadCase(workflowId);
}
</script>

<template>
  <span v-if="workflow" data-testid="case-actions" class="case-actions">
    <span data-testid="case-action-note" class="note">
      <v-icon :icon="mdiNoteEditOutline" size="small" />
      <input data-testid="case-note-input" type="text" maxlength="10000" :value="note" :disabled="ended" :placeholder="text().actions.note" :aria-label="text().actions.note"
        @input="note = ($event.target as HTMLInputElement).value" @keydown.enter="saveNote" @blur="saveNote" />
    </span>
    <span v-if="failed" data-testid="case-action-failed" role="alert" class="failed">{{ text().actions.failed }}</span>
  </span>
</template>

<style scoped>
.case-actions { display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; }
.note { display: inline-flex; align-items: center; gap: 4px; }
.note input { border: 1px solid; padding: 2px 6px; width: 160px; font-size: 0.85rem; }
.failed { font-size: 0.8rem; color: rgb(var(--v-theme-error)); }
</style>
