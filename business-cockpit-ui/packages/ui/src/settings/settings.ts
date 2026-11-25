import { UserSettingsApi } from '../generated/cockpit-gui-api';

const prefix = 'bc';
const defaultQuietMilliseconds = 500;

/**
 * The name of a setting: the prefix of this user interface, then the parts, `:` between them.
 * The server refuses a `.` in a key, so the dots of a path become `:` as well.
 */
export function settingKey(...parts: string[]): string {
  return [prefix, ...parts].map((part) => part.replaceAll('.', ':')).join(':');
}

function assertKey(key: string): void {
  if (key.includes('.')) throw new Error(`The key of a setting has no '.', use ':' as the separator: ${key}`);
}

/**
 * The one place which reads and writes the settings of the user. They live on the server, in
 * every browser of the user. Nothing else calls the endpoints.
 */
export class Settings {
  private readonly cache = new Map<string, Promise<unknown>>();
  private readonly quiet = new Map<string, ReturnType<typeof setTimeout>>();
  private pending: Promise<unknown>[] = [];
  private readonly quietMilliseconds: number;

  constructor(options: { quietMilliseconds?: number } = {}) {
    this.quietMilliseconds = options.quietMilliseconds ?? defaultQuietMilliseconds;
  }

  /** The value of a setting, or undefined when the user has none. Asks the server once per key. */
  async read<T = unknown>(key: string): Promise<T | undefined> {
    assertKey(key);
    let value = this.cache.get(key);
    if (!value) {
      value = new UserSettingsApi().getSettingOfCurrentUser({ key }, { throwOnError: false });
      this.cache.set(key, value);
    }
    return (await value) as T | undefined;
  }

  /** Changes the cache at once and sends the change to the server without making the caller wait. */
  write(key: string, value: unknown): void {
    assertKey(key);
    this.cache.set(key, Promise.resolve(value));
    this.pending.push(
      new UserSettingsApi()
        .putSettingOfCurrentUser({ key, body: value }, { throwOnError: false })
        .then(() => undefined),
    );
  }

  /** For a setting which changes often, like a column width while dragging: the server hears the last value only. */
  writeWhenQuiet(key: string, value: unknown): void {
    assertKey(key);
    this.cache.set(key, Promise.resolve(value));
    clearTimeout(this.quiet.get(key));
    this.quiet.set(
      key,
      setTimeout(() => {
        this.quiet.delete(key);
        this.write(key, value);
      }, this.quietMilliseconds),
    );
  }

  /** Resolves when every write so far has reached the server. */
  async flush(): Promise<void> {
    await Promise.all(this.pending);
    this.pending = [];
  }
}

/** The settings service of the page. */
export const settings = new Settings();
