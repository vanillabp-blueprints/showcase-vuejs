<script setup lang="ts">
import { computed, ref } from 'vue';
import { VBtn, VCard, VCardActions, VCardText, VDialog, VIcon, VMenu } from 'vuetify/components';
import { mdiAccountArrowRight, mdiAccountCheckOutline, mdiAccountMinusOutline, mdiCalendarClock, mdiEmailOutline, mdiNoteEditOutline } from '@mdi/js';
import { OfficialTasklistApi, type Person } from '../generated/official-gui-api';
import { text } from '../i18n/messages';
import { dayOf, startOfDay } from './followUp';
import { loadTask, openTask, tellTaskChanged } from './openTask';

// The actions on the open task (Q-TASK-HEADER-ACTIONS), always in the same place of the application header.
// The interview names no information for the header of a task (Q-TASK-HEADER-INFO), so none is shown.
const props = defineProps<{ currentUserId: string }>();
const tasks = () => new OfficialTasklistApi();

const task = computed(() => openTask.value);
// claim, unclaim and propose need a task that has not ended and is not suspended (ACT-016); follow-up and note need one that has not ended
const workedOn = computed(() => Boolean(task.value?.endedAt || task.value?.suspendedAt));
const ended = computed(() => Boolean(task.value?.endedAt));
const held = computed(() => Boolean(task.value?.assignee));
const failed = ref(false);

async function act(call: () => Promise<unknown>): Promise<void> {
  const id = task.value!.id;
  try { await call(); failed.value = false; } catch { failed.value = true; }
  await loadTask(id, false);
  tellTaskChanged(id);
}

const claimAsked = ref(false);
function claimClicked(): void {
  const assignee = task.value!.assignee;
  if (assignee && assignee.id !== props.currentUserId) { claimAsked.value = true; return; }
  void claim(Boolean(assignee));
}
const claim = (unclaim: boolean) => act(() => tasks().claimTask({ userTaskId: task.value!.id, unclaim }));
function answerClaim(yes: boolean): void {
  claimAsked.value = false;
  if (yes) void claim(false);
}

const proposals = ref<Person[]>([]);
const proposalsAsked = ref(false);
async function searchPersons(query: string): Promise<void> {
  try {
    proposals.value = (await tasks().findUsers({ query, limit: 10 })).users ?? [];
    proposalsAsked.value = true;
  } catch { failed.value = true; }
}
const proposeOpen = ref(false);
function propose(person: Person): void {
  proposeOpen.value = false;
  proposals.value = [];
  proposalsAsked.value = false;
  void act(() => tasks().assignTask({ userTaskId: task.value!.id, userId: person.id }));
}

const noteOpen = ref(false);
const noteDraft = ref('');
function saveNote(): void {
  noteOpen.value = false;
  void act(() => tasks().setUserTaskNote({ userTaskId: task.value!.id, noteRequest: { text: noteDraft.value } }));
}

const followUpOpen = ref(false);
const followUpDraft = ref('');
function setFollowUp(day: string | undefined): void {
  followUpOpen.value = false;
  void act(() => tasks().setFollowUpDate({ userTaskId: task.value!.id, followUpDateRequest: day ? { timestamp: startOfDay(day) } : {} }));
}

const markUnread = () => act(() => tasks().markTaskAsRead({ userTaskId: task.value!.id, unread: true }));
const claimLabel = computed(() => (held.value ? text().actions.unclaim : text().actions.claim));
</script>

