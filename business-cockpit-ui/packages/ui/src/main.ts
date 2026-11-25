import { createApp, h } from 'vue';
import { cockpitTitle } from '@acme/bc-theme';
import { loadableUiUriTypes } from '@acme/bc-module-host';

createApp({ render: () => h('h1', `${cockpitTitle} (${loadableUiUriTypes.join(', ')})`) }).mount('#app');
