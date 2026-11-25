<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { HEADER } from '@acme/bc-module-kit';
import type { ModuleRef } from '@acme/bc-module-host';
import { modulesToAsk } from './modules';
import ModulePart from './ModulePart.vue';

// the parts which the modules put into the header; the modules are not known before the page runs
const modules = ref<ModuleRef[]>([]);
onMounted(async () => { modules.value = await modulesToAsk(); });
</script>

<template>
  <span data-testid="module-header" class="module-header">
    <ModulePart v-for="module in modules" :key="module.workflowModuleId" :module="module" :entry="HEADER" />
  </span>
</template>

<style scoped>
.module-header { display: inline-flex; gap: 8px; margin-right: 8px; }
</style>
