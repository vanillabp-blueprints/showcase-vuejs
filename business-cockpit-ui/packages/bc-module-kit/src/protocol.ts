import { ACTIONS_WITHOUT_TIMEOUT, DEFAULT_TIMEOUT_MS, ERROR_CODES, REQUEST_EVENT, RESPONSE_EVENT, type BcResponseDetail } from '@acme/bc-types';

type Pending = { resolve(result: unknown): void; reject(error: Error): void; timer?: ReturnType<typeof setTimeout>; stop(): void };
const openRequests = new WeakMap<EventTarget, Set<Pending>>();
let counter = 0;

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${++counter}-${Math.random().toString(36).slice(2)}`;
}

function fail(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** Asks the cockpit through the element and resolves with the result of its answer. */
export function requestFromCockpit(element: EventTarget, action: string, args?: unknown, timeoutMs?: number): Promise<unknown> {
  const requestId = newRequestId();
  const open = openRequests.get(element) ?? new Set<Pending>();
  openRequests.set(element, open);
  return new Promise((resolve, reject) => {
    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<BcResponseDetail>).detail;
      if (detail.requestId !== requestId) return;
      pending.stop();
      if (detail.ok) resolve(detail.result);
      else reject(Object.assign(new Error(detail.error.message ?? detail.error.code), detail.error));
    };
    const pending: Pending = {
      resolve, reject,
      stop: () => { element.removeEventListener(RESPONSE_EVENT, onResponse); clearTimeout(pending.timer); open.delete(pending); },
    };
    const wait = timeoutMs ?? (ACTIONS_WITHOUT_TIMEOUT.includes(action) ? 0 : DEFAULT_TIMEOUT_MS);
    if (wait > 0) pending.timer = setTimeout(() => { pending.stop(); reject(fail(ERROR_CODES.TIMEOUT, `no answer to ${action}`)); }, wait);
    open.add(pending);
    element.addEventListener(RESPONSE_EVENT, onResponse);
    element.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: { requestId, action, args } }));
  });
}

/** Rejects every open request of the element with DISCONNECTED. */
export function rejectOpenRequests(element: EventTarget): void {
  for (const pending of [...(openRequests.get(element) ?? [])]) {
    pending.stop();
    pending.reject(fail(ERROR_CODES.DISCONNECTED, 'the element left the page'));
  }
}
