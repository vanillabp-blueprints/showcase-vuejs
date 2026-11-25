<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { VApp, VAppBar, VAvatar, VBtn, VBtnToggle, VDivider, VList, VListItem, VMain, VNavigationDrawer, VSpacer, VTooltip } from 'vuetify/components';
import { mdiMenu } from '@mdi/js';
import type { User } from './generated/official-gui-api';
import { counts } from './counts/counts';
import { initialsOf } from './initials';
import { formatNumber } from './i18n/format';
import { language, languages, text } from './i18n/messages';
import { caseIdOf, pageOf, taskIdOf } from './routing';
import { cappedNotice, isCapped } from './tasks/cappedNotice';
import TaskList from './tasks/TaskList.vue';
import CaseList from './cases/CaseList.vue';
import CaseHeader from './cases/CaseHeader.vue';
import CasePage from './cases/CasePage.vue';
import ModuleHeader from './modules/ModuleHeader.vue';
import BackToList from './tasks/BackToList.vue';
import TaskHeader from './tasks/TaskHeader.vue';
import TaskPage from './tasks/TaskPage.vue';
import { openTask } from './tasks/openTask';
import { stateOf } from './tasks/taskState';

const props = defineProps<{ title: string; user: User }>();

const menuOpen = ref(false);
// A link to a task or a case opens it in this page, so what the loader kept is used again (TF-039); the back button and the actions of the modules use the same way.
const path = ref(window.location.pathname);
const page = computed(() => pageOf(path.value));
const taskId = computed(() => taskIdOf(path.value));
const caseId = computed(() => caseIdOf(path.value));
window.addEventListener('popstate', () => { path.value = window.location.pathname; });
window.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  const plain = event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
  if (!link || !plain || event.defaultPrevented || (link.target && link.target !== '_self') || link.origin !== window.location.origin) return;
  if (taskIdOf(link.pathname) === undefined && caseIdOf(link.pathname) === undefined) return;
  event.preventDefault();
  window.history.pushState({}, '', link.pathname + link.search);
  path.value = link.pathname;
});
// The header of an open task looks as the row of the task does (TF-042); it shows no title, so nothing is struck through.
const headerLook = computed(() => (page.value === 'task' && openTask.value ? `task-${stateOf(openTask.value)}` : ''));
// the page says which language it is in
watchEffect(() => { document.documentElement.lang = language.value; });
const shortForm = computed(() => props.user.displayShort ?? props.user.display ?? props.user.id);
const initials = computed(() => initialsOf(props.user.display, props.user.id));
const shown = (label: string, count?: number): string => (count === undefined ? label : `${label} (${formatNumber(count, language.value)})`);
</script>

<template>
  <v-app>
    <v-app-bar data-testid="header" density="comfortable" :class="headerLook">
      <a data-testid="title" href="/" class="title">{{ title }}</a>
      <v-btn-toggle data-testid="toggle" class="toggle" density="comfortable" variant="outlined" divided>
        <v-btn data-testid="toggle-my-tasks" :href="text().routes.myTasks">{{ shown(text().myTasks, counts.myTasks) }}
          <v-tooltip v-if="isCapped(counts.myTasks)" activator="parent" location="bottom">{{ cappedNotice() }}</v-tooltip>
        </v-btn>
        <v-btn data-testid="toggle-all-tasks" :href="text().routes.allTasks">{{ shown(text().allTasks, counts.allTasks) }}
          <v-tooltip v-if="isCapped(counts.allTasks)" activator="parent" location="bottom">{{ cappedNotice() }}</v-tooltip>
        </v-btn>
        <v-btn data-testid="toggle-cases" :href="text().routes.cases">{{ shown(text().cases, counts.cases) }}
          <v-tooltip v-if="isCapped(counts.cases)" activator="parent" location="bottom">{{ cappedNotice() }}</v-tooltip>
        </v-btn>
      </v-btn-toggle>
      <v-spacer />
      <module-header />
      <!-- right of the parts of the modules, so late parts do not move the actions -->
      <task-header v-if="page === 'task'" :current-user-id="user.id" />
      <case-header v-else-if="page === 'case'" />
      <span data-testid="current-user" class="mr-2">{{ user.display ?? user.id }}</span>
      <!-- a task tab has no menu, its way out is the way back to the list (TF-007) -->
      <back-to-list v-if="page === 'task'" :current-user-id="user.id" />
      <v-btn v-else data-testid="menu-button" :icon="mdiMenu" :aria-label="text().menu" @click="menuOpen = !menuOpen" />
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
      <case-list v-else-if="page === 'cases'" />
      <task-page v-else-if="page === 'task' && taskId" :id="taskId" :key="taskId" :current-user-id="user.id" />
      <case-page v-else-if="page === 'case' && caseId" :id="caseId" :key="caseId" />
    </v-main>
  </v-app>
</template>

<style scoped>
.title { color: inherit; text-decoration: none; font-size: 1.25rem; margin: 0 16px; }
.toggle { margin-left: 8px; }
/* the look of a state as in the rows of the list (TL-023): grey when ended, lighter text when suspended */
.v-toolbar.task-completed, .v-toolbar.task-cancelled { background-color: #e0e0e0; }
.v-toolbar.task-suspended { color: rgba(33, 33, 33, 0.55); }
</style>
