import { installTheme } from '@acme/bc-theme';

export const devShellFramework = 'angular';

/** The base page of the dev shell looks like the cockpit: it takes the theme from the theme library. */
export function bootstrapDevShell(): void {
  installTheme();
}
