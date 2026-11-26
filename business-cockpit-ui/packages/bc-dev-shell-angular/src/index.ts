import { createComponent, type ApplicationRef, type Type } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { startDevShell, type DevShellCoreOptions, type DevShellRenderer } from '@acme/bc-module-kit';
import { installTheme } from '@acme/bc-theme';

export const devShellFramework = 'angular';
export type DevShellOptions = DevShellCoreOptions<Type<any>>;

/**
 * The Angular component is the one imported from its source file. One zoneless application serves all parts; a component takes
 * the props as inputs, set with `setInput`, so that an update repaints it.
 */
let application: Promise<ApplicationRef> | undefined;
const renderer: DevShellRenderer<Type<any>> = {
  draw(target, component, given) {
    let ref: ReturnType<typeof createComponent> | undefined;
    let stopped = false;
    const set = (props: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(props)) if (key !== 'element') ref?.setInput(key, value);
      ref?.changeDetectorRef.detectChanges();
    };
    application ??= createApplication();
    void application.then((app) => {
      if (stopped) return;
      ref = createComponent(component, { environmentInjector: app.injector, hostElement: target.appendChild(document.createElement('dev-shell-part')) });
      app.attachView(ref.hostView);
      set(given);
    });
    return { update: set, stop: () => { stopped = true; ref?.destroy(); } };
  },
};

/** Renders the dev shell into the element with the id; the page looks like the cockpit: the theme comes from the theme library. */
export function bootstrapDevShell(elementId: string, options: DevShellOptions): void {
  const target = document.getElementById(elementId);
  if (!target) throw new Error(`the page has no element with the id ${elementId}`);
  installTheme();
  startDevShell(target, options, renderer);
}
