// The types of React are not a dependency of the dev shell; this is the part of them it uses.
declare module 'react' {
  export type ComponentType<P = any> = (props: P) => unknown;
  export function createElement(type: ComponentType<any>, props?: Record<string, unknown> | null): unknown;
}
declare module 'react-dom/client' {
  export function createRoot(container: Element): { render(element: unknown): void; unmount(): void };
}