<template>
  <span v-if="task" data-testid="task-actions" class="task-actions">
    <v-btn data-testid="task-action-claim" size="small" variant="text" :icon="held ? mdiAccountMinusOutline : mdiAccountCheckOutline" :title="claimLabel" :aria-label="claimLabel" :disabled="workedOn" @click="claimClicked" />
    <v-btn data-testid="task-action-propose" size="small" variant="text" icon :title="text().actions.proposeTo" :aria-label="text().actions.proposeTo" :disabled="workedOn">
      <v-icon :icon="mdiAccountArrowRight" />
      <v-menu v-model="proposeOpen" activator="parent" :close-on-content-click="false">
        <v-card data-testid="task-propose-popup" class="popup">
          <input data-testid="task-propose-search" type="search" :placeholder="text().actions.proposeTo + ': ' + text().actions.searchPerson" @input="searchPersons(($event.target as HTMLInputElement).value)" />
          <button v-for="person in proposals" :key="person.id" type="button" data-testid="task-propose-result" @click="propose(person)">{{ person.display ?? person.id }}</button>
          <div v-if="proposalsAsked && proposals.length === 0" data-testid="task-propose-none">{{ text().actions.noPerson }}</div>
        </v-card>
      </v-menu>
    </v-btn>
    <v-btn data-testid="task-action-follow-up" size="small" variant="text" icon :title="text().actions.followUp" :aria-label="text().actions.followUp" :disabled="ended" @click="followUpDraft = task.followUpDate ? dayOf(task.followUpDate) : ''">
      <v-icon :icon="mdiCalendarClock" />
      <v-menu v-model="followUpOpen" activator="parent" :close-on-content-click="false">
        <v-card data-testid="task-follow-up-popup" class="popup">
          <input v-model="followUpDraft" type="date" data-testid="task-follow-up-input" :aria-label="text().actions.followUp" />
          <div>
            <v-btn data-testid="task-follow-up-save" size="small" :disabled="!followUpDraft" @click="setFollowUp(followUpDraft)">{{ text().actions.save }}</v-btn>
            <v-btn data-testid="task-follow-up-delete" size="small" variant="text" @click="setFollowUp(undefined)">{{ text().actions.deleteFollowUp }}</v-btn>
          </div>
        </v-card>
      </v-menu>
    </v-btn>
    <v-btn data-testid="task-action-note" size="small" variant="text" icon :title="text().actions.note" :aria-label="text().actions.note" :disabled="ended" @click="noteDraft = task.note ?? ''">
      <v-icon :icon="mdiNoteEditOutline" />
      <v-menu v-model="noteOpen" activator="parent" :close-on-content-click="false">
        <v-card data-testid="task-note-popup" class="popup">
          <textarea v-model="noteDraft" data-testid="task-note-input" rows="4" maxlength="10000" :aria-label="text().actions.note" />
          <div>
            <v-btn data-testid="task-note-save" size="small" @click="saveNote">{{ text().actions.save }}</v-btn>
            <v-btn data-testid="task-note-cancel" size="small" variant="text" @click="noteOpen = false">{{ text().actions.cancel }}</v-btn>
          </div>
        </v-card>
      </v-menu>
    </v-btn>
    <v-btn data-testid="task-action-mark-unread" size="small" variant="text" :icon="mdiEmailOutline" :title="text().actions.markUnread" :aria-label="text().actions.markUnread" @click="markUnread" />
    <span v-if="failed" data-testid="task-action-failed" role="alert" class="failed">{{ text().actions.failed }}</span>
  </span>
  <v-dialog :model-value="claimAsked" max-width="420" @update:model-value="claimAsked = false">
    <v-card data-testid="claim-confirm">
      <v-card-text>{{ text().actions.claimFromOther.replace('{name}', task?.assignee?.display ?? task?.assignee?.id ?? '') }}</v-card-text>
      <v-card-actions>
        <v-btn data-testid="claim-confirm-yes" @click="answerClaim(true)">{{ text().actions.yes }}</v-btn>
        <v-btn data-testid="claim-confirm-no" variant="text" @click="answerClaim(false)">{{ text().actions.no }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.task-actions { display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; }
.failed { font-size: 0.8rem; color: rgb(var(--v-theme-error)); }
.popup { display: flex; flex-direction: column; gap: 8px; padding: 8px; min-width: 240px; }
.popup input, .popup textarea { border: 1px solid; padding: 4px; }
</style>
