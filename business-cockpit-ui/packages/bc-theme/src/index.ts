import type { ThemeToken } from '@acme/bc-types';

export const lightValues: Record<ThemeToken, string> = {
  '--bc-color-primary': '#1867c0',
  '--bc-color-background': '#ffffff',
  '--bc-color-surface': '#ffffff',
  '--bc-color-text': '#212121',
  '--bc-color-row-new': '#e8f5e9',
  '--bc-color-row-changed': '#fff8e1',
  '--bc-color-row-removed': '#ffebee',
  '--bc-color-row-ended': '#eeeeee',
  '--bc-text-opacity-suspended': '0.6',
  '--bc-font-family': 'Roboto, sans-serif',
  '--bc-spacing': '8px',
};

const darkOverrides: Partial<Record<ThemeToken, string>> = {
  '--bc-color-primary': '#2196f3',
  '--bc-color-background': '#121212',
  '--bc-color-surface': '#212121',
  '--bc-color-text': '#ffffff',
  '--bc-color-row-new': '#1b3a1f',
  '--bc-color-row-changed': '#3a3216',
  '--bc-color-row-removed': '#3d1d22',
  '--bc-color-row-ended': '#2c2c2c',
};

/** The values by the name of the custom property, for code which needs them. */
export const themeValues = lightValues;

const declarations = (values: Partial<Record<ThemeToken, string>>): string =>
  Object.entries(values).map(([name, value]) => `  ${name}: ${value};`).join('\n');

/** The style sheet: the custom properties on the root, dark mode with the operating system, the base styles. */
export function themeCss(): string {
  return [
    `:root {\n${declarations(lightValues)}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root {\n${declarations(darkOverrides).replace(/^/gm, '  ')}\n  }\n}`,
    'html, body {\n  margin: 0;\n  font-family: var(--bc-font-family);\n  color: var(--bc-color-text);\n  background: var(--bc-color-background);\n}',
  ].join('\n');
}

/** Puts the theme on a page; the user interface and every dev shell call it once. */
export function installTheme(target: Document = document): void {
  const style = target.createElement('style');
  style.dataset.bcTheme = '';
  style.textContent = themeCss();
  target.head.append(style);
}
