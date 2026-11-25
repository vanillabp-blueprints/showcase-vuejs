<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { VBtn, VIcon } from 'vuetify/components';
import { mdiClose, mdiFilterRemoveOutline } from '@mdi/js';
import { text } from '../i18n/messages';
import { askAfter, minimalCharacters, shownSuggestions, type Suggestion } from './search';

const props = defineProps<{ applied: string; suggest: (query: string) => Promise<Suggestion[]> }>();
const emit = defineEmits<{ apply: [query: string]; reset: [] }>();

const draft = ref(props.applied);
const suggestions = ref<Suggestion[]>([]);
let timer: ReturnType<typeof setTimeout> | undefined;
let latest = 0;

// the search shows what was applied, also when a reset took it away
watch(() => props.applied, (applied) => {
  draft.value = applied;
  suggestions.value = [];
});

function typed(): void {
  clearTimeout(timer);
  suggestions.value = [];
  if (draft.value.length < minimalCharacters) return;
  const asked = draft.value;
  timer = setTimeout(async () => {
    const own = ++latest;
    const answer = await props.suggest(asked);
    if (own === latest && asked === draft.value) suggestions.value = shownSuggestions(answer);
  }, askAfter);
}

function apply(query: string): void {
  clearTimeout(timer);
  latest++;
  suggestions.value = [];
  draft.value = query;
  emit('apply', query);
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div class="search-bar" data-testid="search-bar">
    <div class="search-field">
      <input
        v-model="draft"
        data-testid="search-input"
        class="search-input"
        type="text"
        autocomplete="off"
        :placeholder="text().search.placeholder"
        :aria-label="text().search.placeholder"
        @input="typed"
        @keydown.enter="apply(draft)"
      />
      <v-btn v-if="draft" data-testid="search-clear" variant="text" size="x-small" icon :aria-label="text().search.clear" @click="apply('')">
        <v-icon :icon="mdiClose" />
      </v-btn>
      <div v-if="suggestions.length > 0" class="suggestions" data-testid="search-suggestions">
        <button v-for="suggestion in suggestions" :key="suggestion.item" type="button" data-testid="search-suggestion" class="suggestion" @click="apply(suggestion.item)">
          {{ suggestion.item }}
        </button>
      </div>
    </div>
    <v-btn data-testid="search-reset" variant="text" size="small" :prepend-icon="mdiFilterRemoveOutline" @click="emit('reset')">{{ text().search.reset }}</v-btn>
  </div>
</template>

<style scoped>
.search-bar { display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 16px; margin: 0 16px; }
.search-field { position: relative; flex: 1; display: flex; align-items: center; }
.search-input { flex: 1; border: 1px solid #9e9e9e; border-radius: 4px; padding: 6px 8px; background: rgba(255, 255, 255, 0.85); color: #212121; }
.suggestions { position: absolute; z-index: 6; top: 100%; left: 0; right: 0; max-height: 400px; overflow-y: auto; background: #fff; color: #212121; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
.suggestion { display: block; width: 100%; padding: 6px 8px; text-align: left; }
.suggestion:hover { background: #eeeeee; }
.search-field .v-btn { position: absolute; right: 4px; }
</style>
