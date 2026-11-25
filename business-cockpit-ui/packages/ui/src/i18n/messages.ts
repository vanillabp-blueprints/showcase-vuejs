import { ref } from 'vue';
import de from './de';
import en, { type Messages } from './en';
import es from './es';
import fr from './fr';

export const languages = ['en', 'de', 'fr', 'es'] as const;
export type Language = (typeof languages)[number];

// English is the default language (Q-LANGUAGE-DEFAULT).
export const defaultLanguage: Language = 'en';

const messages: Record<Language, Messages> = { en, de, fr, es };

export const language = ref<Language>(defaultLanguage);

export const text = (): Messages => messages[language.value];

export const messagesOf = (code: Language): Messages => messages[code];
