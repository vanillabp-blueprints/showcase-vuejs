import { createApp, h } from 'vue';
import { cockpitTitle } from '@acme/bc-theme';
import { configureGuiApiClients } from './api/clients';
import { currentUser, sendToLoginOnUnauthorized } from './session/session';

configureGuiApiClients();
sendToLoginOnUnauthorized();

async function start(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  createApp({
    render: () => h('header', [
      h('h1', cockpitTitle),
      h('span', { 'data-testid': 'current-user' }, user.display ?? user.id),
      h('a', { 'data-testid': 'logout', href: '/logout' }, 'Log out'),
    ]),
  }).mount('#app');
}

void start();
