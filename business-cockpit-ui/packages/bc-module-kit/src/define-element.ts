import { rejectOpenRequests } from './protocol.js';

export type BcProps = Record<string, unknown> & { element: HTMLElement };
export interface BcElementFunctions {
  mount(root: ShadowRoot, props: BcProps): void;
  update?(root: ShadowRoot, props: BcProps): void;
  unmount?(root: ShadowRoot): void;
}

/** The properties the cockpit sets on every part. */
const BASE_PROPERTIES = ['userTask', 'workflow', 'user', 'area'];

/** Builds and registers the web component of a part; throws when the name is taken. */
export function defineBcElement(name: string, functions: BcElementFunctions, options: { properties?: readonly string[] } = {}): void {
  if (customElements.get(name)) throw new Error(`the web component ${name} is defined already`);
  const properties = [...new Set([...BASE_PROPERTIES, ...(options.properties ?? [])])];
  class BcElement extends HTMLElement {
    #props: Record<string, unknown> = {};
    #root?: ShadowRoot;
    #queued = false;
    constructor() {
      super();
      // A property set before the element was defined sits on the instance; take it back.
      for (const key of properties) {
        if (Object.prototype.hasOwnProperty.call(this, key)) {
          this.#props[key] = (this as Record<string, unknown>)[key];
          delete (this as Record<string, unknown>)[key];
        }
      }
    }
    connectedCallback() {
      this.#root ??= this.attachShadow({ mode: 'open' });
      functions.mount(this.#root, { ...this.#props, element: this });
    }
    disconnectedCallback() {
      rejectOpenRequests(this);
      if (this.#root) functions.unmount?.(this.#root);
    }
    #changed(key: string, value: unknown) {
      this.#props[key] = value;
      if (!this.#root || this.#queued) return;
      this.#queued = true;
      queueMicrotask(() => {
        this.#queued = false;
        functions.update?.(this.#root!, { ...this.#props, element: this });
      });
    }
    static {
      for (const key of properties) {
        Object.defineProperty(this.prototype, key, {
          get(this: BcElement) { return this.#props[key]; },
          set(this: BcElement, value: unknown) { this.#changed(key, value); },
        });
      }
    }
  }
  customElements.define(name, BcElement);
}
