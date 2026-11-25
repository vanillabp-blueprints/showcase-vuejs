<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { VBtn, VCard, VCardActions, VCardText, VDialog, VIcon, VProgressLinear, VSnackbar, VTable, VTooltip } from 'vuetify/components';
import { mdiAccount, mdiAccountMultiple, mdiAccountArrowRight, mdiAccountCheckOutline, mdiArrowDown, mdiArrowUp, mdiCalendarClock, mdiClose, mdiDelete, mdiEmailOpenOutline, mdiEmailOutline, mdiNoteEditOutline } from '@mdi/js';
import type { Column } from '@acme/bc-types';
import { OfficialTasklistApi, type Person, type UserTask } from '../generated/official-gui-api';
import { FailedCall, updateStreamUrl } from '../api/clients';
import { guiApiBasePath, myTasksBasePath } from '../config';
import { dateCellDetails, dateCellText } from '../i18n/format';
import { language, text } from '../i18n/messages';
import { pickTranslation } from '../i18n/translatable';
import { taskAddress } from '../routing';
import { addressOfTask, columnsOfRow, isExternal, loadPartsOf, type ColumnsOfRow } from '../modules/modules';
import { cellOf, fractionDigits, mergeColumns, type Cell } from './moduleColumns';
import { settingKey, settings } from '../settings/settings';
import { stateOf } from './taskState';
import { dayOf, startOfDay } from './followUp';
import { cappedNotice } from './cappedNotice';
import { onTaskChangedInAnotherTab } from './openTask';
import StatusLine from './StatusLine.vue';
import SearchBar from './SearchBar.vue';
import { fullText, searchQueriesOf, type Suggestion } from './search';
import { isSortable, nextSort, sortPathOf, sortsByLanguage, type Sort } from './sorting';
import { drawnAround, listLength, pageOf, pageSize, pagesOfRows, rowHeight, scrollPauseMs, visibleRows, windowPages } from './paging';
import { asksBeforeLeavingOut, chunksOf, hasTasksToLeaveOut, heldByOthers, targetsOf, type BulkAction } from './selection';
import { maxListEntries } from './maxListEntries';
import { countedOnMouseOver, defaultPrimaryFilter, isPrimaryFilter, showsEnded, showsFollowUp, type PrimaryFilter } from './primaryFilters';

const props = defineProps<{ own: boolean; currentUserId: string }>();

// the fixed columns of Q-TASK-COLUMNS, in the order of the interview
const allColumns = ['id', 'businessId', 'caseKind', 'title', 'dueDate', 'assignee', 'candidateUsers', 'note', 'followUpDate', 'endedAt'] as const;

// the follow-up column shows only for the primary filters that list tasks put aside (TL-009), the ended column only for closed tasks (TL-010)
const columns = computed(() =>
  allColumns.filter((column) => (column !== 'followUpDate' || showsFollowUp(filter.value)) && (column !== 'endedAt' || showsEnded(filter.value))),
);

// the path of the field of each column in the GUI API, which the list sorts and filters by (COL-021)
const paths: Record<(typeof allColumns)[number], string> = {
  id: 'id', businessId: 'businessId', caseKind: 'workflowTitle', title: 'title', dueDate: 'dueDate', assignee: 'assignee',
  candidateUsers: 'candidateUsers', note: 'note', followUpDate: 'followUpDate', endedAt: 'endedAt',
};

// the window of pages the list holds, by page number; the rows of other pages are not kept (SRCH-010)
const pages = shallowRef(new Map<number, UserTask[]>());
const total = ref(0);
const pending = ref(0);
// bumped when the list starts again, so the answers of the old list are thrown away
let generation = 0;
const tableRef = ref<{ $el: HTMLElement }>();
const scrollTop = ref(0);
const areaHeight = ref(0);
const headHeight = ref(0);
let scrollArea: HTMLElement | undefined;
let pause: ReturnType<typeof setTimeout> | undefined;
const length = computed(() => listLength(total.value));
const visible = computed(() => visibleRows(scrollTop.value, areaHeight.value, headHeight.value, length.value));
const windowNumbers = (): number[] => windowPages(visible.value.first, visible.value.last, length.value);
const loadedTasks = (): UserTask[] => [...pages.value.entries()].sort(([a], [b]) => a - b).flatMap(([, rows]) => rows);
const windowRows = computed(() => [...pages.value.values()].reduce((sum, rows) => sum + rows.length, 0));
// the rows drawn: the visible ones and a few around them, the others are the height of two spacers
const drawnFirst = computed(() => Math.max(0, visible.value.first - drawnAround));
const drawnLast = computed(() => Math.min(length.value - 1, visible.value.last + drawnAround));
const drawn = computed(() =>
  Array.from({ length: Math.max(0, drawnLast.value - drawnFirst.value + 1) }, (_, offset) => {
    const index = drawnFirst.value + offset;
    const task = pages.value.get(pageOf(index))?.[index % pageSize];
    return { key: task?.id ?? `placeholder-${index}`, task };
  }),
);
const spaceAbove = computed(() => drawnFirst.value * rowHeight);
// a list with more entries than the limit ends with the notice row, which has the height of a row
const capped = computed(() => total.value > maxListEntries);
const noticeShown = computed(() => capped.value && drawnLast.value === length.value - 1);
const spaceBelow = computed(() => (Math.max(0, length.value - 1 - drawnLast.value) + (capped.value && !noticeShown.value ? 1 : 0)) * rowHeight);
// what the list part of the module of each loaded row answered (COL-001); an answer is there before its row is, so the header never changes under the first rows
const answers = new Map<string, ColumnsOfRow | undefined>();
const answeredOf = (task: UserTask): ColumnsOfRow | undefined => answers.get(task.id);
async function askColumnsOf(rows: UserTask[]): Promise<void> {
  await Promise.all(rows.map(async (row) => { answers.set(row.id, await columnsOfRow(row)); }));
}
// the module columns follow the loaded window: the first row (in list order) which has a column gives its title and fields (COL-003)
const moduleColumns = computed(() => mergeColumns(loadedTasks().map(answeredOf)));
const titleOfColumn = (column: Column): string => pickTranslation(column.title, language.value);
const words = computed(() => ({ yes: text().actions.yes, no: text().actions.no }));
const cellFor = (task: UserTask, column: Column): Cell => cellOf(task, column, language.value, words.value);
// the digits after the decimal mark of the widest number of each column, so the marks of its rows line up (COL-006)
const fractionWidths = computed(() => Object.fromEntries(moduleColumns.value.map((column) => [
  column.path, fractionDigits(loadedTasks().map((task) => cellFor(task, column)).filter((cell) => cell.kind === 'number')),
])));
const columnsFailedOf = (task: UserTask): boolean => { const answer = answeredOf(task); return answer !== undefined && 'failed' in answer; };
// the width of a column the user dragged, by column key (COL-022); the list keeps it as a setting per list and path
const widths = reactive<Record<string, number>>({});
const widthsRead = new Set<string>();
const listName = (): string => (props.own ? 'own' : 'all');
const widthSetting = (key: string): string => settingKey('tasks', listName(), 'width', key);
const minimumWidth = 40;
// every fixed column but the checkbox of `id` and the candidates can be resized; a module column only when it says so
const fixedResizeable = (column: (typeof allColumns)[number]): boolean => column !== 'id' && column !== 'candidateUsers';
const widthStyle = (key: string): Record<string, string> | undefined =>
  widths[key] === undefined ? undefined : { width: `${widths[key]}px`, minWidth: `${widths[key]}px`, maxWidth: `${widths[key]}px` };
