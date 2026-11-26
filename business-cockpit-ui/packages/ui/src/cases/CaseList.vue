<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { mdiNoteEditOutline } from '@mdi/js';
import { VBtn, VBtnToggle, VIcon, VProgressLinear, VSnackbar, VTable, VTooltip } from 'vuetify/components';
import type { Column } from '@acme/bc-types';
import { OfficialWorkflowlistApi, type Workflow } from '../generated/official-gui-api';
import { dateCellDetails, dateCellText, formatNumber } from '../i18n/format';
import { language, text } from '../i18n/messages';
import { pickTranslation } from '../i18n/translatable';
import { columnsOfCase, type ColumnsOfRow } from '../modules/modules';
import { cellOf, fractionDigits, mergeColumns, type Cell } from '../tasks/moduleColumns';
import { pageSize } from '../tasks/paging';
import { idsPerRequest } from '../tasks/selection';
import { caseAddress } from '../routing';
import { settingKey, settings } from '../settings/settings';
import { stateOf } from '../tasks/taskState';
import LegendOfRows from '../tasks/Legend.vue';
import { caseColumns, caseFilters, defaultCaseFilter, isCaseFilter, showsEndedOfCases, type CaseFilter } from './caseFilters';

const filter = ref<CaseFilter>(defaultCaseFilter);
const rows = shallowRef<Workflow[]>([]);
const total = ref(0);
const counts = reactive<Partial<Record<CaseFilter, number>>>({});
const loadingFirst = ref(false);
const failed = ref(false);
// the moment the user started to look at this list, which every page asks with
const startedAt = ref<string>();
// bumped when the list starts again, so the answers of the old list are thrown away
let generation = 0;
let nextPage = 0;
let loadingMore = false;

// the ended column shows only where an ended case can be; the id column holds no text, the selection stands there
const columns = computed(() => caseColumns.filter((column) => column.key !== 'endedAt' || showsEndedOfCases(filter.value)));

// what the case entry of the module of each loaded case answered (WL-003)
const answers = shallowRef(new Map<string, ColumnsOfRow | undefined>());
const moduleColumns = computed(() => mergeColumns(rows.value.map((one) => answers.value.get(one.id))));
const titleOfColumn = (column: Column): string => pickTranslation(column.title, language.value);
const words = computed(() => ({ yes: text().actions.yes, no: text().actions.no }));
const cellFor = (one: Workflow, column: Column): Cell => cellOf(one, column, language.value, words.value);
const fractionWidths = computed(() => Object.fromEntries(moduleColumns.value.map((column) => [
  column.path, fractionDigits(rows.value.map((one) => cellFor(one, column)).filter((cell) => cell.kind === 'number')),
])));
const columnsFailedOf = (one: Workflow): boolean => { const answer = answers.value.get(one.id); return answer !== undefined && 'failed' in answer; };
const dateAndDetails = (value?: string): { text: string; details: string } | undefined =>
  value ? { text: dateCellText(new Date(value), language.value), details: dateCellDetails(new Date(value), language.value) } : undefined;

async function askPage(pageNumber: number): Promise<{ workflows: Workflow[]; total: number }> {
  const answer = await new OfficialWorkflowlistApi().getWorkflows({
    initialTimestamp: startedAt.value,
    workflowsRequest: { pageSize, pageNumber, mode: filter.value },
  });
  startedAt.value ??= answer.serverTimestamp;
  counts[filter.value] = answer.page.totalElements;
  return { workflows: answer.workflows, total: answer.page.totalElements };
}

async function askColumnsOf(workflows: Workflow[]): Promise<void> {
  const next = new Map(answers.value);
  await Promise.all(workflows.map(async (one) => { next.set(one.id, await columnsOfCase(one)); }));
  answers.value = next;
}

async function askCounts(): Promise<void> {
  try {
    const answer = await new OfficialWorkflowlistApi().countWorkflows(
      { workflowCountsRequest: { filters: caseFilters.map((mode) => ({ key: mode, mode })) } },
    );
    for (const { key, count } of answer.counts) counts[key as CaseFilter] = count;
  } catch {
    // a count which cannot be asked stays as it was
  }
}

