import { updateStreamUrl } from './clients';
import { goToLogin } from '../session/session';

/** The pause before the first new connection after the stream has ended or broken (LIVE-012). Each further failed try doubles it (LIVE-013). */
export const reconnectAfterEndMs = 300;
/** The longest pause between two tries (LIVE-013). */
export const longestPauseMs = 15000;

export interface UpdateStream {
  addEventListener(type: string, listener: (message: Event) => void): void;
  close(): void;
}

/** The pause before try number `failures` + 1: 0.3 seconds, doubled with each failure, at most 15 seconds. */
export const pauseAfter = (failures: number): number => Math.min(reconnectAfterEndMs * 2 ** failures, longestPauseMs);

/** The entries of a server-sent stream, as the browser's `EventSource` would deliver them; a line starting with a colon is a comment. */
function* entriesOf(text: string): Generator<{ type: string; data: string }> {
  for (const block of text.split('\n\n')) {
    let type = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length > 0) yield { type, data: data.join('\n') };
  }
}

/**
 * The update stream, read as a `fetch` stream because the answer to a new connection must show its status: `EventSource` hides it.
 * When the stream ends or breaks the user interface connects again with a growing pause (LIVE-013). When the server answers 401
 * the session has ended, so it stops and sends the browser to the login (LIVE-014).
 */
export function openUpdateStream(): UpdateStream {
  const listeners: [string, (message: Event) => void][] = [];
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let reading: AbortController | undefined;
  let closed = false;
  let failures = 0;

  const deliver = (type: string, data: string): void => {
    for (const [wanted, listener] of listeners) if (wanted === type) listener(new MessageEvent(type, { data }));
  };

  const connect = async (): Promise<void> => {
    reading = new AbortController();
    try {
      const response = await fetch(updateStreamUrl(), { headers: { accept: 'text/event-stream' }, signal: reading.signal });
      if (response.status === 401) {
        closed = true;
        goToLogin();
        return;
      }
      if (!response.ok || !response.body) throw new Error(`update stream answered ${response.status}`);
      failures = 0;
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let rest = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        rest += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        const end = rest.lastIndexOf('\n\n');
        if (end < 0) continue;
        for (const { type, data } of entriesOf(rest.slice(0, end + 2))) deliver(type, data);
        rest = rest.slice(end + 2);
      }
    } catch {
      // a break is answered like an end
    }
    if (closed) return;
    waiting = setTimeout(() => void connect(), pauseAfter(failures++));
  };
  void connect();

  return {
    addEventListener(type, listener) {
      listeners.push([type, listener]);
    },
    close() {
      closed = true;
      clearTimeout(waiting);
      reading?.abort();
    },
  };
}
