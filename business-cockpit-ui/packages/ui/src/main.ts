import { installTheme } from '@acme/bc-theme';
import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import 'vuetify/styles';
import App from './App.vue';
import { configureGuiApiClients } from './api/clients';
import { LoginApi } from './generated/cockpit-gui-api';
import { keepCountsCurrent } from './counts/counts';
import { currentUser, sendToLoginOnUnauthorized } from './session/session';

installTheme();
configureGuiApiClients();
sendToLoginOnUnauthorized();

async function start(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const info = await new LoginApi().appInformation();
  keepCountsCurrent();
  const vuetify = createVuetify({
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    // the dark mode follows the operating system
    theme: { defaultTheme: 'system' },
  });
  createApp(App, { title: info.titleLong, user }).use(vuetify).mount('#app');
}

void start();