function readWidthsOf(keys: string[]): void {
  for (const key of keys) {
    if (widthsRead.has(key)) continue;
    widthsRead.add(key);
    void settings.read<number>(widthSetting(key)).then((width) => {
      if (typeof width === 'number' && widths[key] === undefined) widths[key] = width;
    });
  }
}
function startResize(key: string, event: PointerEvent): void {
  const handle = event.currentTarget as HTMLElement;
  const header = handle.parentElement!;
  const startX = event.clientX;
  const startWidth = header.getBoundingClientRect().width;
  handle.setPointerCapture(event.pointerId);
  const move = (moved: PointerEvent): void => { widths[key] = Math.max(minimumWidth, Math.round(startWidth + moved.clientX - startX)); };
  const end = (): void => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    if (widths[key] !== undefined) settings.writeWhenQuiet(widthSetting(key), widths[key]);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  event.preventDefault();
}
// another list has other widths
watch(() => props.own, () => { for (const key of Object.keys(widths)) delete widths[key]; widthsRead.clear(); });
// ids of rows which left the window do not stay in the answers
watch(pages, () => {
  const loaded = new Set(loadedTasks().map((task) => task.id));
  for (const id of answers.keys()) if (!loaded.has(id)) answers.delete(id);
});

// only the first load shows the loading sign; the pages that follow load without one
// what the central loader made of each row which was drawn (a row without a type is of a module which reports none)
/** An external task opens its address in a tab of its own (TF-019); any other task opens its page. */
const linkOf = (task: UserTask): string => (isExternal(task) ? addressOfTask(task) : taskAddress(task.id));
const partsOf = reactive<Record<string, 'loading' | 'loaded' | 'unopenable'>>({});
function loadPartsOfRows(rows: { task?: UserTask }[]): void {
  for (const { task } of rows) {
    if (!task?.uiUriType || partsOf[task.id]) continue;
    partsOf[task.id] = 'loading';
    loadPartsOf(task).then((opened) => { partsOf[task.id] = opened ? 'loaded' : 'unopenable'; }, () => { partsOf[task.id] = 'unopenable'; });
  }
}
watch(drawn, loadPartsOfRows, { immediate: true });
const loadingFirst = ref(false);
// the moment the user started to look at this list; a new sort, a new search and opening the list start it again (SRCH-027)
const startedAt = ref<string>();
const sort = ref<Sort>();
const failed = ref(false);
// the text of a sort the server refused with 400, shown as it is (SRCH-034)
const refusedSort = ref<string>();
const filter = ref<PrimaryFilter>(defaultPrimaryFilter);
watch(
  [columns, moduleColumns, () => props.own],
  () => readWidthsOf([...columns.value.filter(fixedResizeable), ...moduleColumns.value.filter((column) => column.resizeable).map((column) => `module-${column.path}`)]),
  { immediate: true },
);
const counts = reactive<Partial<Record<PrimaryFilter, number>>>({});

// the searches by path, one entry per path (SRCH-005); the full-text search has the empty path (SRCH-001)
const searches = reactive<Record<string, string>>({});
const columnDrafts = reactive<Record<string, string>>({});
// the columns the user can set a filter on (COL-021)
const filterable: (typeof allColumns)[number][] = ['id', 'businessId', 'caseKind', 'title', 'note'];

function search(path: string, query: string): void {
  if (query === '') delete searches[path];
  else searches[path] = query;
  void load(true);
}
// a click on a sortable header sorts by it, a second turns the direction, a third goes back to the default (SRCH-007)
function sortBy(column: (typeof allColumns)[number]): void {
  if (!isSortable(column)) return;
  sort.value = nextSort(sort.value, column);
  void load(true);
}
const sortMarkOf = (column: (typeof allColumns)[number]): 'asc' | 'desc' | undefined =>
  sort.value?.column === column ? (sort.value.ascending ? 'asc' : 'desc') : undefined;
// an i18n column sorts by the language the list shows, so a new language sorts again
watch(language, () => {
  if (sort.value && sortsByLanguage(sort.value.column)) void load(true);
});
const setColumnFilter = (column: (typeof allColumns)[number]) => search(paths[column], (columnDrafts[column] ?? '').trim());
function clearColumnFilter(column: (typeof allColumns)[number]): void {
  columnDrafts[column] = '';
  setColumnFilter(column);
}
function resetSearches(): void {
  for (const path of Object.keys(searches)) delete searches[path];
  for (const column of Object.keys(columnDrafts)) delete columnDrafts[column];
  void load(true);
}
async function suggest(query: string): Promise<Suggestion[]> {
  const others = searchQueriesOf({ ...searches, [fullText]: '' });
  try {
    return (await new OfficialTasklistApi().getUserTaskKwicResults({ query, kwicRequest: { searchQueries: others } }, { baseUrl: baseUrl() })).result;
  } catch {
    return [];
  }
}

// the selection is a set of ids; it keeps the task as the user saw it, so rows outside the window can still be acted on (TL-011)
const selected = shallowRef(new Map<string, UserTask>());
const selectedTasks = computed(() => [...selected.value.values()]);
function toggleSelected(task: UserTask, on: boolean): void {
  const next = new Map(selected.value);
  if (on) next.set(task.id, task);
  else next.delete(task.id);
  selected.value = next;
}
function refreshSelected(rows: UserTask[]): void {
  if (selected.value.size === 0) return;
  const changed = rows.filter((row) => selected.value.has(row.id));
  if (changed.length === 0) return;
  const next = new Map(selected.value);
  for (const row of changed) next.set(row.id, row);
  selected.value = next;
}

