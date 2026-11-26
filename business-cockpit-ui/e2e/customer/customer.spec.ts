// CUST-001: the customer's wish, the language switch and the word for a case (Q-WORDING, Q-LANGUAGES).
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/simulator-api/reset'); });

const wording = [
  { code: 'en', word: 'Cases', none: 'No cases', path: '/workflows' },
  { code: 'de', word: 'Vorgänge', none: 'Keine Vorgänge', path: '/vorgaenge' },
  { code: 'fr', word: 'Dossiers', none: 'Aucun dossier', path: '/dossiers' },
  { code: 'es', word: 'Casos', none: 'Sin casos', path: '/casos' },
];

test('CUST-001 the user can switch between English, German, French and Spanish and a case is called Case, Vorgang, Dossier and Caso', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('menu-button').click();
  const offered = await page.locator('[data-testid^="language-"]').evaluateAll((all) => all.map((one) => one.getAttribute('data-testid')));
  expect(offered).toEqual(['language-en', 'language-de', 'language-fr', 'language-es']);
  for (const { code, word, none, path } of wording) {
    await page.goto('/');
    await page.getByTestId('menu-button').click();
    await page.getByTestId(`language-${code}`).click();
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    await expect(page.getByTestId('menu-cases')).toHaveText(word);
    await page.goto(path);
    await expect(page.getByTestId('case-list')).toBeVisible();
    await expect(page.getByTestId('toggle-cases')).toContainText(word);
    await expect(page.getByText(none)).toBeVisible();
  }
});
