import { defineConfig } from '@playwright/test';

const port = Number(process.env.SIMULATOR_PORT ?? 8099);

// The simulator stands in for the backend and serves the built user interface.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'node e2e/simulator/main.ts',
    url: `http://127.0.0.1:${port}/gui/api/v1/app/info`,
    env: { SIMULATOR_PORT: String(port) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
