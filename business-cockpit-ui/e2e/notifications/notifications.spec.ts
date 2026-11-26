import { expect, test, type Page } from '@playwright/test';

type Request = { method: string; path: string; body?: Record<string, unknown> };

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
  await request.post('/simulator-api/notifications', {
    data: {
      media: [{ type: 'email', name: { en: 'E-mail', de: 'E-Mail' } }, { type: 'chat', name: { en: 'Chat', de: 'Chat' } }],
      workflows: [
        { workflowModuleId: 'invoices', bpmnProcessId: 'invoice', workflowTitle: { en: 'Invoice', de: 'Rechnung' } },
        { workflowModuleId: 'orders', bpmnProcessId: 'order', workflowTitle: { en: 'Order', de: 'Bestellung' } },
      ],
    },
  });
});

const checkbox = (page: Page, testid: string) => page.getByTestId(testid).locator('input');
const requests = async (page: Page): Promise<Request[]> => (await page.request.get('/simulator-api/notification-requests')).json();
const puts = async (page: Page, path: string) => (await requests(page)).filter((one) => one.method === 'PUT' && one.path === path);

test('TF-014 a link of a notification mail opens the task page after a login, with /task/<id> and /aufgabe/<id>', async ({ page }) => {
  // no login yet: the simulator sends the browser to the login first and back to the address it wanted
  for (const link of ['/task/t1', '/aufgabe/t1']) {
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page.getByTestId('task-page')).toBeVisible();
    // the address is the path of the language of the user
    await expect(page).toHaveURL(/\/tasks\/t1$/);
  }
  // the list links of the mail work as well
  await page.goto('/aufgaben');
  await expect(page.getByTestId('task-list')).toBeVisible();
  await page.goto('/tasks');
  await expect(page.getByTestId('task-list')).toBeVisible();
});

test('NOTI-001 a menu entry leads to the notification settings, whose path exists in every language', async ({ page }) => {
  await page.goto('/tasks');
  await page.getByTestId('menu-button').click();
  await page.getByTestId('menu-notifications').click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByTestId('notification-settings')).toBeVisible();
  for (const path of ['/benachrichtigungen', '/notificaciones']) {
    await page.goto(path);
    await expect(page.getByTestId('notification-settings')).toBeVisible();
    await expect(page).toHaveURL(/\/notifications$/);
  }
});

test('NOTI-002 the user chooses for all cases and per kind of case, on which channel, in the language of the user', async ({ page }) => {
  await page.goto('/notifications');
  await expect(page.getByTestId('notification-medium-email')).toHaveText('E-mail');
  await expect(page.getByTestId('notification-medium-chat')).toHaveText('Chat');
  await expect(page.getByTestId('notification-row-invoices#invoice')).toContainText('Invoice');
  await expect(page.getByTestId('notification-row-orders#order')).toContainText('Order');
  // nothing chosen yet: the first row is empty and every kind of case follows it
  await expect(checkbox(page, 'notification-all-email')).not.toBeChecked();
  await expect(checkbox(page, 'notification-cell-orders#order-email')).not.toBeChecked();

  await checkbox(page, 'notification-all-email').check();
  // a row without an entry follows the first row
  await expect(checkbox(page, 'notification-cell-orders#order-email')).toBeChecked();
  await expect(checkbox(page, 'notification-cell-orders#order-chat')).not.toBeChecked();

  // a row of its own overrides it: every channel of the row is written
  await checkbox(page, 'notification-cell-orders#order-chat').check();
  await expect(checkbox(page, 'notification-cell-orders#order-email')).toBeChecked();
  await checkbox(page, 'notification-cell-invoices#invoice-email').uncheck();
  await expect(checkbox(page, 'notification-cell-invoices#invoice-email')).not.toBeChecked();
  // a later change of the first row does not move a row with an entry
  await checkbox(page, 'notification-all-email').uncheck();
  await expect(checkbox(page, 'notification-cell-orders#order-email')).toBeChecked();

  // no notification at all for a kind of case, and back to following the first row
  await checkbox(page, 'notification-none-orders#order').check();
  await expect(checkbox(page, 'notification-cell-orders#order-email')).toBeDisabled();
  await page.getByTestId('notification-follow-orders#order').click();
  await expect(checkbox(page, 'notification-none-orders#order')).not.toBeChecked();
  await expect(checkbox(page, 'notification-cell-orders#order-email')).not.toBeChecked();

  await page.getByTestId('menu-button').click();
  await page.getByTestId('language-de').click();
  await expect(page).toHaveURL(/\/benachrichtigungen$/);
  await expect(page.getByTestId('notification-medium-email')).toHaveText('E-Mail');
  await expect(page.getByTestId('notification-row-invoices#invoice')).toContainText('Rechnung');
});

test('NOTI-003 the settings are stored with PUT and shown again after a reload', async ({ page }) => {
  await page.goto('/notifications');
  await expect(page.getByTestId('notification-settings')).toBeVisible();
  await checkbox(page, 'notification-all-email').check();
  await checkbox(page, 'notification-cell-invoices#invoice-chat').check();
  await checkbox(page, 'notification-none-orders#order').check();
  await expect.poll(async () => (await puts(page, '/notifications/config')).length).toBeGreaterThan(0);
  const stored = (await puts(page, '/notifications/config')).at(-1)!.body;
  // the whole table is stored
  expect(stored).toEqual({
    globalAllViaMedium: { email: true, chat: false },
    perWorkflow: { 'invoices#invoice': { allViaMedium: { email: true, chat: true } }, 'orders#order': { none: true } },
  });

  // where the channel reaches the user
  const address = page.getByTestId('recipient-email-emailAddress').locator('input');
  await expect(page.getByTestId('recipient-email-emailAddress')).toContainText('Address for notifications');
  await address.fill('not an address');
  await page.getByTestId('recipient-save-email').click();
  await expect(page.getByTestId('recipient-error-email-emailAddress')).toHaveText('This is not one mailbox.');
  await address.fill('anna@acme.example');
  await page.getByTestId('recipient-save-email').click();
  await expect(page.getByTestId('recipient-error-email-emailAddress')).toHaveCount(0);
  await expect.poll(async () => (await puts(page, '/notifications/recipient-config/email')).length).toBe(2);
  expect((await puts(page, '/notifications/recipient-config/email')).at(-1)!.body).toEqual({ emailAddress: 'anna@acme.example' });

  await page.reload();
  await expect(checkbox(page, 'notification-all-email')).toBeChecked();
  await expect(checkbox(page, 'notification-all-chat')).not.toBeChecked();
  await expect(checkbox(page, 'notification-cell-invoices#invoice-chat')).toBeChecked();
  await expect(checkbox(page, 'notification-cell-invoices#invoice-email')).toBeChecked();
  await expect(checkbox(page, 'notification-none-orders#order')).toBeChecked();
  await expect(page.getByTestId('recipient-email-emailAddress').locator('input')).toHaveValue('anna@acme.example');
});
