// A text per language, as a module or the backend delivers it.
export type Translatable = Partial<Record<string, string>>;

const defaultLanguage = 'en';

// One rule everywhere (headers, cells, titles): the chosen language, then the default language,
// then the first language there is with a text.
export function pickTranslation(translatable: Translatable, language: string): string {
  const filled = Object.values(translatable).filter((value): value is string => !!value);
  return translatable[language] || translatable[defaultLanguage] || filled[0] || '';
}
