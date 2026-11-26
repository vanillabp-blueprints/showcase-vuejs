import { expect, test, type Page } from '@playwright/test';

type Hierarchy = { givenByOrganisation: string[]; modules: { workflowModuleId: string; entries: { group: string; givenByOrganisation: boolean; targets: string[] }[] }[] };

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

const answer = async (page: Page, hierarchy: Hierarchy, more: { fails?: boolean; delayMilliseconds?: number } = {}) => {
  await page.request.post('/simulator-api/group-hierarchy', { data: { answer: hierarchy, ...more } });
};
const asked = async (page: Page): Promise<number> => (await page.request.get('/simulator-api/group-hierarchy-requests')).json();
const hover = async (page: Page) => page.getByTestId('current-user').hover();
const rowsOf = (page: Page, module: string) =>
  page.locator(`[data-testid="rights-table-${module}"] tbody tr`).evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim()).join('|')));

// the example of the reference, for a user the organisation gives AccountManagement and Auditor
const example: Hierarchy = {
  givenByOrganisation: ['AccountManagement', 'Auditor'],
  modules: [
    { workflowModuleId: 'invoices', entries: [{ group: 'AccountManagement', givenByOrganisation: true, targets: ['Invoices.Edit', 'User'] }, { group: 'User', givenByOrganisation: false, targets: ['Invoices.Read'] }] },
    { workflowModuleId: 'orders', entries: [{ group: 'AccountManagement', givenByOrganisation: true, targets: ['Orders.Cancel', 'User'] }, { group: 'User', givenByOrganisation: false, targets: ['Orders.View'] }] },
  ],
};

test('NAV-019 the overview opens on the first mouse-over of the name, asks once, shows Loading, can be entered, is limited in height and closes when the mouse leaves both', async ({ page }) => {
  const many: Hierarchy = { givenByOrganisation: ['Boss'], modules: [{ workflowModuleId: 'orders', entries: [{ group: 'Boss', givenByOrganisation: true, targets: Array.from({ length: 80 }, (_, i) => `Orders.Right${String(i).padStart(2, '0')}`) }] }] };
  await answer(page, many, { delayMilliseconds: 800 });
  await page.goto('/');
  await expect(page.getByTestId('current-user')).toBeVisible();
  expect(await asked(page)).toBe(0);
  await expect(page.getByTestId('rights-overview')).toHaveCount(0);

  await hover(page);
  await expect(page.getByTestId('rights-loading')).toHaveText('Loading …');
  const overview = page.getByTestId('rights-overview');
  await expect(page.getByTestId('rights-table-orders')).toBeVisible();
  await expect(page.getByTestId('rights-loading')).toHaveCount(0);

  // below the name, aligned to its right edge, at most two thirds of the window high and scrolling inside
  const name = (await page.getByTestId('current-user').boundingBox())!;
  const box = (await overview.boundingBox())!;
  expect(Math.abs(box.x + box.width - (name.x + name.width))).toBeLessThanOrEqual(2);
  expect(box.y).toBeGreaterThanOrEqual(name.y + name.height - 2);
  const windowHeight = page.viewportSize()!.height;
  expect(box.height).toBeLessThanOrEqual(windowHeight * 0.67);
  expect(await overview.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  // the mouse can move into it, it stays, and it closes when the mouse leaves both
  await overview.hover();
  await page.waitForTimeout(300);
  await expect(overview).toBeVisible();
  await page.mouse.move(5, windowHeight - 5);
  await expect(overview).toHaveCount(0);

  // kept until the page is loaded again
  await hover(page);
  await expect(overview).toBeVisible();
  expect(await asked(page)).toBe(1);
  await page.reload();
  await hover(page);
  await expect(page.getByTestId('rights-table-orders')).toBeVisible();
  expect(await asked(page)).toBe(2);
});

test('NAV-020 each module with a hierarchy has a table of name, kind and given by, an organisation group shows Organisation and every other row the group of its entry', async ({ page }) => {
  await answer(page, example);
  await page.goto('/');
  await hover(page);
  const overview = page.getByTestId('rights-overview');
  await expect(overview.getByTestId('rights-module-orders').getByRole('heading')).toHaveText('orders');
  await expect(overview.getByTestId('rights-module-invoices').getByRole('heading')).toHaveText('invoices');
  await expect(page.locator('[data-testid="rights-table-orders"] thead th')).toHaveText(['Name', 'Kind', 'Given by']);
  expect(await rowsOf(page, 'orders')).toEqual([
    'AccountManagement|Role|Organisation',
    'Auditor|Role|Organisation',
    'User|Role|AccountManagement',
    'Orders.Cancel|Right|AccountManagement',
    'Orders.View|Right|User',
  ]);
  await expect(page.getByTestId('rights-title')).toHaveText('Roles and rights');
  await expect(page.getByTestId('rights-sentence')).toHaveText('The organisation gives you roles. Rights decide what you may do in an application. Each application defines its own rights and derives them from your roles.');
});

test('NAV-021 a target is Role with an entry of its own else Right, one the organisation also gives shows once, roles come before rights, each in alphabetical order', async ({ page }) => {
  await answer(page, {
    givenByOrganisation: ['Zeta', 'Alpha'],
    modules: [{ workflowModuleId: 'm', entries: [
      { group: 'Zeta', givenByOrganisation: true, targets: ['Alpha', 'b.right', 'Mid', 'a.right'] },
      { group: 'Mid', givenByOrganisation: false, targets: ['c.right'] },
      { group: 'Alpha', givenByOrganisation: true, targets: ['a.right'] },
    ] }],
  });
  await page.goto('/');
  await hover(page);
  expect(await rowsOf(page, 'm')).toEqual([
    'Alpha|Role|Organisation',
    'Mid|Role|Zeta',
    'Zeta|Role|Organisation',
    'a.right|Right|Alpha',
    'a.right|Right|Zeta',
    'b.right|Right|Zeta',
    'c.right|Right|Mid',
  ]);
});

test('NAV-022 the overview shows only the own rights of modules with a hierarchy, a failed request or no module left says that nothing is known', async ({ page }) => {
  await answer(page, { givenByOrganisation: [], modules: [] }, {});
  await page.goto('/');
  await hover(page);
  await expect(page.getByTestId('rights-none')).toHaveText('No roles or rights are known.');
  await expect(page.locator('[data-testid^="rights-module-"]')).toHaveCount(0);

  // a module whose hierarchy has no entry for the user and gives nothing is left out
  await answer(page, { givenByOrganisation: [], modules: [{ workflowModuleId: 'quiet', entries: [] }, { workflowModuleId: 'orders', entries: [{ group: 'Boss', givenByOrganisation: true, targets: ['X'] }] }] });
  await page.reload();
  await hover(page);
  await expect(page.getByTestId('rights-module-orders')).toBeVisible();
  await expect(page.getByTestId('rights-module-quiet')).toHaveCount(0);

  await answer(page, example, { fails: true });
  await page.reload();
  await hover(page);
  await expect(page.getByTestId('rights-none')).toHaveText('No roles or rights are known.');
  await expect(page.getByTestId('rights-loading')).toHaveCount(0);
});

test('NAV-027 the head of the overview shows the badge of the user as the top of the menu does', async ({ page }) => {
  await answer(page, example);
  await page.goto('/');
  await hover(page);
  const badge = page.getByTestId('rights-overview').getByTestId('rights-badge');
  await expect(badge).toHaveText('AS');
  const look = (locator: ReturnType<Page['getByTestId']>) => locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.width, style.height, style.borderRadius];
  });
  const inOverview = await look(badge);
  await page.mouse.move(5, 5);
  await page.getByTestId('menu-button').click();
  const inMenu = await look(page.getByTestId('user-badge'));
  await expect(page.getByTestId('user-badge')).toHaveText('AS');
  expect(inOverview).toEqual(inMenu);
});

