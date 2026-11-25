<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { VBtn, VCard, VCardActions, VCardText, VDialog } from 'vuetify/components';
import { text } from '../i18n/messages';
import { openTask } from './openTask';
import { bringListToFront } from './ownWindow';

// The button of the task tab (TF-007); it asks only when the current user holds the task, the one case where input may be lost (TF-017).
const props = defineProps<{ currentUserId: string }>();
const asked = ref(false);
const stuck = ref(false);
const guarded = computed(() => openTask.value?.assignee?.id === props.currentUserId);

const warn = (event: BeforeUnloadEvent) => event.preventDefault();
const arm = () => window.addEventListener('beforeunload', warn);
const disarm = () => window.removeEventListener('beforeunload', warn);
watch(guarded, (now) => { disarm(); if (now) arm(); }, { immediate: true });
onBeforeUnmount(disarm);

function clicked(): void {
  if (guarded.value) asked.value = true;
  else void leave();
}

// Everything which needs the click happens before the first await, so the browser still takes it as the click of the user (TF-018).
async function leave(): Promise<void> {
  asked.value = false;
  disarm();
  if (await bringListToFront()) {
    window.close();
    // still here: the browser did not let the cockpit close a tab it did not open
    setTimeout(() => { stuck.value = true; if (guarded.value) arm(); }, 100);
  } else {
    window.location.assign(text().routes.allTasks);
  }
}
</script>

<template>
  <v-btn data-testid="back-to-list" class="back" variant="flat" @click="clicked">{{ text().backToList.button }}</v-btn>
  <span v-if="stuck" data-testid="list-in-other-tab" role="status" class="stuck">{{ text().backToList.inOtherTab }}</span>
  <v-dialog :model-value="asked" max-width="420" @update:model-value="asked = false">
    <v-card data-testid="leave-confirm">
      <v-card-text>{{ text().backToList.ask }}</v-card-text>
      <v-card-actions>
        <v-btn data-testid="leave-confirm-yes" @click="leave">{{ text().actions.yes }}</v-btn>
        <v-btn data-testid="leave-confirm-no" variant="text" @click="asked = false">{{ text().actions.no }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* a fixed width, so the actions left of it keep their place whichever font draws the text */
.back.v-btn { background-color: #d32f2f; color: #fff; min-width: 10rem; }
.stuck { font-size: 0.8rem; margin: 0 8px; }
</style>
