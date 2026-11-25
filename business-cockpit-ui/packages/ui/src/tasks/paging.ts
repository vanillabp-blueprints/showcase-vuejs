// Q-PAGE-SIZE: rows per page
export const pageSize = 20;
// every row of the list is this high, so the scroll bar can be sized from the number of entries
export const rowHeight = 46;
// Q-MAX-LIST-ENTRIES: a list shows no more entries than this (Firefox stops at 17.9 million pixels, which is 389,000 rows of this height)
export const maxListEntries = 100_000;
// a scroll that leaves the window waits this long for the scrolling to pause before it loads
export const scrollPauseMs = 100;
// rows drawn above and below the visible ones, so a small scroll shows no gap
export const drawnAround = 3;

export const listLength = (total: number): number => Math.min(total, maxListEntries);

export const pageOf = (index: number): number => Math.floor(index / pageSize);

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, offset) => from + offset);

/** The pages the rows from the first to the last drawn row lie on. */
export const pagesOfRows = (first: number, last: number): number[] => range(pageOf(first), pageOf(last));

/** The window: the pages of the visible rows plus one page ahead above and one below. */
export function windowPages(first: number, last: number, length: number): number[] {
  if (length === 0) return [0];
  const lastPage = pageOf(length - 1);
  return range(Math.max(0, pageOf(first) - 1), Math.min(lastPage, pageOf(last) + 1));
}

/** The rows which lie in the visible part of the scroll area, below the sticky head. */
export function visibleRows(scrollTop: number, areaHeight: number, headHeight: number, length: number): { first: number; last: number } {
  const first = Math.min(Math.floor(scrollTop / rowHeight), Math.max(0, length - 1));
  const last = Math.min(Math.max(first, Math.ceil((scrollTop + areaHeight - headHeight) / rowHeight) - 1), Math.max(0, length - 1));
  return { first, last };
}