test('NAV-030 a target from two groups has a row for each, a group of the hierarchy of one module has its own row only in that module, names stay as they are and the texts are translated', async ({ page }) => {
  await answer(page, {
    givenByOrganisation: ['AccountManagement', 'Auditor'],
    modules: [
      { workflowModuleId: 'invoices', entries: [{ group: 'AccountManagement', givenByOrganisation: true, targets: ['Invoices.Edit'] }, { group: 'Billing', givenByOrganisation: false, targets: ['Invoices.Read'] }] },
      { workflowModuleId: 'orders', entries: [{ group: 'AccountManagement', givenByOrganisation: true, targets: ['Billing', 'Orders.Cancel', 'Shared'] }, { group: 'Billing', givenByOrganisation: false, targets: ['Orders.View', 'Shared'] }] },
    ],
  });
  await page.goto('/');
  await hover(page);
  expect(await rowsOf(page, 'orders')).toEqual([
    'AccountManagement|Role|Organisation',
    'Auditor|Role|Organisation',
    'Billing|Role|AccountManagement',
    'Orders.Cancel|Right|AccountManagement',
    'Orders.View|Right|Billing',
    'Shared|Right|AccountManagement',
    'Shared|Right|Billing',
  ]);
  expect(await rowsOf(page, 'invoices')).toEqual([
    'AccountManagement|Role|Organisation',
    'Auditor|Role|Organisation',
    'Invoices.Edit|Right|AccountManagement',
    'Invoices.Read|Right|Billing',
  ]);

  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-de').click();
  await page.goto('/aufgaben');
  await hover(page);
  await expect(page.getByTestId('rights-title')).toHaveText('Rollen und Rechte');
  await expect(page.locator('[data-testid="rights-table-orders"] thead th')).toHaveText(['Name', 'Art', 'Vergeben durch']);
  expect((await rowsOf(page, 'orders'))[0]).toBe('AccountManagement|Rolle|Organisation');
  expect((await rowsOf(page, 'orders'))[3]).toBe('Orders.Cancel|Recht|AccountManagement');
});
