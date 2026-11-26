// PKG-061, BE-018 and BE-019 name what the two README files say. The tests read them.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repositories = join(process.cwd(), '..');
const uiReadme = readFileSync(join(repositories, 'business-cockpit-ui', 'README.md'), 'utf8');
const backendReadme = readFileSync(join(repositories, 'business-cockpit-backend', 'README.md'), 'utf8');

test('PKG-061 the README of the UI repository says how to build, publish, run against a cockpit, run the nginx image and run the end-to-end tests', () => {
  expect(uiReadme).toContain('npm run build');
  expect(uiReadme).toContain('npm run set-version');
  expect(uiReadme).toContain('npm run publish:jars');
  expect(uiReadme).toContain('MAVEN_REPOSITORY_URL');
  expect(uiReadme).toContain('npm run dev');
  expect(uiReadme).toContain('docker build -f docker/Dockerfile');
  expect(uiReadme).toContain('docker run');
  expect(uiReadme).toContain('npx playwright test');
  expect(uiReadme).toContain('node --test e2e/*.test.mjs');
});

test('BE-018 the README of the backend repository says how to start it, which users exist, which variables a deployment sets, the order of the builds and ui.version', () => {
  expect(backendReadme).toContain('docker compose up');
  expect(backendReadme).toContain('-Dspring-boot.run.profiles=local');
  expect(backendReadme).toMatch(/workerId/);
  expect(backendReadme).toContain('template-user');
  for (const variable of ['MONGODB_URI', 'COCKPIT_JWT_KEY', 'BPMS_API_USERNAME', 'BPMS_API_PASSWORD',
    'KEYCLOAK_CLIENT_SECRET', 'KEYCLOAK_DIRECTORY_SECRET', 'KEYCLOAK_URL', 'COCKPIT_URI', 'MAIL_HOST',
    'USER_INTERFACE_URI']) {
    expect(backendReadme).toContain(variable);
  }
  expect(backendReadme).toMatch(/cockpit release, then the user interface, then this backend repository/);
  expect(backendReadme).toMatch(/new version of the user interface[^.]*`ui\.version`/);
});

test('BE-019 the README of the backend repository says that test users with groups belong into keycloak/realm.json and how to import it again', () => {
  expect(backendReadme).toContain('keycloak/realm.json');
  expect(backendReadme).toMatch(/groups decide which user tasks and cases a user sees/);
  expect(backendReadme).toContain('docker compose down -v');
});
