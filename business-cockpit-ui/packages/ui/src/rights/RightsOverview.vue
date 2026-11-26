<script setup lang="ts">
import { ref } from 'vue';
import type { User } from '../generated/official-gui-api';
import { text } from '../i18n/messages';
import UserBadge from '../UserBadge.vue';
import { loadRights, type RightsTable } from './rights';

defineProps<{ user: User }>();

// asked on the first mouse-over only; the answer is kept by loadRights until the page is loaded again
const open = ref(false);
const tables = ref<RightsTable[] | undefined>();
const opened = (): void => {
  open.value = true;
  if (!tables.value) void loadRights().then((loaded) => { tables.value = loaded; });
};
</script>

<template>
  <!-- the name and the overview are one element for the mouse, so it closes when the mouse leaves both -->
  <span class="rights" @mouseenter="opened" @mouseleave="open = false">
    <slot />
    <div v-if="open" data-testid="rights-overview" class="overview">
      <div class="head">
        <user-badge :user="user" testid="rights-badge" />
        <strong data-testid="rights-title">{{ text().rights.title }}</strong>
      </div>
      <p v-if="!tables" data-testid="rights-loading">{{ text().rights.loading }}</p>
      <template v-else>
        <p data-testid="rights-sentence">{{ text().rights.sentence }}</p>
        <p v-if="tables.length === 0" data-testid="rights-none">{{ text().rights.none }}</p>
        <section v-for="table in tables" :key="table.workflowModuleId" :data-testid="`rights-module-${table.workflowModuleId}`">
          <h3>{{ table.workflowModuleId }}</h3>
          <table :data-testid="`rights-table-${table.workflowModuleId}`">
            <thead><tr><th>{{ text().rights.name }}</th><th>{{ text().rights.kind }}</th><th>{{ text().rights.givenBy }}</th></tr></thead>
            <tbody>
              <tr v-for="row in table.rows" :key="`${row.name}/${row.givenBy}`">
                <td>{{ row.name }}</td>
                <td>{{ text().rights.kinds[row.kind] }}</td>
                <td>{{ row.fromOrganisation ? text().rights.organisation : row.givenBy }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
    </div>
  </span>
</template>

<style scoped>
.rights { position: relative; display: inline-block; }
/* directly below the name with no gap, so the mouse can move in; right edges aligned */
.overview { position: absolute; top: 100%; right: 0; z-index: 2000; width: max-content; max-width: min(90vw, 560px); max-height: 66vh; overflow: auto;
  padding: 12px 16px; background: #fff; color: #212121; border-radius: 4px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3); font-size: 0.875rem; font-weight: normal; }
.head { display: flex; align-items: center; margin-bottom: 8px; }
h3 { margin: 12px 0 4px; font-size: 1rem; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 2px 12px 2px 0; user-select: text; }
</style>
