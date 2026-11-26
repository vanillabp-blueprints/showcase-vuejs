import { updateStreamUrl } from './clients';

/** How long the user interface waits before it connects again after the server has ended the stream (LIVE-012). */
export const reconnectAfterEndMs = 300;

export interface UpdateStream {
  addEventListener(type: string, listener: (message: Event) => void): void;
  close(): void;
}

/**
 * The update stream. The browser connects again by itself only after seconds, so when the stream ends or breaks
 * the user interface closes it and connects again at once, with the listeners it has.
 */
export function openUpdateStream(): UpdateStream {
  const listeners: [string, (message: Event) => void][] = [];
  let source: EventSource | undefined;
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const connect = (): void => {
    source = new EventSource(updateStreamUrl());
    for (const [type, listener] of listeners) source.addEventListener(type, listener);
    source.addEventListener('error', () => {
      if (closed) return;
      source?.close();
      waiting = setTimeout(connect, reconnectAfterEndMs);
    });
  };
  connect();
  return {
    addEventListener(type, listener) {
      listeners.push([type, listener]);
      source?.addEventListener(type, listener);
    },
    close() {
      closed = true;
      clearTimeout(waiting);
      source?.close();
    },
  };
}