const baseUrl = (): string => (props.own ? myTasksBasePath : guiApiBasePath);
// each list keeps the primary filter its user chose last (TL-005)
const filterSetting = (): string => settingKey('tasks', props.own ? 'own' : 'all', 'primaryFilter');

async function askCounts(filters: PrimaryFilter[]): Promise<void> {
  try {
    const answer = await new OfficialTasklistApi().countUserTasks(
      { userTaskCountsRequest: { filters: filters.map((mode) => ({ key: mode, mode })) } },
      { baseUrl: baseUrl() },
    );
    for (const { key, count } of answer.counts) counts[key as PrimaryFilter] = count;
  } catch {
    // a count which cannot be asked stays as it was
  }
}

const sortParameters = () => (sort.value ? { sort: sortPathOf(sort.value.column, language.value), sortAscending: sort.value.ascending } : {});

async function askPage(pageNumber: number): Promise<{ rows: UserTask[]; total: number }> {
  const answer = await new OfficialTasklistApi().getUserTasks(
    { initialTimestamp: startedAt.value, userTasksRequest: { pageSize, pageNumber, mode: filter.value, searchQueries: searchQueriesOf(searches), ...sortParameters() } },
    { baseUrl: baseUrl() },
  );
  startedAt.value ??= answer.serverTimestamp;
  // the count of the chosen primary filter comes with the rows
  if (filter.value !== countedOnMouseOver || counts[countedOnMouseOver] !== undefined) counts[filter.value] = answer.page.totalElements;
  return { rows: answer.userTasks, total: answer.page.totalElements };
}

// the pages on their way, so none is asked twice (the key holds what makes a request the same request)
const onTheWay = new Set<string>();
const keyOf = (pageNumber: number): string =>
  [pageNumber, pageSize, filter.value, JSON.stringify(sort.value), JSON.stringify(searchQueriesOf(searches)), startedAt.value].join('|');

function keepOnly(numbers: number[]): void {
  const kept = new Map([...pages.value].filter(([number]) => numbers.includes(number)));
  if (kept.size !== pages.value.size) pages.value = kept;
}

async function loadPage(pageNumber: number): Promise<void> {
  const key = keyOf(pageNumber);
  if (pages.value.has(pageNumber) || onTheWay.has(key)) return;
  onTheWay.add(key);
  pending.value++;
  const startedIn = generation;
  try {
    const answer = await askPage(pageNumber);
    // an answer of a list that started again, or of a page the window has left, is dropped
    if (startedIn !== generation || !windowNumbers().includes(pageNumber)) return;
    await askColumnsOf(answer.rows);
    if (startedIn !== generation || !windowNumbers().includes(pageNumber)) return;
    total.value = answer.total;
    pages.value = new Map(pages.value).set(pageNumber, answer.rows);
    refreshSelected(answer.rows);
  } catch {
    // a page which cannot be read stays a placeholder; the next scroll asks for it again
  } finally {
    onTheWay.delete(key);
    if (startedIn === generation) pending.value--;
  }
}

// loads the pages of the window and lets go of the others
function fillWindow(): void {
  // the first answer gives the timestamp every other request sends
  if (startedAt.value === undefined) return;
  const numbers = windowNumbers();
  keepOnly(numbers);
  for (const number of numbers) void loadPage(number);
}

function measure(): void {
  if (!scrollArea) return;
  areaHeight.value = scrollArea.clientHeight;
  headHeight.value = scrollArea.querySelector('thead')?.offsetHeight ?? 0;
  scrollTop.value = scrollArea.scrollTop;
}

// a scroll draws other rows at once; the pages follow at once when every visible page is there (only the page ahead is missing),
// else when the scrolling pauses, so a drag over the whole list does not ask for the pages it passes
function scrolled(): void {
  measure();
  clearTimeout(pause);
  const present = pagesOfRows(visible.value.first, visible.value.last).every((number) => pages.value.has(number));
  if (present) fillWindow();
  else pause = setTimeout(fillWindow, scrollPauseMs);
}

// no rows are held and none is on its way; the list is at its top
function clearWindow(): void {
  generation++;
  clearTimeout(pause);
  pages.value = new Map();
  total.value = 0;
  onTheWay.clear();
  pending.value = 0;
  if (scrollArea) scrollArea.scrollTop = 0;
  measure();
}

async function load(startAgain = false): Promise<void> {
  if (startAgain) {
    startedAt.value = undefined;
    clearWindow();
  }
  refusedSort.value = undefined;
  loadingFirst.value = pages.value.size === 0;
  try {
    // the first page tells the total, which sizes the scroll bar, and gives the timestamp the other pages ask with;
    // a list read again asks the pages of its window, with the same timestamp, so the rows show what the server answers now
    const numbers = startAgain || pages.value.size === 0 ? [0] : [...pages.value.keys()];
    const [firstNumber, ...otherNumbers] = numbers;
    const first = await askPage(firstNumber!);
    const others = await Promise.all(otherNumbers.map(async (number) => [number, (await askPage(number)).rows] as const));
    await askColumnsOf([first.rows, ...others.map(([, other]) => other)].flat());
    total.value = first.total;
    failed.value = false;
    pages.value = new Map([[firstNumber!, first.rows], ...others]);
    for (const rows of [first.rows, ...others.map(([, other]) => other)]) refreshSelected(rows);
    await nextTick();
    measure();
    fillWindow();
  } catch (error) {
    if (sort.value && error instanceof FailedCall && error.status === 400 && error.answer) {
      // the list falls back to its default order, and no column carries the sort mark
      sort.value = undefined;
      await load(true);
      refusedSort.value = error.answer;
      return;
    }
    // no rows, the toolbar stays, and the toast says it without a status code (TL-033)
    pages.value = new Map();
    total.value = 0;
    failed.value = true;
  } finally {
    loadingFirst.value = false;
  }
}

async function open(): Promise<void> {
  const chosenLast = await settings.read(filterSetting());
  filter.value = isPrimaryFilter(chosenLast) ? chosenLast : defaultPrimaryFilter;
  delete counts[countedOnMouseOver];
  // the rows of another list are other rows, so nothing stays selected (TL-031)
  selected.value = new Map();
  closeBulk();
  void askCounts(['OpenTasksWithoutFollowUp', 'OpenTasksWithFollowUp']);
  await load(true);
}
watch(() => props.own, open, { immediate: true });

