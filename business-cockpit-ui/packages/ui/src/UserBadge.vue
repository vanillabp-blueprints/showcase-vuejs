<script setup lang="ts">
import { computed } from 'vue';
import { VAvatar, VTooltip } from 'vuetify/components';
import type { User } from './generated/official-gui-api';
import { initialsOf } from './initials';

const props = defineProps<{ user: User; testid: string }>();
const initials = computed(() => initialsOf(props.user.display, props.user.id));
</script>

<template>
  <!-- the badge of the user: at the top of the menu and in the head of the overview of roles and rights (NAV-027) -->
  <v-avatar :data-testid="testid" color="primary" size="40" class="mr-3">
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
