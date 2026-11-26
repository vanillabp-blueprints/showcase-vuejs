export interface UpdateEvent { id?: string; type?: string; initiatorKind?: string; initiator?: string }

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
