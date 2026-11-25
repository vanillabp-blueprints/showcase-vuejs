<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { drawHeaders } from './modules';

// the parts which the modules put into the header; the modules are not known before the page runs
const container = ref<HTMLElement>();
onMounted(() => { void drawHeaders(container.value!); });
</script>

<template>
  <span ref="container" data-testid="module-header" class="module-header" />
</template>

<style scoped>
.module-header { display: inline-flex; gap: 8px; margin-right: 8px; }
</style>
