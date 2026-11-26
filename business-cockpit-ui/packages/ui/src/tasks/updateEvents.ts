import type { UserTaskEvent } from '../generated/cockpit-gui-api';

/** What the update stream tells about one change; the type comes from the generated client (LIVE-017). */
export type UpdateEvent = Partial<UserTaskEvent>;

/** The events of one delivery of the update stream; an entry without an `event` object says nothing about an id. */
export function eventsOf(message: Event): UpdateEvent[] {
  try {
    const entries = JSON.parse((message as MessageEvent<string>).data) as { event?: UpdateEvent }[];
    return entries.flatMap(({ event }) => (event ? [event] : []));
  } catch {
    return [];
  }
}

/** Another user made the change: the user's own change has `initiatorKind` USER and the id of the current user, every other change is another's (LIVE-002). */
export const isChangeOfOthers = (event: UpdateEvent, currentUserId: string): boolean =>
  !(event.initiatorKind === 'USER' && event.initiator === currentUserId);

/** The toast of TF-011 comes only for a person: `USER` and not the current user (TF-037). */
export const isChangeByOtherUser = (event: UpdateEvent, currentUserId: string): boolean =>
  event.initiatorKind === 'USER' && event.initiator !== currentUserId;