async function load(): Promise<void> {
  const started = ++generation;
  startedAt.value = undefined;
  rows.value = [];
  total.value = 0;
  nextPage = 0;
  loadingFirst.value = true;
  try {
    const first = await askPage(0);
    if (started !== generation) return;
    await askColumnsOf(first.workflows);
    if (started !== generation) return;
    rows.value = first.workflows;
    total.value = first.total;
    nextPage = 1;
    failed.value = false;
  } catch {
    // no rows, the status line stays, and the toast says it without a status code
    failed.value = true;
  } finally {
    if (started === generation) loadingFirst.value = false;
  }
}

// the next page loads when the scrolling comes near the end of the rows held
async function loadMore(): Promise<void> {
  if (loadingMore || rows.value.length >= total.value) return;
  loadingMore = true;
  const started = generation;
  try {
    const more = await askPage(nextPage);
    if (started !== generation) return;
    await askColumnsOf(more.workflows);
    if (started !== generation) return;
    rows.value = [...rows.value, ...more.workflows];
    nextPage++;
  } catch {
    // the next scroll asks again
  } finally {
    loadingMore = false;
  }
}
function scrolled(event: Event): void {
  const area = event.target as HTMLElement;
  if (area.scrollTop + area.clientHeight >= area.scrollHeight - 200) void loadMore();
}

// the selection holds the ids of the cases the user ticked; another list is other rows, so nothing stays selected (WL-010)
const selected = ref(new Set<string>());
function toggleSelected(id: string, on: boolean): void {
  const next = new Set(selected.value);
  if (on) next.add(id);
  else next.delete(id);
  selected.value = next;
}

// a note changes with the answer of the server, then the list starts again with the rows as they are now (WL-008)
const actionFailed = ref(false);
async function act(call: () => Promise<unknown>): Promise<void> {
  try {
    await call();
    actionFailed.value = false;
  } catch {
    actionFailed.value = true;
  }
  await load();
}
const noteHoveredOf = ref<string>();
const noteEditedOf = ref<string>();
const noteDraft = ref('');
function editNote(one: Workflow): void {
  noteDraft.value = one.note ?? '';
  noteEditedOf.value = one.id;
}
async function saveNote(one: Workflow): Promise<void> {
  noteEditedOf.value = undefined;
  await act(() => new OfficialWorkflowlistApi().setWorkflowNote({ workflowId: one.id, noteRequest: { text: noteDraft.value } }));
}
const bulkNoteOpen = ref(false);
const bulkNote = ref('');
function openBulkNote(): void {
  bulkNote.value = '';
  bulkNoteOpen.value = !bulkNoteOpen.value;
}
async function saveBulkNote(): Promise<void> {
  const workflowIds = [...selected.value];
  bulkNoteOpen.value = false;
  const text = bulkNote.value;
  await act(async () => {
    for (let from = 0; from < workflowIds.length; from += idsPerRequest) {
      await new OfficialWorkflowlistApi().setWorkflowsNote({ workflowsNoteRequest: { workflowIds: workflowIds.slice(from, from + idsPerRequest), text } });
    }
  });
}

const filterSetting = settingKey('cases', 'primaryFilter');

function choose(chosen: CaseFilter): void {
  if (chosen === filter.value) return;
  filter.value = chosen;
  settings.write(filterSetting, chosen);
  selected.value = new Set();
  bulkNoteOpen.value = false;
  void load();
}

const label = (chosen: CaseFilter): string => {
  const count = counts[chosen];
  return count === undefined ? text().caseFilters[chosen] : `${text().caseFilters[chosen]} (${formatNumber(count, language.value)})`;
};

// the filter the user chose last is the one the list opens with (WL-009)
onMounted(async () => {
  void askCounts();
  const chosenLast = await settings.read(filterSetting);
  filter.value = isCaseFilter(chosenLast) ? chosenLast : defaultCaseFilter;
  await load();
});
</script>

