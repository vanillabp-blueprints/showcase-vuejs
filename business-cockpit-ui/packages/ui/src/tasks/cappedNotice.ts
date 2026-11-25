import { formatNumber } from '../i18n/format';
import { language, text } from '../i18n/messages';
import { maxListEntries } from './paging';

/** The sentence that says a list shows only its first entries, in the language of the page. */
export const cappedNotice = (): string => text().cappedNotice.replace('{limit}', formatNumber(maxListEntries, language.value));

/** A count above the limit is a count of a list that shows only its first entries. */
export const isCapped = (count: number | undefined): boolean => count !== undefined && count > maxListEntries;
