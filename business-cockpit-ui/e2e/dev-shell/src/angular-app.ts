// A module as its developer writes it: data entries and Angular components, handed to the dev shell as they are.
import '@angular/compiler';
import { Component, NgZone, inject } from '@angular/core';
import { bootstrapDevShell } from '@acme/bc-dev-shell-angular';
import { actions, areaNames, hasButtons, moduleOptions } from './module-data.js';

const part = (name: string) => {
  @Component({
    selector: `dev-part-${name}`, inputs: ['userTask', 'workflow', 'area', 'user', 'language'],
    template: `<div data-testid="part-${name}" class="part">${name}: {{ (userTask ?? workflow)?.title?.en ?? 'no data' }}</div>`
      + (hasButtons(name) ? `<span data-testid="part-zone">{{ zone }}</span><span data-testid="part-language">language: {{ language }}</span>${actions.map((action) => `<button data-action="${action}">${action}</button>`).join('')}` : ''),
  })
  class Part { userTask: any; workflow: any; zone = inject(NgZone).constructor.name; }
  return Part;
};

bootstrapDevShell('dev-shell', { ...moduleOptions, components: Object.fromEntries(Object.entries(areaNames).map(([name, element]) => [element, part(name)])) });
