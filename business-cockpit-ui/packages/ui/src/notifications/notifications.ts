import { reactive } from 'vue';
import { FailedCall } from '../api/clients';
import type {
  NotificationConfiguration,
  NotificationMedium,
  NotificationWorkflow,
  RecipientMediumConfiguration,
} from '../generated/official-gui-api';
import { OfficialNotificationConfigApi } from '../generated/official-gui-api';

/** A kind of case is a process of a workflow module, and the config names it by this key. */
export const keyOf = (workflow: NotificationWorkflow): string => `${workflow.workflowModuleId}#${workflow.bpmnProcessId}`;

export type NotificationSettingsState = {
  loaded: boolean;
  failed: boolean;
  media: NotificationMedium[];
  workflows: NotificationWorkflow[];
  config: NotificationConfiguration;
  recipients: RecipientMediumConfiguration[];
  /** what the user typed in a field of a channel, by `<medium>:<type>`, until it is stored */
  typed: Record<string, string>;
  /** the text of a refused value, by `<medium>:<type>` */
  refused: Record<string, string>;
};

export const state = reactive<NotificationSettingsState>({ loaded: false, failed: false, media: [], workflows: [], config: {}, recipients: [], typed: {}, refused: {} });

const api = (): OfficialNotificationConfigApi => new OfficialNotificationConfigApi();

/** Reads the four lists of the settings; it is asked every time the screen opens, so a reload shows what is stored. */
export async function load(): Promise<void> {
  state.loaded = false;
  state.failed = false;
  try {
    const [media, workflows, config, recipients] = await Promise.all([
      api().getNotificationMedia(),
      api().getNotificationWorkflows(),
      api().getNotificationConfiguration(),
      api().getRecipientConfiguration(),
    ]);
    state.media = media;
    state.workflows = workflows;
    state.config = { globalAllViaMedium: { ...config.globalAllViaMedium }, perWorkflow: { ...config.perWorkflow } };
    state.recipients = recipients;
    state.typed = {};
    state.refused = {};
    state.loaded = true;
  } catch {
    state.failed = true;
  }
}

export const isAll = (medium: string): boolean => state.config.globalAllViaMedium?.[medium] === true;

export const hasOwnRow = (key: string): boolean => state.config.perWorkflow?.[key] !== undefined;

export const isNone = (key: string): boolean => state.config.perWorkflow?.[key]?.none === true;

/** A row without an entry follows the first row. */
export function isChosen(key: string, medium: string): boolean {
  const own = state.config.perWorkflow?.[key];
  if (!own) return isAll(medium);
  return own.none === true ? false : own.allViaMedium?.[medium] === true;
}

/** The table as stored: every channel has a flag in the first row, and a row of its own has one for every channel. */
function whole(): NotificationConfiguration {
  const flags = (value: (medium: string) => boolean) => Object.fromEntries(state.media.map((medium) => [medium.type, value(medium.type)]));
  const perWorkflow = Object.fromEntries(Object.entries(state.config.perWorkflow ?? {}).map(([key, row]) => [
    key,
    row.none === true ? { none: true } : { allViaMedium: flags((medium) => row.allViaMedium?.[medium] === true) },
  ]));
  return { globalAllViaMedium: flags(isAll), perWorkflow };
}

// one request after the other, so the last choice of the user is the one the server keeps
let storing: Promise<unknown> = Promise.resolve();
const store = (): void => {
  const table = whole();
  storing = storing.then(() => api().saveNotificationConfiguration({ notificationConfiguration: table })).catch(() => { state.failed = true; });
};

export function chooseAll(medium: string, chosen: boolean): void {
  state.config.globalAllViaMedium = { ...state.config.globalAllViaMedium, [medium]: chosen };
  store();
}

/** A change in a row gives the row an entry of its own, which writes what the row showed until now for every channel. */
export function chooseInRow(key: string, medium: string, chosen: boolean): void {
  const shown = Object.fromEntries(state.media.map((one) => [one.type, isChosen(key, one.type)]));
  state.config.perWorkflow = { ...state.config.perWorkflow, [key]: { allViaMedium: { ...shown, [medium]: chosen } } };
  store();
}

export function chooseNone(key: string, none: boolean): void {
  if (none) state.config.perWorkflow = { ...state.config.perWorkflow, [key]: { none: true } };
  else follow(key);
  store();
}

/** The row has no entry of its own again and follows the first row. */
export function follow(key: string): void {
  const { [key]: _gone, ...rest } = state.config.perWorkflow ?? {};
  state.config.perWorkflow = rest;
  store();
}

export const fieldKey = (medium: string, type: string): string => `${medium}:${type}`;

export const valueOfField = (medium: string, type: string, stored?: string): string => state.typed[fieldKey(medium, type)] ?? stored ?? '';

/** Stores the fields of one channel; a value the channel cannot use is answered with 400 and the text is shown at the field. */
export async function saveChannel(channel: RecipientMediumConfiguration): Promise<void> {
  const body = Object.fromEntries((channel.values ?? []).map((field) => [field.type, valueOfField(channel.medium, field.type, field.value)]));
  for (const field of channel.values ?? []) delete state.refused[fieldKey(channel.medium, field.type)];
  try {
    await api().saveRecipientConfiguration({ mediumType: channel.medium, body });
    for (const field of channel.values ?? []) field.value = body[field.type];
  } catch (error) {
    const text = error instanceof FailedCall && error.status === 400 ? error.answer : undefined;
    // the text belongs to the channel, so it is shown at its first field
    const first = channel.values?.[0];
    if (first && text) state.refused[fieldKey(channel.medium, first.type)] = text;
    else state.failed = true;
  }
}
