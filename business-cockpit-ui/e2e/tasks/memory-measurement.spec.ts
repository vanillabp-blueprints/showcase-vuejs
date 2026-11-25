import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// SRCH-031: a measurement of a list that anyone can run again with
//   npx playwright test e2e/tasks/memory-measurement.spec.ts
// It writes test-results/memory-measurement.json, one entry per list and step.
// Each value is read after a forced garbage collection. The empty rows are read right away and 3 seconds later.

const lists = [
  { name: 'all tasks', address: '/tasks' },
  { name: 'my tasks', address: '/my-tasks' },
];

type Reading = {
  step: string;
  heapBytes: number;
  domNodes: number;
  eventListeners: number;
  pageRequests: { pageNumber: number }[];
  emptyRowsRightAway: number;
  emptyRowsAfter3Seconds: number;
};

const list = (page: Page) => page.getByTestId('task-list');
const scroller = (page: Page) => list(page).locator('.v-table__wrapper');
const placeholders = (page: Page) => page.getByTestId('task-placeholder');

const requestedPages = async (page: Page, since: number) =>
  ((await (await page.request.get('/simulator-api/list-requests')).json()) as { path: string; body: { pageNumber: number } }[])
    .filter((request) => request.path.endsWith('/usertask'))
    .slice(since)
    .map((request) => ({ pageNumber: request.body.pageNumber }));

const stepThrough = (page: Page, tops: number[], intervalMs: number) =>
  scroller(page).evaluate(async (element, [steps, interval]) => {
    for (const top of steps as number[]) {
      element.scrollTop = top;
      await new Promise((resolve) => setTimeout(resolve, interval as number));
    }
  }, [tops, intervalMs] as const);

test('SRCH-031 every list is measured over slow and fast scrolling, jumps and a visit to another screen', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.request.post('/simulator-api/reset');
  await page.request.post('/simulator-api/generate-user-tasks', { data: { count: 20000, modules: 3 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const results: Record<string, Reading[]> = {};

  for (const { name, address } of lists) {
    const readings: Reading[] = [];
    let requestsSeen = 0;
    const read = async (step: string) => {
      const emptyRowsRightAway = await placeholders(page).count();
      await cdp.send('HeapProfiler.collectGarbage');
      const { metrics } = await cdp.send('Performance.getMetrics');
      const value = (metric: string) => metrics.find((entry) => entry.name === metric)!.value;
      const pageRequests = await requestedPages(page, requestsSeen);
      requestsSeen += pageRequests.length;
      await page.waitForTimeout(3000);
      readings.push({
        step,
        heapBytes: value('JSHeapUsedSize'),
        domNodes: value('Nodes'),
        eventListeners: value('JSEventListeners'),
        pageRequests,
        emptyRowsRightAway,
        emptyRowsAfter3Seconds: await placeholders(page).count(),
      });
    };
    const reach = async () => (await scroller(page).evaluate((element) => element.scrollHeight - element.clientHeight));
    const route = (end: number, steps: number) => Array.from({ length: steps + 1 }, (_, index) => (end * index) / steps);

    await page.goto(address);
    await expect(list(page)).toBeVisible();
    await expect(page.getByTestId('list-loading')).toHaveCount(0);
    await read('opened');
    for (const [label, interval] of [['slowly', 150], ['fast', 15]] as const) {
      const end = await reach();
      const down = route(end, 40);
      await stepThrough(page, [...down, ...[...down].reverse()], interval);
      await read(`${label} to the end and back`);
    }
    for (const share of [0.37, 0.71, 0.12]) {
      await scroller(page).evaluate((element, fraction) => { element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction; }, share);
      await read(`jump to ${Math.round(share * 100)} %`);
    }
    await page.goto('/workflows');
    await page.goto(address);
    await expect(list(page)).toBeVisible();
    await expect(page.getByTestId('list-loading')).toHaveCount(0);
    await read('another screen and back');
    results[name] = readings;
  }

  mkdirSync(resolve(__dirname, '../../test-results'), { recursive: true });
  writeFileSync(resolve(__dirname, '../../test-results/memory-measurement.json'), JSON.stringify(results, null, 2));
  for (const readings of Object.values(results)) {
    expect(readings.map((reading) => reading.step)).toEqual([
      'opened', 'slowly to the end and back', 'fast to the end and back', 'jump to 37 %', 'jump to 71 %', 'jump to 12 %', 'another screen and back',
    ]);
    for (const reading of readings) {
      expect(reading.heapBytes).toBeGreaterThan(0);
      expect(reading.domNodes).toBeGreaterThan(0);
      expect(reading.eventListeners).toBeGreaterThanOrEqual(0);
      expect(reading.emptyRowsAfter3Seconds, reading.step).toBe(0);
    }
  }
});
