import type { KwicResult, SearchQuery } from '../generated/official-gui-api';

export type Suggestion = KwicResult;

/** Suggestions are asked from three characters on (SRCH-002), 300 milliseconds after the last key. */
export const minimalCharacters = 3;
export const askAfter = 300;

/** The server answers 21 words so that a note can show there are more; the list shows 20, in the order it came (SRCH-003). */
const shownAtMost = 20;
export const shownSuggestions = (answer: Suggestion[]): Suggestion[] => answer.slice(0, shownAtMost);

/** The full-text search is the entry without a path. */
export const fullText = '';

/**
 * One entry per path (SRCH-005): the searches are kept by path, so setting a path again replaces its entry.
 * The text goes as it was typed (SRCH-004), the server takes it as plain text.
 */
export function searchQueriesOf(searches: Record<string, string>): SearchQuery[] {
  return Object.entries(searches)
    .filter(([, query]) => query !== '')
    .map(([path, query]) => ({ ...(path === fullText ? {} : { path }), query, caseInsensitive: true }));
}
