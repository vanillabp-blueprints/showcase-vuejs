import { ACTIONS, MESSAGE_EVENT, type BcMessageDetail, type BcNotification } from '@acme/bc-types';
import { requestFromCockpit } from './protocol.js';

export interface BcElementRef { element: string; entry: string }
export interface BcSubscription { ready: Promise<void>; unsubscribe: () => Promise<void> }

/** Carries a message to the web component of another area of the same page. */
export const sendTo = (element: EventTarget, target: string, message: unknown): Promise<void> =>
  requestFromCockpit(element, ACTIONS.sendTo, { target, message }).then(() => undefined);

/** Shows a toast in the cockpit. */
export const showNotification = (element: EventTarget, notification: BcNotification): Promise<void> =>
  requestFromCockpit(element, ACTIONS.showNotification, notification).then(() => undefined);

/** Shows the web component in a modal dialog and resolves with what the dialog closed with. */
export const openDialog = (element: EventTarget, dialog: BcElementRef, data?: unknown): Promise<unknown> =>
  requestFromCockpit(element, ACTIONS.openDialog, { ...dialog, data });

/** Closes the dialog the element is in; the request is answered before the dialog is removed. */
export const closeDialog = (element: EventTarget, result?: unknown): Promise<void> =>
  requestFromCockpit(element, ACTIONS.closeDialog, { result }).then(() => undefined);

/**
 * Registers the handler with the cockpit. A message which comes before the answer to `page.subscribe`
 * is kept and handed over, in order, once the `subscriptionId` is known.
 */
export function receiveMessage(element: EventTarget, handler: (message: unknown, from: string) => void): BcSubscription {
  let subscriptionId: string | undefined;
  const early: BcMessageDetail[] = [];
  const deliver = (detail: BcMessageDetail) => handler(detail.message, detail.from);
  const onMessage = (event: Event) => {
    const detail = (event as CustomEvent<BcMessageDetail>).detail;
    if (subscriptionId === undefined) early.push(detail);
    else if (detail.subscriptionId === subscriptionId) deliver(detail);
  };
  element.addEventListener(MESSAGE_EVENT, onMessage);
  const ready = requestFromCockpit(element, ACTIONS.subscribe).then((result) => {
    subscriptionId = (result as { subscriptionId: string }).subscriptionId;
    for (const detail of early.splice(0)) if (detail.subscriptionId === subscriptionId) deliver(detail);
  });
  const unsubscribe = async () => {
    element.removeEventListener(MESSAGE_EVENT, onMessage);
    await ready;
    await requestFromCockpit(element, ACTIONS.unsubscribe, { subscriptionId });
  };
  return { ready, unsubscribe };
}

/** The functions of the cockpit every web component gets, bound to the element. */
export const functionsOf = (element: HTMLElement) => ({
  showNotification: (notification: BcNotification) => showNotification(element, notification),
  openDialog: (dialog: BcElementRef, data?: unknown) => openDialog(element, dialog, data),
  closeDialog: (result?: unknown) => closeDialog(element, result),
  sendTo: (target: string, message: unknown) => sendTo(element, target, message),
  receiveMessage: (handler: (message: unknown, from: string) => void) => receiveMessage(element, handler),
  request: (action: string, args?: unknown, timeoutMs?: number) => requestFromCockpit(element, action, args, timeoutMs),
});