<template>
  <div class="tools" data-testid="toolbar-tools" @keydown.esc="bulkNoteOpen = false">
    <span class="selected-info"><span data-testid="selected-count">{{ selected.size }}</span> {{ text().bulk.selected }}</span>
    <v-btn data-testid="tool-note" size="small" variant="text" :icon="mdiNoteEditOutline" :title="text().actions.note" :aria-label="text().actions.note" :disabled="selected.size === 0" @click="openBulkNote"></v-btn>
    <div v-if="bulkNoteOpen" class="over-list note-popup" data-testid="bulk-note-popup">
      <textarea v-model="bulkNote" data-testid="bulk-note-input" rows="4" maxlength="10000" :aria-label="text().actions.note" />
      <div>
        <v-btn data-testid="bulk-note-save" size="small" @click="saveBulkNote">{{ text().actions.save }}</v-btn>
        <v-btn data-testid="bulk-note-cancel" size="small" variant="text" @click="bulkNoteOpen = false">{{ text().actions.cancel }}</v-btn>
      </div>
    </div>
  </div>
  <v-progress-linear v-if="loadingFirst" data-testid="list-loading" indeterminate class="mx-4" style="width: auto" />
  <v-table data-testid="case-list" class="case-list ma-4" fixed-header height="calc(100vh - 240px)" @scroll.capture="scrolled">
    <thead>
      <tr>
        <th
          v-for="column in columns"
          :key="column.key"
          :data-testid="`column-header-${column.key}`"
          :data-path="column.path"
          :class="{ 'select-cell': column.key === 'id' }"
        >{{ column.key === 'id' ? '' : text().columns[column.key] }}</th>
        <th v-for="column in moduleColumns" :key="column.path" :data-testid="`column-header-module-${column.path}`" :data-path="column.path">{{ titleOfColumn(column) }}</th>
        <th data-testid="column-header-tools" class="tools-header" :aria-label="text().actions.tools" />
      </tr>
    </thead>
    <tbody>
      <tr v-for="one in rows" :key="one.id" data-testid="case-row" :data-case-id="one.id" :data-state="stateOf(one)" :class="['case-row', stateOf(one)]">
        <td data-testid="cell-id" class="select-cell">
          <input type="checkbox" data-testid="select-row" :aria-label="text().bulk.selectRow" :checked="selected.has(one.id)" @change="toggleSelected(one.id, ($event.target as HTMLInputElement).checked)" />
        </td>
        <td data-testid="cell-businessId">{{ one.businessId }}</td>
        <td data-testid="cell-title"><a data-testid="case-title" :href="caseAddress(one.id)">{{ pickTranslation(one.title, language) }}</a></td>
        <td data-testid="cell-note" class="note-cell" @mouseenter="noteHoveredOf = one.id" @mouseleave="noteHoveredOf = undefined">
          <span>{{ one.note }}</span>
          <v-btn
            v-if="noteHoveredOf === one.id && noteEditedOf !== one.id"
            data-testid="note-edit"
            class="note-edit"
            size="x-small"
            variant="text"
            :aria-label="text().actions.editNote"
            @click="editNote(one)"
          ><v-icon :icon="mdiNoteEditOutline" /></v-btn>
          <div v-if="noteEditedOf === one.id" class="over-list note-popup" data-testid="note-popup">
            <textarea v-model="noteDraft" data-testid="note-input" rows="4" maxlength="10000" :aria-label="text().actions.note" />
            <div>
              <v-btn data-testid="note-save" size="small" @click="saveNote(one)">{{ text().actions.save }}</v-btn>
              <v-btn data-testid="note-cancel" size="small" variant="text" @click="noteEditedOf = undefined">{{ text().actions.cancel }}</v-btn>
            </div>
          </div>
        </td>
        <td data-testid="cell-createdAt">
          {{ dateAndDetails(one.createdAt)!.text }}
          <v-tooltip activator="parent" location="bottom"><span data-testid="date-details">{{ dateAndDetails(one.createdAt)!.details }}</span></v-tooltip>
        </td>
        <td v-if="showsEndedOfCases(filter)" data-testid="cell-endedAt">
          <template v-if="dateAndDetails(one.endedAt)">
            {{ dateAndDetails(one.endedAt)!.text }}
            <v-tooltip activator="parent" location="bottom"><span data-testid="date-details">{{ dateAndDetails(one.endedAt)!.details }}</span></v-tooltip>
          </template>
        </td>
        <td v-for="column in moduleColumns" :key="column.path" :data-testid="`cell-module-${column.path}`" class="module-cell" :style="{ textAlign: columnsFailedOf(one) ? 'left' : cellFor(one, column).align }">
          <span v-if="columnsFailedOf(one)" data-testid="columns-not-loaded" class="cannot-open">{{ text().columnsNotLoaded }}</span>
          <template v-else-if="cellFor(one, column).kind === 'number'"
            >{{ cellFor(one, column).integer }}<span class="fraction" :style="{ width: `${fractionWidths[column.path]! + 1}ch` }"><span v-if="cellFor(one, column).fraction" class="mark">{{ cellFor(one, column).fraction!.slice(0, 1) }}</span>{{ cellFor(one, column).fraction!.slice(1) }}</span></template>
          <span v-else-if="cellFor(one, column).kind === 'needs-a-type'" class="cannot-open">{{ text().columnNeedsType }}</span>
          <template v-else>{{ cellFor(one, column).text }}</template>
        </td>
        <td data-testid="cell-tools" class="tools-cell" />
      </tr>
    </tbody>
  </v-table>
  <p v-if="total === 0 && !failed && !loadingFirst" class="ma-4" data-testid="no-cases">{{ text().noCases }}</p>
  <div data-testid="status-line" class="status-line">
    <v-btn-toggle :model-value="filter" mandatory density="comfortable" variant="outlined" divided :aria-label="text().primaryFilter">
      <v-btn v-for="chosen in caseFilters" :key="chosen" :data-testid="`primary-filter-${chosen}`" :value="chosen" :aria-pressed="chosen === filter" @click="choose(chosen)">{{ label(chosen) }}</v-btn>
    </v-btn-toggle>
    <legend-of-rows />
  </div>
  <v-snackbar :model-value="failed" data-testid="list-toast" timeout="-1" color="error">{{ text().listNotLoaded }}</v-snackbar>
