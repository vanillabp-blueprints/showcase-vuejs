<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { HEADER } from '@acme/bc-module-kit';
import type { ModuleRef } from '@acme/bc-module-host';
import { host, modulesToAsk } from './modules';
import ModulePart from './ModulePart.vue';

// the parts which the modules put into the header; the modules are not known before the page runs
const modules = ref<ModuleRef[]>([]);
// The header looks for a new build of its modules when the user comes back to the page: a changed manifest makes its parts ask again.
// No timer does it, the cockpit makes no request in the background.
const lookForNewBuilds = () => Promise.all(modules.value.map(({ workflowModuleId, webPath }) => host.names(workflowModuleId, webPath, HEADER).catch(() => undefined)));
const cameBack = () => { if (document.visibilityState === 'visible') void lookForNewBuilds(); };
onMounted(async () => {
  modules.value = await modulesToAsk();
  window.addEventListener('focus', cameBack);
  document.addEventListener('visibilitychange', cameBack);
});
onUnmounted(() => { window.removeEventListener('focus', cameBack); document.removeEventListener('visibilitychange', cameBack); });
</script>

<template>
  <span data-testid="module-header" class="module-header">
    <ModulePart v-for="module in modules" :key="module.workflowModuleId" :module="module" :entry="HEADER" asks-again-on-new-build />
  </span>
</template>

<style scoped>
.module-header { display: inline-flex; gap: 8px; margin-right: 8px; }
</style>
