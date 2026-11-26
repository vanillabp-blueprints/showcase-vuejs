// DS-018 and DS-019: a part has the same surroundings and the same inherited look in the dev shell as in the cockpit.
import { expect, test, type Page } from '@playwright/test';

const at = '2026-11-20T08:00:00Z';
const task = (id: string, bpmnProcessId: string, title: string) => ({ id, bpmnProcessId, workflowModuleId: 'dev-module', createdAt: at, updatedAt: at, businessId: `B-${id}`, title: { en: title } });
const apps = { vue: 'index.html', react: 'react.html', angular: 'angular.html' } as const;

async function seed(page: Page) {
  await page.request.post('/simulator-api/reset');
  await page.request.post('/bpms/api/v1_1/workflow-module/react-module', { data: { uri: '/bc-manifest.json' } });
  await page.request.post('/simulator-api/user-tasks', { data: { userTasks: [
    task('t1', 'ride', 'First'),
    { ...task('t2', 'areas', 'Second task'), workflowModuleId: 'react-module', uiUriType: 'ES_MODULES', uiUri: '/bc-manifest.json' },
  ] } });
  await page.request.post('/dev-shell/user/anna');
  await page.setViewportSize({ width: 1000, height: 600 });
}

/** The chain from the host element of the area `body` up to <html>, and what the host and its first element in the shadow root inherit. */
const read = (page: Page) => page.locator('[data-area="body"]').evaluate((box) => {
  const host = box.firstElementChild as HTMLElement;
  const chain: string[] = [];
  for (let element: Element | null = host; element; element = element.parentElement ?? (element.getRootNode() as ShadowRoot).host ?? null) {
    const style = getComputedStyle(element);
    const own = element === host ? 'HOST' : element.localName;
    chain.push(`${own} ${style.display} ${style.position} ${style.overflowX}/${style.overflowY}`);
  }
  const root = host.shadowRoot!;
  const first = [...root.children].find((child) => child.localName !== 'style')!;
  const properties = ['font-family', 'font-size', 'line-height', 'color', 'direction', 'font-weight', 'letter-spacing'];
  const theme = ['--bc-color-primary', '--bc-color-text', '--bc-color-surface', '--bc-spacing'];
  // the same colour is written as rgba() or as color(srgb ...); one pixel painted gives the numbers
  const paint = (value: string) => { const context = document.createElement('canvas').getContext('2d')!; context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].join(','); };
  const read = (target: Element, name: string) => name === 'color' ? paint(getComputedStyle(target).color) : getComputedStyle(target).getPropertyValue(name);
  const values = (target: Element) => Object.fromEntries([...properties.map((name) => [name, read(target, name)]), ...theme.map((name) => [name, getComputedStyle(target).getPropertyValue(name)])]);
  const documentRules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule);
  return {
    chain, shadowOpen: host.shadowRoot !== null, styleFirst: [...root.children].some((child) => child.localName === 'style'),
    hostValues: values(host), firstValues: values(first), rulesOnPart: documentRules.filter((rule) => host.matches(rule.selectorText)).map((rule) => rule.selectorText),
  };
});

for (const [framework, file] of Object.entries(apps)) {
  test(`DS-018 [${framework}] every part sits in the same chain of elements as in the cockpit`, async ({ page }) => {
    await seed(page);
    await page.goto('/tasks/t2');
    await expect(page.getByTestId('react-actions')).toBeVisible();
    const cockpit = await read(page);
    await page.goto(`/dev-shell-app/${file}#/tasks/t2`);
    await expect(page.getByTestId('part-actions')).toBeVisible();
    const devShell = await read(page);
    expect(devShell.shadowOpen && devShell.styleFirst).toBe(true);
    expect(cockpit.shadowOpen).toBe(true);
    // the cockpit's own wrappers (Vuetify) are named by their layout only: compare display, position and overflow, from the host up
    expect(devShell.chain).toEqual(cockpit.chain);
  });

  test(`DS-019 [${framework}] the inherited styles and the theme reach a part the same, and no style of the dev shell reaches it`, async ({ page }) => {
    await seed(page);
    await page.goto('/tasks/t2');
    await expect(page.getByTestId('react-actions')).toBeVisible();
    const cockpit = await read(page);
    await page.goto(`/dev-shell-app/${file}#/tasks/t2`);
    await expect(page.getByTestId('part-actions')).toBeVisible();
    const devShell = await read(page);
    expect(devShell.hostValues).toEqual(cockpit.hostValues);
    expect(devShell.firstValues).toEqual(cockpit.firstValues);
    expect(devShell.hostValues['--bc-color-primary']).not.toBe('');
    expect(devShell.rulesOnPart).toEqual([]);
  });
}
