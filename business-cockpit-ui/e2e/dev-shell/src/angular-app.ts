// A module as its developer writes it: data entries and Angular components, handed to the dev shell as they are.
import '@angular/compiler';
import { Component } from '@angular/core';
import { bootstrapDevShell } from '@acme/bc-dev-shell-angular';
import { areaNames, moduleOptions } from './module-data.js';

const part = (name: string) => {
  @Component({
    selector: `dev-part-${name}`, inputs: ['userTask', 'workflow', 'area', 'user'],
    template: `<div data-testid="part-${name}" class="part">${name}: {{ (userTask ?? workflow)?.title?.en ?? 'no data' }}</div>`,
  })
  class Part { userTask: any; workflow: any; }
  return Part;
};

bootstrapDevShell('dev-shell', { ...moduleOptions, components: Object.fromEntries(Object.entries(areaNames).map(([name, element]) => [element, part(name)])) });
