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

// ---- S27: smooth scrolling, memory over scrolling and over visits, jumps, drags ----

const placeholders = (page: Page) => page.getByTestId('task-placeholder');
const settledList = async (page: Page) => {
  await page.waitForTimeout(250);
  await expect(list(page)).toHaveAttribute('data-pending', '0');
};
// heap and DOM nodes, each read after a forced garbage collection
const measureMemory = async (page: Page): Promise<{ heap: number; nodes: number }> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  await cdp.detach();
  const value = (name: string) => metrics.find((metric) => metric.name === name)!.value;
  return { heap: value('JSHeapUsedSize'), nodes: value('Nodes') };
};
const within10Percent = (value: number, base: number) => Math.abs(value - base) <= base * 0.1;
// moves the scroll bar by the given steps, one step per interval; the list is asked for pages after the pause
const dragThrough = (page: Page, tops: number[], intervalMs: number) =>
  scroller(page).evaluate(async (element, [steps, interval]) => {
    for (const top of steps as number[]) {
      element.scrollTop = top;
      await new Promise((resolve) => setTimeout(resolve, interval as number));
    }
  }, [tops, intervalMs] as const);
const scrollHeightOf = (page: Page) => scroller(page).evaluate((element) => element.scrollHeight - element.clientHeight);

test('SRCH-015 scrolling up and down with small steps shows no empty row while pages load', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await generate(page, 3000);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  await settledList(page);
  await scroller(page).evaluate(() => {
    (window as unknown as { empties: number }).empties = 0;
    const watch = () => {
      (window as unknown as { empties: number }).empties += document.querySelectorAll('[data-testid="task-placeholder"]').length > 0 ? 1 : 0;
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  // a wheel turn is about 100 px; the user turns it a few times a second, down and then up
  for (let turn = 0; turn < 150; turn++) { await page.mouse.move(700, 500); await page.mouse.wheel(0, 100); await page.waitForTimeout(40); }
  for (let turn = 0; turn < 100; turn++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(40); }
  expect(await page.evaluate(() => (window as unknown as { empties: number }).empties)).toBe(0);
});

test('SRCH-016 a wheel scroll of ten seconds through 30,000 tasks has few long frames and no placeholder; after a fast drag every placeholder is filled soon', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await generate(page, 30000, 4);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  await settledList(page);
  await page.evaluate(() => {
    const state = { empties: 0, longFrames: 0 };
    (window as unknown as { smooth: typeof state }).smooth = state;
    new PerformanceObserver((entries) => { state.longFrames += entries.getEntries().length; }).observe({ type: 'longtask', buffered: false });
    const watch = () => {
      state.empties += document.querySelectorAll('[data-testid="task-placeholder"]').length > 0 ? 1 : 0;
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await page.mouse.move(700, 500);
  const until = Date.now() + 10_000;
  while (Date.now() < until) { await page.mouse.wheel(0, 100); await page.waitForTimeout(40); }
  const { empties, longFrames } = await page.evaluate(() => (window as unknown as { smooth: { empties: number; longFrames: number } }).smooth);
  expect(longFrames, 'frames longer than 50 ms').toBeLessThanOrEqual(5);
  expect(empties, 'frames with a placeholder').toBe(0);
  // a fast drag to the middle fills every placeholder once the scrolling has stopped
  await dragThrough(page, [0.1, 0.3, 0.5, 0.52].map((part) => part * 30000 * rowHeight), 15);
  await expect(placeholders(page)).toHaveCount(0, { timeout: 3000 });
});

test('SRCH-017 scrolling the whole list down and up three times keeps heap and DOM nodes within 10 % of the first time', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await generate(page, 6000, 3);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  const readings: { heap: number; nodes: number }[] = [];
  // slowly, fast, slowly: the pause between two steps in milliseconds
  for (const interval of [150, 15, 150]) {
    const end = await scrollHeightOf(page);
    const down = Array.from({ length: 41 }, (_, index) => (end * index) / 40);
    await dragThrough(page, [...down, ...[...down].reverse()], interval);
    await scrollToRow(page, 0);
    readings.push(await measureMemory(page));
  }
  for (const reading of readings.slice(1)) {
    expect(within10Percent(reading.heap, readings[0]!.heap), `heap ${JSON.stringify(readings)}`).toBe(true);
    expect(within10Percent(reading.nodes, readings[0]!.nodes), `nodes ${JSON.stringify(readings)}`).toBe(true);
  }
});

test('SRCH-018 opening and leaving the list a second time brings heap and DOM nodes back to within 10 % of the first leaving', async ({ page }) => {
  test.setTimeout(120_000);
  await generate(page, 6000, 3);
  const visit = async () => {
    await page.goto('/tasks');
    await expect(rows(page).first()).toBeVisible();
    await scrollToRow(page, 500);
    await scrollToRow(page, 0);
    await page.goto('/cases');
    await expect(page.getByTestId('header')).toBeVisible();
    await page.waitForTimeout(300);
    return measureMemory(page);
  };
  const first = await visit();
  const second = await visit();
  expect(within10Percent(second.heap, first.heap), JSON.stringify({ first, second })).toBe(true);
  expect(within10Percent(second.nodes, first.nodes), JSON.stringify({ first, second })).toBe(true);
});

test('SRCH-019 after jumps to 37 %, 71 % and 12 % of the scroll bar every visible row shows its data within 3 seconds', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await generate(page, 30000, 4);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  for (const part of [0.37, 0.71, 0.12]) {
    const end = await scrollHeightOf(page);
    await scroller(page).evaluate((element, top) => { element.scrollTop = top; }, end * part);
    await expect(placeholders(page)).toHaveCount(0, { timeout: 3000 });
    await expect(rows(page).first()).toBeVisible();
    expect(await rows(page).count()).toBeGreaterThan(10);
  }
});

test('SRCH-020 a fast drag of the scroll bar from top to bottom asks only for the pages of the window where it stops', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await generate(page, 30000, 4);
  await page.goto('/tasks');
  await expect(rows(page).first()).toBeVisible();
  await settledList(page);
  const before = (await listRequests(page)).filter((request) => request.path.endsWith('/usertask')).length;
  const end = await scrollHeightOf(page);
  await dragThrough(page, Array.from({ length: 60 }, (_, index) => (end * (index + 1)) / 60), 8);
  await settledList(page);
  const asked = (await listRequests(page)).filter((request) => request.path.endsWith('/usertask')).slice(before).map((request) => request.body.pageNumber!);
  const held = await windowPages(page);
  expect(held.length).toBeGreaterThan(0);
  for (const number of asked) expect(held, `asked ${asked.join(',')}`).toContain(number);
});
