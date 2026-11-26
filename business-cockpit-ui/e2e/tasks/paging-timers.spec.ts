import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Q-PAGE-SIZE 20, row height 46 px, Q-MAX-LIST-ENTRIES 100,000, pause of the list 100 ms
const pageSize = 20;
const rowHeight = 46;
const maxListEntries = 100_000;
const pauseMs = 100;

const generate = (page: Page, count: number) => page.request.post('/simulator-api/generate-user-tasks', { data: { count, modules: 3 } });
const taskRequests = async (page: Page): Promise<{ body: { pageNumber: number } }[]> =>
  ((await (await page.request.get('/simulator-api/list-requests')).json()) as { path: string; body: { pageNumber: number } }[]).filter((request) => request.path.endsWith('/usertask'));
const list = (page: Page) => page.getByTestId('task-list');
const scroller = (page: Page) => list(page).locator('.v-table__wrapper');
const rows = (page: Page) => page.getByTestId('task-row');
const heldPages = async (page: Page): Promise<number[]> => ((await list(page).getAttribute('data-window-pages')) ?? '').split(',').filter(Boolean).map(Number);
// the browser sends its scroll event with the next frame; the test waits for it in real time, so it falls before the clock moves on
const scrollTo = async (page: Page, row: number) => {
  await scroller(page).evaluate((element, top) => { element.scrollTop = top; }, row * rowHeight);
  await page.waitForTimeout(50);
};
// the answers are fetched in real time; the page clock only holds the timers
const answered = (page: Page) => expect(list(page)).toHaveAttribute('data-pending', '0');

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

// the test controls the timers of the page: the clock stands still until the test lets it run
const openWithClock = async (page: Page, count: number) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await generate(page, count);
  await page.clock.install();
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await answered(page);
};

test('SRCH-029 a jump over several pages loads every page of the window once the pause is over, and not before', async ({ page }) => {
  await openWithClock(page, 8000);
  const before = (await taskRequests(page)).length;
  await scrollTo(page, 150);
  await page.clock.runFor(pauseMs - 10);
  await page.waitForTimeout(100);
  expect((await taskRequests(page)).length, 'pages asked before the pause is over').toBe(before);
  await page.clock.runFor(20);
  await answered(page);
  const held = await heldPages(page);
  expect(held).toContain(7);
  expect(held.length).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId('task-placeholder')).toHaveCount(0);
});

test('SRCH-029 a page in the window is not asked for again, also not when the pause runs out twice', async ({ page }) => {
  await openWithClock(page, 3000);
  await scrollTo(page, 600);
  await page.clock.runFor(pauseMs + 10);
  await answered(page);
  const before = (await taskRequests(page)).length;
  await scrollTo(page, 601);
  await page.clock.runFor(pauseMs + 10);
  await scrollTo(page, 600);
  await page.clock.runFor(pauseMs + 10);
  await answered(page);
  const asked = (await taskRequests(page)).slice(before).map((request) => request.body.pageNumber);
  const earlier = (await taskRequests(page)).slice(0, before).map((request) => request.body.pageNumber);
  for (const number of asked) expect(earlier, `asked again ${asked.join(',')}`).not.toContain(number);
  expect(new Set(asked).size).toBe(asked.length);
});

test('SRCH-029 fast scroll events load only the range drawn after the pause', async ({ page }) => {
  await openWithClock(page, 4000);
  const before = (await taskRequests(page)).length;
  // 40 jumps, 10 ms apart: each is a new range, none lets the pause run out
  for (let step = 1; step <= 40; step++) {
    await scrollTo(page, step * 50);
    await page.clock.runFor(10);
  }
  expect((await taskRequests(page)).length).toBe(before);
  await page.clock.runFor(pauseMs + 10);
  await answered(page);
  const asked = (await taskRequests(page)).slice(before).map((request) => request.body.pageNumber);
  const held = await heldPages(page);
  expect(asked.length).toBeGreaterThan(0);
  // no page of the 40 passed ranges is asked for, only those of the window where the list stands
  for (const number of asked) expect(held, `asked ${asked.join(',')}`).toContain(number);
  expect(Math.max(...held) - Math.min(...held)).toBeLessThanOrEqual(4);
});

test('SRCH-029 opening the list twice adds no second subscription to the update stream, and a new search or sort adds none', async ({ page }) => {
  await page.addInitScript(() => {
    // the update stream is a fetch stream: it is open from the call until its signal aborts it
    const original = window.fetch.bind(window);
    const state = { opened: 0, closed: 0 };
    (window as unknown as { streams: typeof state }).streams = state;
    window.fetch = (input, init) => {
      if (String(input instanceof Request ? input.url : input).endsWith('/updates')) {
        state.opened++;
        init?.signal?.addEventListener('abort', () => state.closed++);
      }
      return original(input, init);
    };
  });
  await generate(page, 300);
  const open = async () => (await page.evaluate(() => (window as unknown as { streams: { opened: number; closed: number } }).streams));
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  const first = await open();
  // the header counts and the list: one stream each
  expect(first.opened - first.closed).toBe(2);
  await page.getByTestId('column-header-id').click();
  await expect(page.getByTestId('sort-mark')).toBeVisible();
  await page.getByTestId('primary-filter-ClosedTasksOnly').click();
  await expect(list(page)).toHaveAttribute('data-pending', '0');
  expect(await open()).toEqual(first);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  const second = await open();
  expect(second.opened - second.closed).toBe(2);
});