</template>

<style scoped>
.cannot-open { display: block; font-size: 0.8rem; opacity: 0.7; }
.case-list :deep(.v-table__wrapper) { overflow: scroll; overflow-anchor: none; }
.case-list :deep(table) { min-width: 900px; }
.case-list { background-color: var(--list-background); color: var(--list-text); backdrop-filter: blur(8px); }
.case-row > td { height: 46px; box-sizing: border-box; white-space: nowrap; }
.case-list .fraction { display: inline-block; text-align: left; }
.case-list .module-cell { font-variant-numeric: tabular-nums; }
.select-cell { width: 48px; text-align: center; }
.note-cell { position: relative; }
.over-list { position: absolute; z-index: 5; top: 100%; left: 0; min-width: 240px; padding: 8px; text-align: left; background: var(--popup-background); color: var(--list-text); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); white-space: normal; }
.tools { position: relative; display: flex; align-items: center; gap: 2px; margin: 8px 16px 0; height: 40px; }
.selected-info { margin-right: 8px; white-space: nowrap; }
.note-popup textarea { width: 100%; border: 1px solid var(--field-border); padding: 4px; }
.case-list a { color: inherit; }
.tools-header, .tools-cell { width: 96px; }
/* the look of a state as in the rows of the task list (TL-023) */
.case-row.completed, .case-row.cancelled { background-color: var(--row-ended); }
.case-row.cancelled td { text-decoration: line-through; }
.case-row.suspended td { color: var(--muted-text); }
.status-line { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 48px; padding: 0 16px; margin: 0 16px; overflow-x: auto; }
</style>
