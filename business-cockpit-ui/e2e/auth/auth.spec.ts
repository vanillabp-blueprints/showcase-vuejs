import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const loginPath = '/oauth2/authorization/keycloak';

test.beforeEach(async ({ request }) => {
  await request.post('/simulator-api/reset');
});

test('AUTH-002 an answer of current-user without a body sends the browser to the login of the backend', async ({ page, request }) => {
  // the answer the page gets: 200 and no body
  const empty = await request.get('/gui/api/v1/app/current-user');
  expect(empty.status()).toBe(200);
  expect(await empty.text()).toBe('');
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
  await page.goto('/');
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
  await page.goto('/');
  await expect(page.getByTestId('current-user')).toBeVisible();
  await expect(page.locator('input, form, [type=password]')).toHaveCount(0);
  const sources = (folder: string): string[] =>
    readdirSync(folder).flatMap((name) => {
      const path = join(folder, name);
      if (name === 'generated') return [];
      return statSync(path).isDirectory() ? sources(path) : [path];
    });
  for (const file of sources('packages/ui/src')) {
    const text = readFileSync(file, 'utf8');
    expect(text, file).not.toMatch(/type=["']password|<form|v-text-field|isAdmin|hasRole|hasRight/i);
  }
});
