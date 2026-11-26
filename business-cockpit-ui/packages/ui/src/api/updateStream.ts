import { updateStreamUrl } from './clients';
import { goToLogin } from '../session/session';
import { client as cockpitClient } from '../generated/cockpit-gui-api/client.gen';
import { client as officialClient } from '../generated/official-gui-api/client.gen';

/** The pause before the first new connection after the stream has ended or broken (LIVE-012). Each further failed try doubles it (LIVE-013). */
export const reconnectAfterEndMs = 300;
/** The longest pause between two tries (LIVE-013). */
export const longestPauseMs = 15000;

export interface UpdateStream {
  addEventListener(type: string, listener: (message: Event) => void): void;
  close(): void;
  /** The number of the connection which is open now, 0 while none is open. A list notes it when its first request goes out (LIVE-024). */
  openConnection(): number;
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

const firstReloads = new WeakMap<Event, number>();

/** The number of the connection whose first `RELOAD` this delivery is, `undefined` for every other delivery (LIVE-024). */
export const firstReloadOf = (message: Event): number | undefined => firstReloads.get(message);

const isReload = (data: string): boolean => {
  try {
    const entries = JSON.parse(data) as { event?: { type?: string } }[];
    return entries.length > 0 && entries.every(({ event }) => event?.type === 'RELOAD');
  } catch {
    return false;
  }
};

interface Connection {
  listeners: [owner: object, type: string, listener: (message: Event) => void][];
  users: number;
  connectNow(): void;
  openConnection(): number;
  stop(): void;
}

/**
 * The one connection of the tab. It is read as a `fetch` stream because the answer to a new connection must show its status:
 * `EventSource` hides it. When the stream ends or breaks it connects again with a growing pause (LIVE-013). When the server
 * answers 401 the session has ended, so it stops and sends the browser to the login (LIVE-014).
 */
function connectToUpdates(): Connection {
  const listeners: Connection['listeners'] = [];
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let reading: AbortController | undefined;
  let closed = false;
  let failures = 0;
  let connections = 0;
  let open = false;
  // the kinds of event whose first RELOAD of this connection came
  const reloadSeen = new Set<string>();

  const deliver = (type: string, data: string): void => {
    const message = new MessageEvent(type, { data });
    if (!reloadSeen.has(type) && isReload(data)) {
      reloadSeen.add(type);
      firstReloads.set(message, connections);
    }
    for (const [, wanted, listener] of [...listeners]) if (wanted === type) listener(message);
  };

  const connect = async (): Promise<void> => {
    waiting = undefined;
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
      connections++;
      open = true;
      reloadSeen.clear();
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
    open = false;
    if (closed) return;
    waiting = setTimeout(() => void connect(), pauseAfter(failures++));
  };
  void connect();

  return {
    listeners,
    users: 0,
    // a stream which waits for its next try does not make the user wait for it (LIVE-022)
    connectNow() {
      if (waiting === undefined) return;
      clearTimeout(waiting);
      void connect();
    },
    openConnection: () => (open ? connections : 0),
    stop() {
      closed = true;
      clearTimeout(waiting);
      reading?.abort();
    },
  };
}

let connection: Connection | undefined;

/** Before every ordinary request of the generated clients a waiting stream connects at once (LIVE-022). */
const connectBeforeRequests = (): void => {
  for (const client of [officialClient, cockpitClient]) {
    client.interceptors.request.use((request) => {
      connection?.connectNow();
      return request;
    });
  }
};
let intercepting = false;

/**
 * A listener of the update stream of this tab. A tab opens one connection, however many lists and pages listen (LIVE-023);
 * it closes with the last listener.
 */
export function openUpdateStream(): UpdateStream {
  if (!intercepting) {
    connectBeforeRequests();
    intercepting = true;
  }
  const shared = (connection ??= connectToUpdates());
  shared.users++;
  const owner = {};
  return {
    addEventListener(type, listener) {
      shared.listeners.push([owner, type, listener]);
    },
    close() {
      for (let index = shared.listeners.length - 1; index >= 0; index--) if (shared.listeners[index]![0] === owner) shared.listeners.splice(index, 1);
      if (--shared.users > 0) return;
      shared.stop();
      if (connection === shared) connection = undefined;
    },
    openConnection: () => shared.openConnection(),
  };
}
