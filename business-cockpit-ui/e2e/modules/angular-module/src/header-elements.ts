import '@angular/compiler';
import { Component, createComponent, type ApplicationRef } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { defineBcElement } from '@acme/bc-module-kit';
import { names } from './element-names.js';

@Component({ selector: 'ticket-link', template: '<a data-testid="angular-header" data-framework="angular" href="#tickets">Angular tickets</a>' })
class TicketLink {}

// One Angular application per module, one component per web component.
let application: Promise<ApplicationRef> | undefined;
const components = new WeakMap<ShadowRoot, { destroy(): void }>();

defineBcElement(names.custom('ticket-link'), {
  mount: (root, props) => {
    application ??= createApplication();
    void application.then((app) => {
      components.set(root, createComponent(TicketLink, { environmentInjector: app.injector, hostElement: root.appendChild(document.createElement('ticket-link')) }));
    });
  },
  unmount: (root) => components.get(root)?.destroy(),
});
