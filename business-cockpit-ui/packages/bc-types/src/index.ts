export * from './generated/index.js';

// One constant for each entry of ui-uri-types.json; the types jar is generated from that file.
export const UI_URI_TYPE_ES_MODULES = 'ES_MODULES';
export const UI_URI_TYPE_EXTERNAL = 'EXTERNAL';

/** The CSS custom properties the theme sets on the root. A module part may use them in its shadow DOM. */
export const THEME_TOKENS = [
  '--bc-color-primary',
  '--bc-color-background',
  '--bc-color-surface',
  '--bc-color-text',
  '--bc-color-row-new',
  '--bc-color-row-changed',
  '--bc-color-row-removed',
  '--bc-color-row-ended',
  '--bc-text-opacity-suspended',
  '--bc-font-family',
  '--bc-spacing',
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
