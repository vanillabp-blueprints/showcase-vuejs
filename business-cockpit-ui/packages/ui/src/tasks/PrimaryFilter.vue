<script setup lang="ts">
import { VBtn, VBtnToggle, VTooltip } from 'vuetify/components';
import { formatNumber } from '../i18n/format';
import { language, text } from '../i18n/messages';
import { cappedNotice, isCapped } from './cappedNotice';
import { countedOnMouseOver, primaryFilters, type PrimaryFilter } from './primaryFilters';

defineProps<{ selected: PrimaryFilter; counts: Partial<Record<PrimaryFilter, number>> }>();
const emit = defineEmits<{ choose: [filter: PrimaryFilter]; 'ask-count': [filter: PrimaryFilter] }>();

const label = (filter: PrimaryFilter, count?: number): string =>
  count === undefined ? text().primaryFilters[filter] : `${text().primaryFilters[filter]} (${formatNumber(count, language.value)})`;
</script>

<template>
  <v-btn-toggle :model-value="selected" mandatory density="comfortable" variant="outlined" divided :aria-label="text().primaryFilter">
    <v-btn
      v-for="filter in primaryFilters"
      :key="filter"
      :data-testid="`primary-filter-${filter}`"
      :value="filter"
      :aria-pressed="filter === selected"
      @click="emit('choose', filter)"
      @mouseenter="filter === countedOnMouseOver && emit('ask-count', filter)"
    >{{ label(filter, counts[filter]) }}
      <v-tooltip v-if="isCapped(counts[filter])" activator="parent" location="bottom">{{ cappedNotice() }}</v-tooltip>
    </v-btn>
  </v-btn-toggle>
</template>
