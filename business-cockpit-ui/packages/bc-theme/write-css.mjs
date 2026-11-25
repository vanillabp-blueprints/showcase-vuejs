// Writes dist/theme.css from the compiled theme, for a page which links a style sheet.
import { writeFileSync } from 'node:fs';
import { themeCss } from './dist/index.js';

writeFileSync(new URL('./dist/theme.css', import.meta.url), `${themeCss()}\n`);
