<script setup lang="ts">
import { onMounted } from 'vue';
import { VBtn, VCheckbox, VTextField } from 'vuetify/components';
import { language, text } from '../i18n/messages';
import { pickTranslation } from '../i18n/translatable';
import {
  chooseAll, chooseInRow, chooseNone, fieldKey, follow, hasOwnRow, isAll, isChosen, isNone, keyOf, load, saveChannel, state, valueOfField,
} from './notifications';

onMounted(() => { void load(); });
</script>

<template>
  <section data-testid="notification-settings" class="settings">
    <h1>{{ text().notifications }}</h1>
    <p v-if="state.failed" data-testid="notification-failed">{{ text().notificationSettings.notLoaded }}</p>
    <p v-else-if="!state.loaded" data-testid="notification-loading">{{ text().notificationSettings.loading }}</p>
    <template v-else>
      <table data-testid="notification-table">
        <thead>
          <tr>
            <th>{{ text().notificationSettings.kindOfCase }}</th>
            <th v-for="medium in state.media" :key="medium.type" :data-testid="`notification-medium-${medium.type}`">{{ pickTranslation(medium.name ?? {}, language) || medium.type }}</th>
            <th>{{ text().notificationSettings.none }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr data-testid="notification-row-all">
            <th scope="row">{{ text().notificationSettings.allCases }}</th>
            <td v-for="medium in state.media" :key="medium.type">
              <v-checkbox :data-testid="`notification-all-${medium.type}`" :model-value="isAll(medium.type)" :aria-label="text().notificationSettings.allCases" hide-details density="compact" @update:model-value="chooseAll(medium.type, $event === true)" />
            </td>
            <td></td>
            <td></td>
          </tr>
          <tr v-for="workflow in state.workflows" :key="keyOf(workflow)" :data-testid="`notification-row-${keyOf(workflow)}`" :class="{ own: hasOwnRow(keyOf(workflow)) }">
            <th scope="row">{{ pickTranslation(workflow.workflowTitle ?? {}, language) || keyOf(workflow) }}</th>
            <td v-for="medium in state.media" :key="medium.type">
              <v-checkbox :data-testid="`notification-cell-${keyOf(workflow)}-${medium.type}`" :model-value="isChosen(keyOf(workflow), medium.type)" :disabled="isNone(keyOf(workflow))" hide-details density="compact" @update:model-value="chooseInRow(keyOf(workflow), medium.type, $event === true)" />
            </td>
            <td>
              <v-checkbox :data-testid="`notification-none-${keyOf(workflow)}`" :model-value="isNone(keyOf(workflow))" hide-details density="compact" @update:model-value="chooseNone(keyOf(workflow), $event === true)" />
            </td>
            <td>
              <v-btn v-if="hasOwnRow(keyOf(workflow))" :data-testid="`notification-follow-${keyOf(workflow)}`" variant="text" size="small" @click="follow(keyOf(workflow))">{{ text().notificationSettings.follow }}</v-btn>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>{{ text().notificationSettings.where }}</h2>
      <div v-for="channel in state.recipients" :key="channel.medium" class="channel">
        <h3>{{ pickTranslation(channel.name ?? {}, language) || channel.medium }}</h3>
        <div v-for="field in channel.values ?? []" :key="field.type" :data-testid="`recipient-${channel.medium}-${field.type}`" class="field">
          <VTextField @keydown.enter="saveChannel(channel)" :label="pickTranslation(field.title ?? {}, language)" :hint="pickTranslation(field.description ?? {}, language)" persistent-hint :model-value="valueOfField(channel.medium, field.type, field.value)" density="compact" @update:model-value="state.typed[fieldKey(channel.medium, field.type)] = $event" />
          <div v-if="state.refused[fieldKey(channel.medium, field.type)]" :data-testid="`recipient-error-${channel.medium}-${field.type}`" class="refused" role="alert">{{ state.refused[fieldKey(channel.medium, field.type)] }}</div>
        </div>
        <v-btn :data-testid="`recipient-save-${channel.medium}`" color="primary" @click="saveChannel(channel)">{{ text().notificationSettings.save }}</v-btn>
      </div>
    </template>
  </section>
</template>

<style scoped>
.settings { padding: 16px 24px; max-width: 960px; }
h1 { font-size: 1.5rem; margin-bottom: 16px; }
h2 { font-size: 1.25rem; margin: 24px 0 8px; }
h3 { font-size: 1rem; margin: 8px 0; }
table { border-collapse: collapse; }
th, td { text-align: left; padding: 0 16px 0 0; }
.field { max-width: 480px; }
.refused { color: #b00020; font-size: 0.875rem; margin: -4px 0 8px; }
.channel { margin-bottom: 16px; }
</style>