function choose(chosen: PrimaryFilter): void {
  if (chosen === filter.value) return;
  filter.value = chosen;
  settings.write(filterSetting(), chosen);
  clearWindow();
  void load();
}

const dateAndDetails = (value?: string): { text: string; details: string } | undefined =>
  value ? { text: dateCellText(new Date(value), language.value), details: dateCellDetails(new Date(value), language.value) } : undefined;

// the tools of a row (ACT-001, ACT-003, ACT-004, TL-025): each asks the server, then the list is read again so the row shows the answer
const actionFailed = ref(false);
type Failure = 'failed' | 'ended' | 'suspendedNow' | 'heldByOther';
const failure = ref<Failure>('failed');
// a 409 means the task ended or was suspended in the meantime (ACT-013), a 400 of unclaim that another user holds it (ACT-015);
// the list is read again either way, and the reread row tells which of the two it was
async function act(call: () => Promise<unknown>, about?: { task: UserTask; unclaim?: boolean }): Promise<void> {
  let status: number | undefined;
  try {
    await call();
    actionFailed.value = false;
  } catch (error) {
    status = error instanceof FailedCall ? error.status : undefined;
    failure.value = 'failed';
    actionFailed.value = true;
  }
  await load();
  if (!about || !actionFailed.value) return;
  if (status === 409) {
    const reread = loadedTasks().find((candidate) => candidate.id === about.task.id);
    failure.value = reread?.suspendedAt && !reread.endedAt ? 'suspendedNow' : 'ended';
  } else if (status === 400 && about.unclaim) failure.value = 'heldByOther';
}

const claim = (task: UserTask, unclaim: boolean) =>
  act(() => new OfficialTasklistApi().claimTask({ userTaskId: task.id, unclaim }, { baseUrl: baseUrl() }), { task, unclaim });
// claiming takes a task out of a colleague's hands, so the user is asked first, every time (ACT-012)
const claimAskedOf = ref<UserTask>();
function claimClicked(task: UserTask, event: Event): void {
  const box = event.target as HTMLInputElement;
  if (task.assignee && task.assignee.id !== props.currentUserId) {
    box.checked = false;
    claimAskedOf.value = task;
    return;
  }
  void claim(task, Boolean(task.assignee));
}
const holderName = computed(() => claimAskedOf.value?.assignee?.display ?? claimAskedOf.value?.assignee?.id ?? '');
function answerClaimQuestion(yes: boolean): void {
  const asked = claimAskedOf.value;
  claimAskedOf.value = undefined;
  if (yes && asked) void claim(asked, false);
}
// claim, unclaim, propose and remove candidate need a task that has not ended and is not suspended (ACT-009, ACT-016)
const workedOn = (task: UserTask): boolean => Boolean(task.endedAt || task.suspendedAt);

// an update of a task may show it activated again, so the rows are read again without a reload (ACT-017)
const updates = new EventSource(updateStreamUrl());
updates.addEventListener('UserTask', () => void load());
// a task tab tells which task it changed; the rows are read again at once, without waiting for the update stream (ACT-019)
const stopListening = onTaskChangedInAnotherTab(() => void load());
onBeforeUnmount(() => {
  updates.close();
  stopListening();
  clearTimeout(pause);
  resizing?.disconnect();
  scrollArea?.removeEventListener('scroll', scrolled);
});

let resizing: ResizeObserver | undefined;
onMounted(() => {
  scrollArea = tableRef.value?.$el.querySelector<HTMLElement>('.v-table__wrapper') ?? undefined;
  if (!scrollArea) return;
  scrollArea.addEventListener('scroll', scrolled, { passive: true });
  // a taller area draws more rows and holds more pages
  resizing = new ResizeObserver(() => {
    measure();
    fillWindow();
  });
  resizing.observe(scrollArea);
  measure();
});

const candidatesOpenOf = ref<string>();
const proposals = ref<Person[]>([]);
const proposalsAsked = ref(false);
async function searchPersons(query: string): Promise<void> {
  try {
    proposals.value = (await new OfficialTasklistApi().findUsers({ query, limit: 10 }, { baseUrl: baseUrl() })).users ?? [];
    proposalsAsked.value = true;
  } catch {
    actionFailed.value = true;
  }
}
function closeCandidates(): void {
  candidatesOpenOf.value = undefined;
  proposals.value = [];
  proposalsAsked.value = false;
}
const propose = (task: UserTask, person: Person) =>
  act(() => new OfficialTasklistApi().assignTask({ userTaskId: task.id, userId: person.id }, { baseUrl: baseUrl() }));
const removeCandidate = (task: UserTask, person: Person) =>
  act(() => new OfficialTasklistApi().assignTask({ userTaskId: task.id, userId: person.id, unassign: true }, { baseUrl: baseUrl() }));

const noteHoveredOf = ref<string>();
const noteEditedOf = ref<string>();
const noteDraft = ref('');
function editNote(task: UserTask): void {
  noteDraft.value = task.note ?? '';
  noteEditedOf.value = task.id;
}
async function saveNote(task: UserTask): Promise<void> {
  noteEditedOf.value = undefined;
  await act(() => new OfficialTasklistApi().setUserTaskNote({ userTaskId: task.id, noteRequest: { text: noteDraft.value } }, { baseUrl: baseUrl() }));
}

const markAsRead = (task: UserTask, unread: boolean) =>
  act(() => new OfficialTasklistApi().markTaskAsRead({ userTaskId: task.id, unread }, { baseUrl: baseUrl() }));

const followUpOpenOf = ref<string>();
const followUpDraft = ref('');
function editFollowUp(task: UserTask): void {
  followUpDraft.value = task.followUpDate ? dayOf(task.followUpDate) : '';
  followUpOpenOf.value = task.id;
}
async function setFollowUp(task: UserTask, day: string | undefined): Promise<void> {
  followUpOpenOf.value = undefined;
  await act(() => new OfficialTasklistApi().setFollowUpDate(
    { userTaskId: task.id, followUpDateRequest: day ? { timestamp: startOfDay(day) } : {} },
    { baseUrl: baseUrl() },
  ));
}

