import { ref } from 'vue';
import { replaceAddressWithLanguage } from './routing';
import { settingKey, settings } from './settings/settings';
import { defaultLanguage, language, languages, type Language } from './i18n/messages';

const languageSetting = settingKey('language');

/** The languages the menu offers: those app/info names. */
export const offered = ref<Language[]>([defaultLanguage]);

const isLanguage = (value: unknown): value is Language => languages.some((code) => code === value);

/**
 * `languages` of `additionalProperties` of app/info is one string with commas (Q-LANGUAGES). Without it only the
 * default language is offered. The language of the user comes from their settings, so it holds in every browser.
 */
export async function startLanguage(named: string | undefined): Promise<void> {
  const names = (named ?? '').split(',').map((code) => code.trim()).filter(isLanguage);
  offered.value = names.length > 0 ? names : [defaultLanguage];
  const chosen = await settings.read(languageSetting);
  language.value = isLanguage(chosen) && offered.value.includes(chosen) ? chosen : offered.value[0]!;
  replaceAddressWithLanguage(language.value);
}

/** The choice of the user: kept in their settings, and the address follows it. */
export function switchTo(code: Language): void {
  language.value = code;
  settings.write(languageSetting, code);
  replaceAddressWithLanguage(code);
}