test('SRCH-029 a capped list is as long as the limit, shows the real total, and keeps what a live update added above the last rows', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await generate(page, 300);
  // the page answers for a list with 150,010 entries
  await page.route((url) => /\/usertask$/.test(url.pathname), async (route) => {
    const response = await route.fetch();
    const answer = await response.json();
    answer.page.totalElements = 150_010;
    await route.fulfill({ response, json: answer });
  });
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  const height = await scroller(page).evaluate((element) => element.scrollHeight);
  expect(height).toBeGreaterThanOrEqual(maxListEntries * rowHeight);
  expect(height).toBeLessThan(maxListEntries * rowHeight + 300);
  // a page crossing the limit never reaches past it: the last row of the list is the 100,000th
  await scroller(page).evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(400);
  await answered(page);
  expect(Math.max(...(await heldPages(page)))).toBeLessThanOrEqual(Math.floor((maxListEntries - 1) / pageSize));
  await expect(page.getByTestId('capped-notice')).toHaveCount(1);
  await expect(page.getByTestId('primary-filter-OpenTasksWithoutFollowUp')).toHaveText(/\(150,010\)/);
});

test('SRCH-029 the notice row shows only for a capped list, after its last row', async ({ page }) => {
  await generate(page, 300);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  await scroller(page).evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(300);
  await expect(page.getByTestId('capped-notice')).toHaveCount(0);
});

const source = (path: string): string => readFileSync(resolve(__dirname, '../../packages/ui/src', path), 'utf8');

test('SRCH-030 Q-MAX-LIST-ENTRIES is one constant in a file of its own that the list and the notice read', async () => {
  expect(source('tasks/maxListEntries.ts')).toMatch(/export const maxListEntries = 100_000;/);
  for (const file of ['tasks/paging.ts', 'tasks/cappedNotice.ts', 'tasks/TaskList.vue']) {
    expect(source(file), file).not.toMatch(/(const|let) maxListEntries\b/);
  }
  expect(source('tasks/paging.ts')).toMatch(/from '\.\/maxListEntries'/);
  expect(source('tasks/cappedNotice.ts')).toMatch(/from '\.\/maxListEntries'/);
  expect(source('tasks/TaskList.vue')).toMatch(/from '\.\/maxListEntries'/);
});

test('SRCH-030 a page request is a call into a set of pages on their way, never a reactive value, and the list cleans up when it closes', async () => {
  const code = source('tasks/TaskList.vue');
  expect(code).toMatch(/const onTheWay = new Set<string>\(\)/);
  expect(code).not.toMatch(/(requested|wanted|nextPage|pageRequest)\s*=\s*(ref|shallowRef)/);
  const cleanUp = code.slice(code.indexOf('onBeforeUnmount('));
  for (const step of ['updates.close()', 'clearTimeout(pause)', 'resizing?.disconnect()', "removeEventListener('scroll'"]) expect(cleanUp.slice(0, 400), step).toContain(step);
});

test('SRCH-032 the scroll bar of a list below the limit is as high as its entries at the fixed row height', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await generate(page, 2000);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  await expect(list(page)).toHaveAttribute('data-pending', '0');
  // the total of the first filter, however many tasks the simulator holds open
  const entries = Number((await page.getByTestId('primary-filter-OpenTasksWithoutFollowUp').textContent())!.replace(/\D/g, ''));
  expect(entries).toBeGreaterThan(100);
  const head = await list(page).locator('thead').evaluate((element) => element.getBoundingClientRect().height);
  const height = await scroller(page).evaluate((element) => element.scrollHeight);
  expect(Math.abs(height - (entries * rowHeight + head))).toBeLessThanOrEqual(2);
});

test('SRCH-032 a row with data and a placeholder row are exactly as high as the fixed row height', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await generate(page, 2000);
  await page.route((url) => /\/usertask$/.test(url.pathname), async (route) => {
    const body = route.request().postDataJSON();
    if (body.pageNumber > 5) await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  await scrollTo(page, 800);
  const placeholder = page.getByTestId('task-placeholder').first();
  await expect(placeholder).toBeVisible();
  expect((await placeholder.boundingBox())!.height).toBe(rowHeight);
  await scrollTo(page, 3);
  await expect(rows(page).first()).toBeVisible();
  const heights = await rows(page).evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  for (const height of heights) expect(height).toBe(rowHeight);
});