// the tools of the toolbar act on the selection (TL-019); a tool with nothing to act on is disabled (ACT-009)
const noTarget = (action: BulkAction): boolean => targetsOf(action, selectedTasks.value).length === 0;
const bulkOpen = ref<'propose' | 'note' | 'followUp'>();
const bulkNote = ref('');
const bulkDay = ref('');
function closeBulk(): void {
  bulkOpen.value = undefined;
  proposals.value = [];
  proposalsAsked.value = false;
}
function openBulk(tool: 'propose' | 'note' | 'followUp'): void {
  const wasOpen = bulkOpen.value === tool;
  closeBulk();
  if (wasOpen) return;
  bulkNote.value = '';
  bulkDay.value = '';
  bulkOpen.value = tool;
}

// a question waits for the answer of the user; yes goes on with the next question or the request (ACT-018)
const question = ref<{ text: string; yes: () => void }>();
function askThen(questions: string[], proceed: () => void): void {
  const [first, ...rest] = questions;
  if (first === undefined) return proceed();
  question.value = { text: first, yes: () => askThen(rest, proceed) };
}
function answerQuestion(yes: boolean): void {
  const asked = question.value;
  question.value = undefined;
  if (yes) asked?.yes();
}

// sends one action for the selection, without the tasks the action leaves out; ids go in requests of at most 1,000
function bulk(action: BulkAction, send: (ids: string[]) => Promise<unknown>, groupSize?: number): void {
  const all = selectedTasks.value;
  const targets = targetsOf(action, all);
  if (targets.length === 0) return;
  const questions = [
    ...(asksBeforeLeavingOut(action) && hasTasksToLeaveOut(action, all) ? [text().bulk.leaveOut[action as 'claim' | 'propose']] : []),
    ...(action === 'claim' && heldByOthers(targets, props.currentUserId) ? [text().bulk.claimFromOthers] : []),
  ];
  const ids = targets.map((task) => task.id);
  askThen(questions, () => void act(async () => {
    for (const group of chunksOf(ids, groupSize)) await send(group);
  }));
}

const bulkClaim = () => bulk('claim', (ids) => new OfficialTasklistApi().claimTasks({ userTaskIds: { userTaskIds: ids } }, { baseUrl: baseUrl() }));
const bulkMarkAsRead = (unread: boolean) =>
  bulk(unread ? 'markUnread' : 'markRead', (ids) => new OfficialTasklistApi().markTasksAsRead({ unread, userTaskIds: { userTaskIds: ids } }, { baseUrl: baseUrl() }));
function bulkPropose(person: Person): void {
  closeBulk();
  bulk('propose', (ids) => new OfficialTasklistApi().assignTasks({ userId: person.id, userTaskIds: { userTaskIds: ids } }, { baseUrl: baseUrl() }));
}
function bulkSaveNote(): void {
  const noteText = bulkNote.value;
  closeBulk();
  bulk('note', (ids) => new OfficialTasklistApi().setUserTasksNote({ userTasksNoteRequest: { userTaskIds: ids, text: noteText } }, { baseUrl: baseUrl() }));
}
// the GUI API has no list form for the follow-up date, so a few requests go out at once
const requestsAtOnce = 20;
function bulkSetFollowUp(day: string | undefined): void {
  closeBulk();
  bulk('followUp', (ids) => Promise.all(ids.map((userTaskId) => new OfficialTasklistApi().setFollowUpDate(
    { userTaskId, followUpDateRequest: day ? { timestamp: startOfDay(day) } : {} },
    { baseUrl: baseUrl() },
  ))), requestsAtOnce);
}

const shortForm = (person: Person): string => person.displayShort ?? person.display ?? person.id;
</script>

