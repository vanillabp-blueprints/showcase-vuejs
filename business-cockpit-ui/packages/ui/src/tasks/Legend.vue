<script setup lang="ts">
import { text } from '../i18n/messages';

// the looks of the rows the legend explains: three kinds of change, then the states of a task
const entries = ['new', 'changed', 'removed', 'completed', 'cancelled', 'suspended'] as const;
</script>

<template>
  <ul data-testid="legend" class="legend">
    <li v-for="entry in entries" :key="entry" :data-legend="entry" :class="`legend-${entry}`">
      <span class="swatch" />{{ text().legend[entry] }}
    </li>
  </ul>
</template>

<style scoped>
.legend { display: flex; gap: 16px; list-style: none; margin: 0; padding: 0; font-size: 0.875rem; }
.legend li { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.swatch { display: inline-block; width: 16px; height: 16px; border: 1px solid rgba(0, 0, 0, 0.3); border-radius: 3px; }
.legend-new .swatch { background-color: #c8e6c9; }
.legend-changed .swatch { background-color: #fff59d; }
.legend-removed .swatch { background-color: #ffcdd2; }
.legend-completed .swatch, .legend-cancelled .swatch { background-color: #e0e0e0; }
.legend-cancelled { text-decoration: line-through; }
.legend-suspended { opacity: 0.6; }
</style>
