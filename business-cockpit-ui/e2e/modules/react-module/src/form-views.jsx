import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { defineBcElement } from '@acme/bc-module-kit';
import { AREAS, names, partOf } from './element-names.js';

const roots = new WeakMap();

// The body sends a message to the area actions; the area actions lists what reaches it once it listens (TF-016, TF-022).
function Body({ element, text, id }) {
  return createElement('div', { 'data-testid': 'react-body', 'data-framework': 'react' }, text,
    createElement('button', { 'data-testid': 'send-to-actions', onClick: () => element.sendTo('actions', `hello from ${id}`) }, 'send'));
}

function Actions({ element, text }) {
  const [received, setReceived] = useState([]);
  const [subscription, setSubscription] = useState();
  const listen = () => setSubscription(element.receiveMessage((message, from) => setReceived((before) => [...before, `${from}: ${message}`])));
  const stop = () => { subscription?.unsubscribe(); setSubscription(undefined); };
  return createElement('div', { 'data-testid': 'react-actions', 'data-framework': 'react' }, text,
    createElement('button', { 'data-testid': 'listen', onClick: listen }, 'listen'),
    createElement('button', { 'data-testid': 'stop', onClick: stop }, 'stop'),
    createElement('ul', { 'data-testid': 'received' }, received.map((line, index) => createElement('li', { key: index }, line))));
}

const draw = (root, props, area) => {
  if (!roots.has(root)) roots.set(root, createRoot(root));
  const text = `React ${area} of ${props.userTask?.id ?? 'task'}`;
  const view = area === 'body' ? createElement(Body, { element: props.element, text, id: props.userTask?.id ?? 'task' })
    : area === 'actions' ? createElement(Actions, { element: props.element, text })
      : createElement('div', { 'data-testid': `react-${area}`, 'data-framework': 'react' }, text);
  roots.get(root).render(view);
};

for (const area of AREAS) {
  defineBcElement(names.userTask('TaxiRide', 'assessRisk', partOf(area)), {
    mount: (root, props) => draw(root, props, area),
    update: (root, props) => draw(root, props, area),
    unmount: (root) => { roots.get(root)?.unmount(); roots.delete(root); },
  });
}
