# Business cockpit user interface of acme

One npm workspaces repository: the user interface (`packages/ui`), the types, the module kit and
host, the theme and the dev shells. Node.js 24 or newer is the only tool it needs.

To try the cockpit with the backend, fill it with demo data, start a dev shell, run the tests, and for the next steps, follow [Trying it by hand](../README.md#trying-it-by-hand) in the README of the workspace.

## Build and test

```sh
npm ci
npm run build   # workspaces in order, then the UI jar in build/jars
npm test
```

## Publish

The UI jar goes into a Maven repository. Only a release version is uploaded, so set one first:

```sh
npm run set-version 1.0.0
npm run build
MAVEN_REPOSITORY_URL=https://maven.example.com/releases npm run publish:jars
```

`MAVEN_REPOSITORY_USER` and `MAVEN_REPOSITORY_PASSWORD` are optional. The build needs the OpenAPI
files of the cockpit jars, `npm run fetch:openapi` downloads them (`COCKPIT_VERSION`,
`COCKPIT_REPOSITORY_TOKEN`).

## The nginx image

The image serves `packages/ui/dist` and nothing else. The backend passes every path it does not
answer itself to it (`USER_INTERFACE_URI`). Build it after `npm run build`, then run it:

```sh
docker build -f docker/Dockerfile -t business-cockpit-ui-nginx .
docker run --rm -p 8082:80 business-cockpit-ui-nginx
```

## End-to-end tests

The Playwright tests run against a TypeScript simulator of the backend, which they start
themselves. Build first. Set `CHROMIUM_PATH` if the browser of Playwright is missing:

```sh
npm run build --workspaces --if-present
npx playwright test
node --test e2e/*.test.mjs
```

`npm test` runs both. `--grep` runs one test by its id, for example `npx playwright test --grep PKG-061`.

## Developing against the backend

The browser talks to the backend only, so the login, the cookie and the paths are the same as in
production.

1. Start the backend repository as its `README.md` says, with the profile `ui-dev-server` added
   to `local`.
2. Run `npm run dev`. The dev server of `packages/ui` listens on `127.0.0.1:5173` and refuses
   to start on another port, because the backend names that address. It serves the user interface
   at `/` and answers an unknown path with `index.html`.
3. Open the address of the backend, for example `http://localhost:8080`, never the one of the dev
   server, and log in.

The backend forwards no WebSocket. The hot reload therefore connects to port 5173 directly. If
the hot reload does not reach the browser, for example because a proxy or a container hides that
port, reload the page by hand after a change.
