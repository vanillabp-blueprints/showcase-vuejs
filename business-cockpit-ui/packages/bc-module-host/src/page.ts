import { ERROR_CODES, MESSAGE_EVENT, type BcMessageDetail } from '@acme/bc-module-kit';

/** An action fails with a code of its own, for example `NO_TARGET`. */
export class ActionFailed extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

interface Kept { from: string; message: unknown }

/** The areas of one page and the messages between them. */
export function createPage() {
  const areas = new Map<string, HTMLElement>();
  const areaOf = new WeakMap<HTMLElement, string>();
  const subscriptions = new Map<string, string>();
  const kept = new Map<string, Kept[]>();
  let counter = 0;

  const deliver = (area: string, from: string, message: unknown) => {
    for (const [subscriptionId, subscribed] of subscriptions) {
      if (subscribed === area) areas.get(area)?.dispatchEvent(new CustomEvent<BcMessageDetail>(MESSAGE_EVENT, { detail: { subscriptionId, from, message } }));
    }
  };

  return {
    register(area: string, element: HTMLElement) { areas.set(area, element); areaOf.set(element, area); },
    areaOf: (element: HTMLElement): string | undefined => areaOf.get(element),
    send(element: HTMLElement, target: string, message: unknown) {
      if (!areas.has(target)) throw new ActionFailed(ERROR_CODES.NO_TARGET, `the page has no web component for the area ${target}`);
      const from = areaOf.get(element) ?? '';
      if ([...subscriptions.values()].includes(target)) deliver(target, from, message);
      else kept.set(target, [...(kept.get(target) ?? []), { from, message }]);
    },
    subscribe(element: HTMLElement): string {
      const area = areaOf.get(element);
      if (area === undefined) throw new ActionFailed(ERROR_CODES.NO_TARGET, 'the element is in no area of a page');
      const subscriptionId = `${area}-${++counter}`;
      subscriptions.set(subscriptionId, area);
      // the kept messages follow in a later task, after the answer with the subscriptionId
      setTimeout(() => { for (const { from, message } of kept.get(area) ?? []) deliver(area, from, message); kept.delete(area); }, 0);
      return subscriptionId;
    },
    unsubscribe(subscriptionId: string) { subscriptions.delete(subscriptionId); },
  };
}

export type Page = ReturnType<typeof createPage>;
