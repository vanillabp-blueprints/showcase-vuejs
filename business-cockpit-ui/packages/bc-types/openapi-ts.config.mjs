import { defineConfig } from '@hey-api/openapi-ts';

// The types library needs the data of the GUI API and no client, so only the typescript plugin runs.
export default defineConfig({
  input: '../../build/openapi/official-gui-api.yaml',
  output: 'src/generated',
  plugins: ['@hey-api/typescript'],
});
