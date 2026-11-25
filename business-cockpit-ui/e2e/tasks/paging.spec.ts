import { expect, test, type Page } from '@playwright/test';

// Q-PAGE-SIZE 20, row height 46 px, Q-MEMORY-LIMIT 150 MB
const pageSize = 20;
const rowHeight = 46;
const memoryLimit = 150 * 1024 * 1024;

type Request = { path: string; body: { pageSize?: number; mode?: string; pageNumber?: number }; initialTimestamp?: string; serverTimestamp?: string };

const generate = (page: Page, count: number, modules = 3) =>
  page.request.post('/simulator-api/generate-user-tasks', { data: { count, modules } });
const listRequests = async (page: Page): Promise<Request[]> => (await page.request.get('/simulator-api/list-requests')).json();
const list = (page: Page) => page.getByTestId('task-list');
const scroller = (page: Page) => list(page).locator('.v-table__wrapper');
const rows = (page: Page) => page.getByTestId('task-row');
const windowPages = async (page: Page): Promise<number[]> => ((await list(page).getAttribute('data-window-pages')) ?? '').split(',').filter(Boolean).map(Number);
const windowRows = async (page: Page): Promise<number> => Number(await list(page).getAttribute('data-window-rows'));
// a scroll is answered after the pause of the list (100 ms), so the test waits a little longer, then for the pages on their way
const scrollToRow = async (page: Page, row: number) => {
  await scroller(page).evaluate((element, top) => { element.scrollTop = top; }, row * rowHeight);
  await page.waitForTimeout(250);
  await expect(list(page)).toHaveAttribute('data-pending', '0');
};
const settled = (page: Page) => expect(list(page)).toHaveAttribute('data-pending', '0');

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

test('SRCH-012 every list request sets pageSize from the interview and the primary filter', async ({ page }) => {
  await generate(page, 300);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  await page.getByTestId('primary-filter-ClosedTasksOnly').click();
  await expect(page.getByTestId('cell-endedAt').first()).toBeVisible();
  await scrollToRow(page, 100);
  await settled(page);
  const requests = (await listRequests(page)).filter((request) => request.path.endsWith('/usertask'));
  expect(requests.length).toBeGreaterThan(2);
  for (const request of requests) expect(request.body.pageSize).toBe(pageSize);
  expect(requests[0]!.body.mode).toBe('OpenTasksWithoutFollowUp');
  expect(requests.at(-1)!.body.mode).toBe('ClosedTasksOnly');
});

test('SRCH-011 every request after the first sends the initialTimestamp of the first answer', async ({ page }) => {
  await generate(page, 400);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  await scrollToRow(page, 150);
  await settled(page);
  await scrollToRow(page, 20);
  const requests = (await listRequests(page)).filter((request) => request.path.endsWith('/usertask'));
  expect(requests.length).toBeGreaterThanOrEqual(3);
  expect(requests[0]!.initialTimestamp).toBeUndefined();
  for (const request of requests.slice(1)) expect(request.initialTimestamp).toBe(requests[0]!.serverTimestamp);
});

test('SRCH-010 the list draws few rows and holds the visible pages plus one ahead each way, far pages are dropped', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await generate(page, 5000);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  await settled(page);
  expect(await windowPages(page)).toEqual([0, 1]);
  // the scroll bar is as long as the whole list
  const height = await scroller(page).evaluate((element) => element.scrollHeight);
  expect(height).toBeGreaterThan(3000 * rowHeight);
  expect(await rows(page).count()).toBeLessThan(40);
  // a step down brings the page ahead at once
  await scrollToRow(page, 25);
  await settled(page);
  expect(await windowPages(page)).toEqual([0, 1, 2]);
  // a jump to the middle drops the pages at the top
  await scrollToRow(page, 2500);
  await settled(page);
  const pages = await windowPages(page);
  expect(pages).not.toContain(0);
  expect(pages).toContain(125);
  expect(pages.length).toBeLessThanOrEqual(5);
  expect(pages.every((number, index) => index === 0 || number === pages[index - 1]! + 1)).toBe(true);
  expect(await windowRows(page)).toBe(pages.length * pageSize);
  await expect(rows(page).first()).toBeVisible();
  expect(await rows(page).count()).toBeLessThan(40);
});

test('SRCH-014 a taller list area holds more rows in its window than a shorter one', async ({ page }) => {
  await generate(page, 3000);
  await page.setViewportSize({ width: 1400, height: 500 });
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  await settled(page);
  const short = await windowRows(page);
  await page.setViewportSize({ width: 1400, height: 1500 });
  await expect.poll(() => windowRows(page)).toBeGreaterThan(short);
  await page.setViewportSize({ width: 1400, height: 500 });
  await scrollToRow(page, 1000);
  await expect.poll(() => windowRows(page)).toBeLessThanOrEqual(short + pageSize);
});

test('I18N-007 counts use the separators of the chosen language and change when the language switches', async ({ page }) => {
  await generate(page, 6000, 3);
  await page.goto('/tasks');
  const open = page.getByTestId('primary-filter-OpenTasksWithFollowUp');
  await expect(open).toHaveText(/\(4,500\)/);
  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-de').click();
  await expect(open).toHaveText(/\(4\.500\)/);
});

test('SRCH-013 after scrolling from top to bottom through 30,000 tasks of four modules, the heap stays below the limit for every primary filter', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1400, height: 1400 });
  await generate(page, 30000, 4);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const heap = async (): Promise<number> => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((metric) => metric.name === 'JSHeapUsedSize')!.value;
  };
  const filters = ['OpenTasksWithoutFollowUp', 'OpenTasksWithFollowUp', 'ClosedTasksOnly'];
  for (const filter of filters) {
    await page.getByTestId(`primary-filter-${filter}`).click();
    await expect(rows(page).first()).toBeVisible();
    // one screen after the other from the top to the end; a screen is read once its rows are there
    const reached = await scroller(page).evaluate(async (element) => {
      const idle = () => new Promise<void>((resolve) => setTimeout(resolve, 25));
      element.scrollTop = 0;
      for (let step = 0; step < 20000 && element.scrollTop + element.clientHeight < element.scrollHeight - 1; step++) {
        element.scrollTop += element.clientHeight - 120;
        await idle();
      }
      return { top: element.scrollTop, client: element.clientHeight, height: element.scrollHeight };
    });
    expect(reached.top + reached.client, JSON.stringify(reached)).toBeGreaterThanOrEqual(reached.height - 1);
    await scrollToRow(page, 0);
    await scrollToRow(page, 3);
    await expect(rows(page).first()).toBeVisible();
    const used = await heap();
    expect(used, `${filter}: heap ${Math.round(used / 1048576)} MB`).toBeLessThan(memoryLimit);
  }
});
