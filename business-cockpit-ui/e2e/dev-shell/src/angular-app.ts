// A module as its developer writes it: data entries and Angular components, handed to the dev shell as they are.
import '@angular/compiler';
import { Component, NgZone, inject } from '@angular/core';
import { bootstrapDevShell } from '@acme/bc-dev-shell-angular';
import { actions, areaNames, devShellPages, hasButtons, moduleOptions } from './module-data.js';

const part = (name: string) => {
  @Component({
    selector: `dev-part-${name}`, inputs: ['userTask', 'workflow', 'area', 'user', 'language'],
    template: `<div data-testid="part-${name}" class="part">${name}: {{ (userTask ?? workflow)?.title?.en ?? 'no data' }}</div>`
      + (hasButtons(name) ? `<span data-testid="part-zone">{{ zone }}</span><span data-testid="part-language">language: {{ language }}</span>${actions.map((action) => `<button data-action="${action}">${action}</button>`).join('')}` : ''),
  })
  class Part { userTask: any; workflow: any; zone = inject(NgZone).constructor.name; }
  return Part;
};

@Component({ selector: 'dev-page', inputs: ['user', 'language'], template: `<div data-testid="dev-page">page: {{ user }} {{ language }}</div>` })
class DevPage { user: any; language: any; }

bootstrapDevShell('dev-shell', { ...moduleOptions, devShellPages: devShellPages(DevPage), components: Object.fromEntries(Object.entries(areaNames).map(([name, element]) => [element, part(name)])) });
