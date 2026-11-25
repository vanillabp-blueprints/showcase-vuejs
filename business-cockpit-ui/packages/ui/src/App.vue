<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { VApp, VAppBar, VAvatar, VBtn, VBtnToggle, VDivider, VList, VListItem, VMain, VNavigationDrawer, VSpacer, VTooltip } from 'vuetify/components';
import { mdiMenu } from '@mdi/js';
import type { User } from './generated/official-gui-api';
import { counts } from './counts/counts';
import { initialsOf } from './initials';
import { formatNumber } from './i18n/format';
import { language, languages, text } from './i18n/messages';
import { pageOf } from './routing';
import TaskList from './tasks/TaskList.vue';

const props = defineProps<{ title: string; user: User }>();

const menuOpen = ref(false);
const page = pageOf(window.location.pathname);
// the page says which language it is in
watchEffect(() => { document.documentElement.lang = language.value; });
const shortForm = computed(() => props.user.displayShort ?? props.user.display ?? props.user.id);
const initials = computed(() => initialsOf(props.user.display, props.user.id));
const shown = (label: string, count?: number): string => (count === undefined ? label : `${label} (${formatNumber(count, language.value)})`);
</script>

<template>
  <v-app>
    <v-app-bar data-testid="header" density="comfortable">
      <a data-testid="title" href="/" class="title">{{ title }}</a>
      <v-btn-toggle data-testid="toggle" class="toggle" density="comfortable" variant="outlined" divided>
        <v-btn data-testid="toggle-my-tasks" :href="text().routes.myTasks">{{ shown(text().myTasks, counts.myTasks) }}</v-btn>
        <v-btn data-testid="toggle-all-tasks" :href="text().routes.allTasks">{{ shown(text().allTasks, counts.allTasks) }}</v-btn>
        <v-btn data-testid="toggle-cases" :href="text().routes.cases">{{ shown(text().cases, counts.cases) }}</v-btn>
      </v-btn-toggle>
      <v-spacer />
      <span data-testid="current-user" class="mr-2">{{ user.display ?? user.id }}</span>
      <v-btn data-testid="menu-button" :icon="mdiMenu" :aria-label="text().menu" @click="menuOpen = !menuOpen" />
    </v-app-bar>

    <v-navigation-drawer v-model="menuOpen" data-testid="menu" location="right" temporary>
      <v-list>
        <v-list-item data-menu-part="user">
          <template #prepend>
            <v-avatar data-testid="user-badge" color="primary" size="40" class="mr-3">
              {{ initials }}
              <v-tooltip activator="parent" location="left">
                <div data-testid="user-details">
                  <div>{{ user.display ?? user.id }}</div>
                  <div>{{ user.id }}</div>
                  <div v-if="user.email">{{ user.email }}</div>
                </div>
              </v-tooltip>
            </v-avatar>
          </template>
          <span data-testid="user-short">{{ shortForm }}</span>
          <!-- the groups come from current-user, never from the token -->
          <span data-testid="groups" hidden>{{ (user.groups ?? []).map((group) => group.id).join(', ') }}</span>
        </v-list-item>
        <v-divider />
        <v-list-item data-menu-part="tasks" data-testid="menu-tasks" :href="text().routes.allTasks" :title="text().allTasks" />
        <v-list-item data-menu-part="my-tasks" data-testid="menu-my-tasks" :href="text().routes.myTasks" :title="text().myTasks" />
        <v-list-item data-menu-part="cases" data-testid="menu-cases" :href="text().routes.cases" :title="text().cases" />
        <v-list-item data-menu-part="notifications" data-testid="menu-notifications" :href="text().routes.notifications" :title="text().notifications" />
        <v-divider />
        <v-list-item data-menu-part="language" :title="text().language">
          <v-btn-toggle v-model="language" mandatory density="compact" variant="outlined" divided>
            <v-btn v-for="code in languages" :key="code" :data-testid="`language-${code}`" :value="code">{{ code.toUpperCase() }}</v-btn>
          </v-btn-toggle>
        </v-list-item>
        <v-divider />
        <v-list-item data-menu-part="logout" data-testid="logout" href="/logout" :title="text().logout" />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <task-list v-if="page === 'allTasks'" :own="false" :current-user-id="user.id" />
      <task-list v-else-if="page === 'myTasks'" :own="true" :current-user-id="user.id" />
    </v-main>
  </v-app>
</template>

<style scoped>
.title { color: inherit; text-decoration: none; font-size: 1.25rem; margin: 0 16px; }
.toggle { margin-left: 8px; }
</style>