<template>
  <search-bar :applied="searches[fullText] ?? ''" :suggest="suggest" @apply="search(fullText, $event)" @reset="resetSearches">
    <!-- the tools (TL-029): always shown, the ones that act on the selection are disabled while nothing is selected -->
    <div class="tools" data-testid="toolbar-tools" @keydown.esc="closeBulk">
      <span class="selected-info"><span data-testid="selected-count">{{ selected.size }}</span> {{ text().bulk.selected }}</span>
      <v-btn data-testid="tool-claim" size="small" variant="text" :icon="mdiAccountCheckOutline" :title="text().actions.claim" :aria-label="text().actions.claim" :disabled="noTarget('claim')" @click="bulkClaim"></v-btn>
      <v-btn data-testid="tool-propose" size="small" variant="text" :icon="mdiAccountArrowRight" :title="text().actions.proposeTo" :aria-label="text().actions.proposeTo" :disabled="noTarget('propose')" @click="openBulk('propose')"></v-btn>
      <v-btn data-testid="tool-mark-read" size="small" variant="text" :icon="mdiEmailOpenOutline" :title="text().actions.markRead" :aria-label="text().actions.markRead" :disabled="noTarget('markRead')" @click="bulkMarkAsRead(false)"></v-btn>
      <v-btn data-testid="tool-mark-unread" size="small" variant="text" :icon="mdiEmailOutline" :title="text().actions.markUnread" :aria-label="text().actions.markUnread" :disabled="noTarget('markUnread')" @click="bulkMarkAsRead(true)"></v-btn>
      <v-btn data-testid="tool-follow-up" size="small" variant="text" :icon="mdiCalendarClock" :title="text().actions.followUp" :aria-label="text().actions.followUp" :disabled="noTarget('followUp')" @click="openBulk('followUp')"></v-btn>
      <v-btn data-testid="tool-note" size="small" variant="text" :icon="mdiNoteEditOutline" :title="text().actions.note" :aria-label="text().actions.note" :disabled="noTarget('note')" @click="openBulk('note')"></v-btn>
      <div v-if="bulkOpen === 'propose'" class="over-list bulk-popup" data-testid="bulk-propose-popup">
        <input
          data-testid="bulk-propose-search"
          class="propose-search"
          type="search"
          :placeholder="text().actions.proposeTo + ': ' + text().actions.searchPerson"
          @input="searchPersons(($event.target as HTMLInputElement).value)"
        />
        <button v-for="person in proposals" :key="person.id" type="button" data-testid="bulk-propose-result" class="propose-result" @click="bulkPropose(person)">
          {{ person.display ?? person.id }}
        </button>
        <div v-if="proposalsAsked && proposals.length === 0" data-testid="bulk-propose-none">{{ text().actions.noPerson }}</div>
      </div>
      <div v-if="bulkOpen === 'note'" class="over-list bulk-popup note-popup" data-testid="bulk-note-popup">
        <textarea v-model="bulkNote" data-testid="bulk-note-input" rows="4" maxlength="10000" :aria-label="text().actions.note" />
        <div>
          <v-btn data-testid="bulk-note-save" size="small" @click="bulkSaveNote">{{ text().actions.save }}</v-btn>
          <v-btn data-testid="bulk-note-cancel" size="small" variant="text" @click="closeBulk">{{ text().actions.cancel }}</v-btn>
        </div>
      </div>
      <div v-if="bulkOpen === 'followUp'" class="over-list bulk-popup" data-testid="bulk-follow-up-popup">
        <input v-model="bulkDay" type="date" data-testid="bulk-follow-up-input" :aria-label="text().actions.followUp" />
        <div>
          <v-btn data-testid="bulk-follow-up-save" size="small" :disabled="!bulkDay" @click="bulkSetFollowUp(bulkDay)">{{ text().actions.save }}</v-btn>
          <v-btn data-testid="bulk-follow-up-delete" size="small" variant="text" @click="bulkSetFollowUp(undefined)">{{ text().actions.deleteFollowUp }}</v-btn>
          <v-btn data-testid="bulk-follow-up-cancel" size="small" variant="text" @click="closeBulk">{{ text().actions.cancel }}</v-btn>
        </div>
      </div>
    </div>
  </search-bar>
  <v-progress-linear v-if="loadingFirst" data-testid="list-loading" indeterminate class="mx-4" style="width: auto" />
  <v-table
    ref="tableRef"
    data-testid="task-list"
    class="task-list ma-4"
    fixed-header
    height="calc(100vh - 192px)"
    :data-window-pages="[...pages.keys()].sort((a, b) => a - b).join(',')"
    :data-window-rows="windowRows"
    :data-pending="pending"
  >
    <thead>
      <tr>
        <th
          v-for="column in columns"
          :key="column"
          :data-testid="`column-header-${column}`"
          :data-path="paths[column]"
          :data-sortable="isSortable(column)"
          :data-sort="sortMarkOf(column)"
          @click="sortBy(column)"
          :class="{ 'icon-cell': column === 'candidateUsers', sortable: isSortable(column) }"
          :style="widthStyle(column)"
          :aria-label="column === 'candidateUsers' ? text().columns[column] : undefined"
        >
          <v-icon v-if="column === 'candidateUsers'" data-testid="candidate-header-icon" :icon="mdiAccountMultiple" />
          <template v-else>{{ text().columns[column] }}</template>
          <v-icon v-if="sortMarkOf(column)" data-testid="sort-mark" size="small" :icon="sortMarkOf(column) === 'asc' ? mdiArrowUp : mdiArrowDown" />
          <span v-if="fixedResizeable(column)" :data-testid="`column-resize-${column}`" class="resize-edge" @pointerdown="startResize(column, $event)" @click.stop />
        </th>
        <th v-for="column in moduleColumns" :key="column.path" :data-testid="`column-header-module-${column.path}`" :data-path="column.path" :style="widthStyle(`module-${column.path}`)">
          {{ titleOfColumn(column) }}
          <span v-if="column.resizeable" :data-testid="`column-resize-module-${column.path}`" class="resize-edge" @pointerdown="startResize(`module-${column.path}`, $event)" />
        </th>
        <th data-testid="column-header-tools" class="tools-header" :aria-label="text().actions.tools" />
      </tr>
      <tr class="filter-row">
        <th v-for="column in columns" :key="column" class="filter-cell">
          <template v-if="filterable.includes(column)">
            <input
              v-model="columnDrafts[column]"
              :data-testid="`column-filter-${column}`"
              class="column-filter"
              type="text"
              :aria-label="`${text().search.filterBy} ${text().columns[column]}`"
              @change="setColumnFilter(column)"
            />
            <v-btn
              v-if="columnDrafts[column]"
              :data-testid="`column-filter-clear-${column}`"
              variant="text"
              size="x-small"
              icon
              :aria-label="text().search.clear"
              @click="clearColumnFilter(column)"
            ><v-icon :icon="mdiClose" /></v-btn>
          </template>
        </th>
        <th v-for="column in moduleColumns" :key="column.path" class="filter-cell" />
        <th class="filter-cell" />
      </tr>
    </thead>
    <tbody>
      <tr v-if="spaceAbove > 0" class="space" aria-hidden="true"><td :colspan="columns.length + moduleColumns.length + 1" :style="{ height: `${spaceAbove}px` }" /></tr>
      <template v-for="{ key, task } in drawn" :key="key">
      <tr v-if="!task" data-testid="task-placeholder" class="task-row placeholder"><td :colspan="columns.length + moduleColumns.length + 1" /></tr>
      <tr v-else data-testid="task-row" :data-task-id="task.id" :data-parts="partsOf[task.id]" :data-state="stateOf(task)" :class="['task-row', stateOf(task), { unread: !task.read }]">
        <td data-testid="cell-id" class="select-cell">
          <input
            type="checkbox"
            data-testid="select-row"
            :aria-label="text().bulk.selectRow"
            :checked="selected.has(task.id)"
            @change="toggleSelected(task, ($event.target as HTMLInputElement).checked)"
          />
        </td>
        <td data-testid="cell-businessId">{{ task.businessId }}</td>
        <td data-testid="cell-caseKind">{{ pickTranslation(task.workflowTitle ?? {}, language) }}</td>
        <td data-testid="cell-title">
          <a data-testid="task-title" :href="linkOf(task)" :target="isExternal(task) ? '_blank' : undefined" :rel="isExternal(task) ? 'noopener' : undefined">{{ pickTranslation(task.title, language) }}</a>
          <span v-if="partsOf[task.id] === 'unopenable'" data-testid="cannot-open" class="cannot-open">{{ text().cannotOpenHere }}</span>
          <span v-if="columnsFailedOf(task) && moduleColumns.length === 0" data-testid="columns-not-loaded" class="cannot-open">{{ text().columnsNotLoaded }}</span>
        </td>
        <td data-testid="cell-dueDate">
          <template v-if="dateAndDetails(task.dueDate)">
            {{ dateAndDetails(task.dueDate)!.text }}
            <v-tooltip activator="parent" location="bottom">
              <span data-testid="date-details">{{ dateAndDetails(task.dueDate)!.details }}</span>
            </v-tooltip>
          </template>
        </td>
        <td data-testid="cell-assignee" class="assignee-cell">
          <input
            type="checkbox"
            class="claim-checkbox"
            data-testid="claim-checkbox"
            :aria-label="task.assignee ? text().actions.unclaim : text().actions.claim"
            :checked="Boolean(task.assignee)"
            :disabled="workedOn(task)"
            @change="claimClicked(task, $event)"
          />
          <template v-if="task.assignee">
            <span class="bar-slot"><span v-if="task.assignee.id === currentUserId" data-testid="claimed-bar" class="bar" /></span>
            <span data-testid="assignee-name">{{ shortForm(task.assignee) }}</span>
            <v-tooltip activator="parent" location="bottom">
              <div data-testid="assignee-details">
                <div>{{ task.assignee.display ?? task.assignee.id }}</div>
                <div>{{ task.assignee.id }}</div>
                <div v-if="task.assignee.email">{{ task.assignee.email }}</div>
              </div>
            </v-tooltip>
          </template>
        </td>
        <td
          data-testid="cell-candidateUsers"
          class="icon-cell candidate-cell"
          @mouseenter="candidatesOpenOf = task.id"
          @mouseleave="closeCandidates"
        >
          <v-icon
            v-if="(task.candidateUsers ?? []).length > 0"
            data-testid="candidate-icon"
            :data-persons="task.candidateUsers!.length === 1 ? 'one' : 'several'"
            :icon="task.candidateUsers!.length === 1 ? mdiAccount : mdiAccountMultiple"
          />
          <div v-if="candidatesOpenOf === task.id" class="over-list candidate-popup" data-testid="candidate-popup">
            <div v-for="person in task.candidateUsers ?? []" :key="person.id" data-testid="candidate-person" class="candidate-person">
              <span>{{ person.display ?? person.id }}</span>
              <v-btn
                data-testid="candidate-remove"
                variant="text"
                size="x-small"
                icon
                :aria-label="text().actions.remove"
                :disabled="workedOn(task)"
                @click="removeCandidate(task, person)"
              ><v-icon :icon="mdiDelete" /></v-btn>
            </div>
            <input
              data-testid="propose-search"
              class="propose-search"
              :disabled="workedOn(task)"
              type="search"
              :placeholder="text().actions.proposeTo + ': ' + text().actions.searchPerson"
              @input="searchPersons(($event.target as HTMLInputElement).value)"
            />
            <button v-for="person in proposals" :key="person.id" type="button" data-testid="propose-result" class="propose-result" @click="propose(task, person)">
              {{ person.display ?? person.id }}
            </button>
            <div v-if="proposalsAsked && proposals.length === 0" data-testid="propose-none">{{ text().actions.noPerson }}</div>
          </div>
        </td>
        <td data-testid="cell-note" class="note-cell" @mouseenter="noteHoveredOf = task.id" @mouseleave="noteHoveredOf = undefined">
          <span>{{ task.note }}</span>
          <v-btn
            v-if="noteHoveredOf === task.id && noteEditedOf !== task.id"
            data-testid="note-edit"
            :disabled="Boolean(task.endedAt)"
            variant="text"
            size="x-small"
            icon
            :aria-label="text().actions.editNote"
            @click="editNote(task)"
          ><v-icon :icon="mdiNoteEditOutline" /></v-btn>
          <div v-if="noteEditedOf === task.id" class="over-list note-popup" data-testid="note-popup">
            <textarea v-model="noteDraft" data-testid="note-input" rows="4" maxlength="10000" :aria-label="text().actions.note" />
            <div>
              <v-btn data-testid="note-save" size="small" @click="saveNote(task)">{{ text().actions.save }}</v-btn>
              <v-btn data-testid="note-cancel" size="small" variant="text" @click="noteEditedOf = undefined">{{ text().actions.cancel }}</v-btn>
            </div>
          </div>
        </td>
        <td v-if="showsFollowUp(filter)" data-testid="cell-followUpDate">
          <template v-if="dateAndDetails(task.followUpDate)">
            {{ dateAndDetails(task.followUpDate)!.text }}
            <v-tooltip activator="parent" location="bottom">
              <span data-testid="date-details">{{ dateAndDetails(task.followUpDate)!.details }}</span>
            </v-tooltip>
          </template>
        </td>
        <td v-if="showsEnded(filter)" data-testid="cell-endedAt">
          <template v-if="dateAndDetails(task.endedAt)">
            {{ dateAndDetails(task.endedAt)!.text }}
            <v-tooltip activator="parent" location="bottom">
              <span data-testid="date-details">{{ dateAndDetails(task.endedAt)!.details }}</span>
            </v-tooltip>
          </template>
        </td>
        <td v-for="column in moduleColumns" :key="column.path" :data-testid="`cell-module-${column.path}`" class="module-cell" :style="{ textAlign: columnsFailedOf(task) ? 'left' : cellFor(task, column).align }">
          <span v-if="columnsFailedOf(task)" data-testid="columns-not-loaded" class="cannot-open">{{ text().columnsNotLoaded }}</span>
          <template v-else-if="cellFor(task, column).kind === 'number'"
            >{{ cellFor(task, column).integer }}<span class="fraction" :style="{ width: `${fractionWidths[column.path]! + 1}ch` }"><span v-if="cellFor(task, column).fraction" class="mark">{{ cellFor(task, column).fraction!.slice(0, 1) }}</span>{{ cellFor(task, column).fraction!.slice(1) }}</span></template>
          <span v-else-if="cellFor(task, column).kind === 'needs-a-type'" class="cannot-open">{{ text().columnNeedsType }}</span>
          <template v-else>
            {{ cellFor(task, column).text }}
            <v-tooltip v-if="cellFor(task, column).details" activator="parent" location="bottom">
              <span data-testid="cell-details" style="white-space: pre-line">{{ cellFor(task, column).details }}</span>
            </v-tooltip>
          </template>
        </td>
        <td data-testid="cell-tools" class="tools-cell">
          <v-btn
            :data-testid="task.read ? 'mark-unread' : 'mark-read'"
            variant="text"
            size="x-small"
            icon
            :aria-label="task.read ? text().actions.markUnread : text().actions.markRead"
            @click="markAsRead(task, Boolean(task.read))"
          ><v-icon :icon="task.read ? mdiEmailOutline : mdiEmailOpenOutline" /></v-btn>
          <v-btn
            data-testid="follow-up-edit"
            variant="text"
            size="x-small"
            icon
            :disabled="Boolean(task.endedAt)"
            :aria-label="text().actions.followUp"
            @click="editFollowUp(task)"
          ><v-icon :icon="mdiCalendarClock" /></v-btn>
          <div v-if="followUpOpenOf === task.id" class="over-list follow-up-popup" data-testid="follow-up-popup">
            <input v-model="followUpDraft" type="date" data-testid="follow-up-input" :aria-label="text().actions.followUp" />
            <div>
              <v-btn data-testid="follow-up-save" size="small" :disabled="!followUpDraft" @click="setFollowUp(task, followUpDraft)">{{ text().actions.save }}</v-btn>
              <v-btn data-testid="follow-up-delete" size="small" variant="text" @click="setFollowUp(task, undefined)">{{ text().actions.deleteFollowUp }}</v-btn>
              <v-btn data-testid="follow-up-cancel" size="small" variant="text" @click="followUpOpenOf = undefined">{{ text().actions.cancel }}</v-btn>
            </div>
          </div>
        </td>
      </tr>
      </template>
      <tr v-if="noticeShown" data-testid="capped-notice" class="capped-notice" aria-selected="false"><td :colspan="columns.length + moduleColumns.length + 1">{{ cappedNotice() }}</td></tr>
      <tr v-if="spaceBelow > 0" class="space" aria-hidden="true"><td :colspan="columns.length + moduleColumns.length + 1" :style="{ height: `${spaceBelow}px` }" /></tr>
    </tbody>
  </v-table>
  <p v-if="total === 0 && !failed" class="ma-4" data-testid="no-tasks">{{ text().noTasks }}</p>
  <status-line :selected="filter" :counts="counts" @choose="choose" @ask-count="askCounts([$event])" />
   <v-snackbar :model-value="actionFailed" data-testid="action-toast" timeout="4000" color="error" @update:model-value="actionFailed = false">{{ text().actions[failure] }}</v-snackbar>
  <v-dialog :model-value="Boolean(claimAskedOf)" max-width="420" @update:model-value="claimAskedOf = undefined">
    <v-card data-testid="claim-confirm">
      <v-card-text>{{ text().actions.claimFromOther.replace('{name}', holderName) }}</v-card-text>
      <v-card-actions>
        <v-btn data-testid="claim-confirm-yes" @click="answerClaimQuestion(true)">{{ text().actions.yes }}</v-btn>
        <v-btn data-testid="claim-confirm-no" variant="text" @click="answerClaimQuestion(false)">{{ text().actions.no }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-dialog :model-value="Boolean(question)" max-width="420" @update:model-value="question = undefined">
    <v-card data-testid="bulk-confirm">
      <v-card-text>{{ question?.text }}</v-card-text>
      <v-card-actions>
        <v-btn data-testid="bulk-confirm-yes" @click="answerQuestion(true)">{{ text().actions.yes }}</v-btn>
        <v-btn data-testid="bulk-confirm-no" variant="text" @click="answerQuestion(false)">{{ text().actions.no }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-snackbar :model-value="failed || refusedSort !== undefined" data-testid="list-toast" timeout="-1" color="error">{{ refusedSort ?? text().listNotLoaded }}</v-snackbar>
</template>

<style scoped>
.cannot-open { display: block; font-size: 0.8rem; opacity: 0.7; }
th.sortable { cursor: pointer; user-select: none; }
thead th { position: relative; overflow: hidden; }
/* the right edge of a header is the handle to drag (COL-022) */
.resize-edge { position: absolute; top: 0; right: 0; width: 6px; height: 100%; cursor: col-resize; touch-action: none; }
.filter-cell { position: sticky; top: 56px; z-index: 2; padding: 0 4px !important; height: 36px !important; }
.column-filter { width: 100%; border: 1px solid #bdbdbd; border-radius: 4px; padding: 2px 24px 2px 6px; font-size: 0.85em; }
.filter-cell .v-btn { position: absolute; right: 6px; top: 6px; }
/* both scroll bars are always there, so the list does not draw itself again when one appears (COL-018) */
.task-list :deep(.v-table__wrapper) { overflow: scroll; overflow-anchor: none; }
.task-list .fraction { display: inline-block; text-align: left; }
.task-list .module-cell { font-variant-numeric: tabular-nums; }
.task-list :deep(table) { min-width: 1100px; }
/* white, partly transparent, so the background shows through, blurred where the browser can (TL-032) */
.task-row > td { height: 46px; box-sizing: border-box; white-space: nowrap; }
.capped-notice > td { height: 46px; box-sizing: border-box; text-align: center; font-style: italic; user-select: none; background-color: #fff8e1; }
.space > td { padding: 0 !important; border: 0 !important; }
.task-list { background-color: rgba(255, 255, 255, 0.85); color: #212121; backdrop-filter: blur(8px); }
.bar-slot { display: inline-block; width: 6px; margin-right: 6px; height: 1.2em; vertical-align: middle; }
.bar { display: block; width: 3px; height: 100%; background-color: rgb(var(--v-theme-primary)); }
.icon-cell { width: 48px; max-width: 48px; padding: 0 !important; text-align: center; }
/* the look of a state (TL-023), a row the user has not read is bold, the whole row (TL-007) */
.task-row.unread td, .task-row.unread a { font-weight: 700; }
.task-row.completed, .task-row.cancelled { background-color: #e0e0e0; }
.task-row.cancelled a { text-decoration: line-through; }
.task-row.suspended td, .task-row.suspended a { color: rgba(33, 33, 33, 0.55); }
/* the claim checkbox shows on mouse-over of the assignee cell only (TL-014) */
.assignee-cell { position: relative; }
.claim-checkbox { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); visibility: hidden; }
.assignee-cell:hover .claim-checkbox { visibility: visible; }
/* the tools over the list do not move it (TL-030) */
.candidate-cell, .note-cell, .tools-cell { position: relative; }
.tools-cell, .tools-header { width: 96px; white-space: nowrap; }
.tools-cell { right: 0; }
.follow-up-popup { right: 0; left: auto; }
.over-list { position: absolute; z-index: 5; top: 100%; left: 0; min-width: 240px; padding: 8px; text-align: left; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
.tools { position: relative; display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.selected-info { margin-right: 8px; white-space: nowrap; }
.select-cell { width: 48px; text-align: center; }
.bulk-popup { top: 100%; }
.candidate-person { display: flex; align-items: center; justify-content: space-between; }
.propose-search, .note-popup textarea { width: 100%; border: 1px solid #9e9e9e; padding: 4px; }
.propose-result { display: block; width: 100%; padding: 4px; text-align: left; }
</style>
