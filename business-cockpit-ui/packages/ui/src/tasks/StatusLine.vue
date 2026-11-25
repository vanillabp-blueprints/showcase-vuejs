<script setup lang="ts">
import RowLegend from './Legend.vue';
import PrimaryFilter from './PrimaryFilter.vue';
import type { PrimaryFilter as Filter } from './primaryFilters';

defineProps<{ selected: Filter; counts: Partial<Record<Filter, number>> }>();
const emit = defineEmits<{ choose: [filter: Filter]; 'ask-count': [filter: Filter] }>();
</script>

<template>
  <div data-testid="status-line" class="status-line">
    <primary-filter :selected="selected" :counts="counts" @choose="emit('choose', $event)" @ask-count="emit('ask-count', $event)" />
    <row-legend />
  </div>
</template>

<style scoped>
.status-line { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 48px; padding: 0 16px; margin: 0 16px; overflow-x: auto; }
</style>
