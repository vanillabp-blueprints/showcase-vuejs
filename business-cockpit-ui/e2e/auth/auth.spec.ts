import { expect, test, type APIRequestContext } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const loginPath = '/oauth2/authorization/keycloak';

const sources = (folder: string): string[] =>
  readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (name === 'generated') return [];
    return statSync(path).isDirectory() ? sources(path) : [path];
  });

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

test('AUTH-002 an answer of current-user without a body sends the browser to the login of the backend', async ({ page, request }) => {
  // the answer the page gets: 200 and no body
  const empty = await request.get('/gui/api/v1/app/current-user');
  expect(empty.status()).toBe(200);
  expect(await empty.text()).toBe('');
  // the page is served without a check here, as when something in front of it served it already
  await request.post('/simulator-api/protect-pages', { data: { on: false } });
  const answer = page.waitForResponse((response) => response.url().endsWith('/gui/api/v1/app/current-user'));
  const login = page.waitForRequest((request) => new URL(request.url()).pathname === loginPath);
  await page.goto('/');
  const current = await answer;
  expect(current.status()).toBe(200);
  await login;
});

test('AUTH-003 after the login the user interface shows the user from current-user', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('current-user')).toHaveText('Anna Sales');
  await expect(page.getByTestId('logout')).toHaveAttribute('href', '/logout');
});

test('AUTH-004 a 401 on a later request sends the browser to the login and shows no error page', async ({ page, request }) => {
  await page.goto('/nowhere'); // a path with no list, the start page opens my tasks
  await expect(page.getByTestId('current-user')).toHaveText('Anna Sales');
  await request.post('/simulator-api/expire-sessions');
  const login = page.waitForRequest((r) => new URL(r.url()).pathname === loginPath);
  const status = await page.evaluate(async () => (await fetch('/gui/api/v1/usertasks')).status);
  expect(status).toBe(401);
  await login;
  // the login brings the browser back to the screen it was on
  await expect(page.getByTestId('current-user')).toHaveText('Anna Sales');
  await expect(page.getByTestId('error')).toHaveCount(0);
});

test('AUTH-005 the user interface has no login form, no user management and no rights check of its own', async ({ page }) => {
  await page.goto('/nowhere'); // a path with no list, the start page opens my tasks
  await expect(page.getByTestId('current-user')).toBeVisible();
  await expect(page.locator('input, form, [type=password]')).toHaveCount(0);
  for (const file of sources('packages/ui/src')) {
    const text = readFileSync(file, 'utf8');
    expect(text, file).not.toMatch(/type=["']password|<form|v-text-field|isAdmin|hasRole|hasRight/i);
  }
});

const state = async (request: APIRequestContext) => (await request.get('/simulator-api/state')).json();

test('AUTH-006 the user interface makes no request in the background only to stay logged in', async ({ page }) => {
  await page.goto('/nowhere'); // the start page opens my tasks, whose list loads after the header shows
  await expect(page.getByTestId('current-user')).toHaveText('Anna Sales');
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.waitForTimeout(2500);
  expect(requests).toEqual([]);
  for (const file of sources('packages/ui/src')) {
    expect(readFileSync(file, 'utf8'), file).not.toMatch(/setInterval|keep-?alive|heartbeat/i);
  }
});

test('AUTH-008 the groups come from current-user, not from the token', async ({ page, request }) => {
  await request.post('/simulator-api/groups', { data: { groups: ['from-current-user'] } });
  await page.goto('/');
  await expect(page.getByTestId('groups')).toHaveText('from-current-user');
  // the token in the cookie names the group sales, and the user interface does not read it
  const cookie = (await page.context().cookies()).find((c) => c.name === 'bc');
  expect(Buffer.from(cookie!.value.split('.')[1], 'base64url').toString()).toContain('sales');
  for (const file of sources('packages/ui/src')) {
    expect(readFileSync(file, 'utf8'), file).not.toMatch(/document\.cookie|atob\(|jwt/i);
  }
});

test('AUTH-009 a browser without a login gets the login before index.html and before a deep link', async ({ page, request }) => {
  for (const address of ['/', '/tasks/42']) {
    const answer = await request.get(address, { maxRedirects: 0 });
    expect(answer.status()).toBe(302);
    expect(new URL(answer.headers().location, 'http://x').pathname).toBe(loginPath);
    expect(await answer.text()).not.toContain('<div id="app">');
  }
  // the files of the bundle stay open
  const bundle = /src="([^"]+\.js)"/.exec(readFileSync('packages/ui/dist/index.html', 'utf8'))![1];
  const asset = await request.get(bundle, { maxRedirects: 0 });
  expect(asset.status()).not.toBe(302);
  await page.goto('/tasks/42');
  await expect(page.getByTestId('current-user')).toHaveText('Anna Sales');
  expect(new URL(page.url()).pathname).toBe('/tasks/42');
});

test('AUTH-010 after a 401 the user interface loads its current address again and the user is back on the same screen', async ({ page, request }) => {
  await page.goto('/tasks/42?tab=open');
  await expect(page.getByTestId('current-user')).toHaveText('Anna Sales');
  await request.post('/simulator-api/expire-sessions');
  const document = page.waitForRequest((r) => r.isNavigationRequest() && new URL(r.url()).pathname === '/tasks/42');
  await page.evaluate(() => fetch('/gui/api/v1/usertasks'));
  await document;
  await expect(page.getByTestId('current-user')).toHaveText('Anna Sales');
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/tasks/42?tab=open');
});

test('AUTH-007 /logout ends the session at the provider as well and the start page asks for a new login', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByTestId('current-user')).toHaveText('Anna Sales');
  expect((await state(request)).loginPrompts).toBe(1);
  await page.getByTestId('menu-button').click();
  await page.getByTestId('logout').click();
  await page.waitForURL((url) => url.pathname === '/');
  const afterLogout = await state(request);
  expect(afterLogout.endSessions).toHaveLength(1);
  const end = afterLogout.endSessions[0];
  expect(end.id_token_hint).toBeTruthy();
  expect(end.client_id).toBe('business-cockpit');
  expect(end.post_logout_redirect_uri).toMatch(/\/$/);
  // the start page has no login any more, so the provider is asked again (a silent login would not count)
  await expect(page.getByTestId('current-user')).toHaveText('Anna Sales');
  expect((await state(request)).loginPrompts).toBe(2);
  // a reload now keeps the new login
  await page.reload();
  await expect(page.getByTestId('current-user')).toHaveText('Anna Sales');
  expect((await state(request)).loginPrompts).toBe(2);
});
