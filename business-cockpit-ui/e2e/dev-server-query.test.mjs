// The dev server behind the backend: the gateway of the backend rebuilds the query string of a
// request from its parsed parameters, so ?vue&type=style&lang.css arrives as
// ?vue=&type=style&lang.css= . Vite takes the first for a style and answers with a script that
// applies it. It takes the second for a plain file and answers with raw CSS, which the browser then
// refuses to run as a script ("Unexpected token '.'").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

const root = new URL('../packages/ui/', import.meta.url).pathname;
const style = '/src/rights/RightsOverview.vue?vue&type=style&index=0&scoped=17b71019&lang.css';
const styleAsTheGatewayForwardsIt = style.replace('vue&', 'vue=&').replace('lang.css', 'lang.css=');

test('PKG-064 the dev server answers a style request with a script, also when the proxy added "=" to empty parameters', async () => {
  const server = await createServer({
    root,
    configFile: new URL('../packages/ui/vite.config.ts', import.meta.url).pathname,
    server: { port: 5197, strictPort: true, host: '127.0.0.1' },
    logLevel: 'silent',
  });
  await server.listen();
  try {
    for (const path of [style, styleAsTheGatewayForwardsIt]) {
      const answer = await fetch(`http://127.0.0.1:5197${path}`, { headers: { accept: '*/*' } });
      const body = await answer.text();
      assert.match(body, /^import /, `${path} was answered with: ${body.slice(0, 60)}`);
    }
  } finally {
    await server.close();
  }
});
