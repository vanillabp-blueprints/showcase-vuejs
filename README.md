# Business Cockpit workspace

This Git repository holds two repositories as sibling folders:

- [`business-cockpit-ui`](business-cockpit-ui/README.md): the user interface, the types, the module kit and host, the theme, the dev shells and the nginx image. Node.js only.
- [`business-cockpit-backend`](business-cockpit-backend/README.md): the cockpit application (Spring Boot on the `business-cockpit` library), the types jar and `docker-compose.yaml`.

Everything below was run on one machine on 2026-11-26. Only what worked is written down as a command to copy.

## Trying it by hand

You need Docker, Node.js 24 (seen: 24.22.3), Java 25 with Maven (seen: 25.0.5 and 3.10.2) and Git. The network is used to download npm packages, Maven jars, the Docker images and the kit's repository from GitHub. Nothing is published or pushed.

Use one terminal per server (steps 2, 4 and 6 keep running). All paths are relative to this folder.

### 1. Build the user interface

```sh
cd business-cockpit-ui
npm ci
npm run fetch:openapi   # the OpenAPI files of the cockpit jars (0.9.0-SNAPSHOT), written to build/openapi
npm run build           # workspaces in order, the three test modules, then the UI jar in build/jars
```

Result: ran in about 30 seconds. `npm ci` warns that `esbuild` has an install script which is not allowed yet; the build works anyway.

### 2. Start the backend with everything it needs

```sh
cd business-cockpit-backend
docker compose up -d --wait
```

This starts MongoDB (a replica set with its user), Mailpit, and Keycloak 26.4.7 with the realm of `keycloak/realm.json`. It ends when all four are healthy (about 15 seconds when the images are present).

The user interface runs the way the interview chose (`Q-HOSTING` is `behind`): an nginx image serves the built files, and the backend passes every path it does not answer itself to it. Build and start the image from the UI repository, on port 8082:

```sh
cd business-cockpit-ui
docker build -f docker/Dockerfile -t business-cockpit-ui-nginx .
docker run -d --rm --name business-cockpit-ui-nginx -p 8082:80 business-cockpit-ui-nginx
```

Then start the backend with the profile `local` and the address of that image (without `USER_INTERFACE_URI` the backend looks for the host `user-interface`, which exists only in a deployment):

```sh
cd business-cockpit-backend
USER_INTERFACE_URI=http://127.0.0.1:8082 mvn -pl application spring-boot:run -Dspring-boot.run.profiles=local
```

It is ready when the log says `Started CockpitApplication` (about 5 seconds after Maven has compiled it). Stop it with Ctrl-C.

### 3. Open it and log in

Open <http://localhost:8080>. A browser is sent on to Keycloak (`curl` gets a 401 for `/`, and a 302 to `/oauth2/authorization/keycloak` when it sends `Accept: text/html`). Log in with:

| What | User | Password | Groups |
|---|---|---|---|
| The cockpit | `template-user` | `template-user` | `template-group` |
| Keycloak admin console, <http://localhost:8081> | `admin` | `admin` | |
| BPMS API (what workflow modules report with) | `local` | `local` | |

`template-user` is the only user in `keycloak/realm.json`, and `template-group` the only group. To try other visibilities, add users and groups to that file and import it again (step 9). Mailpit shows the mails the cockpit sends at <http://localhost:8025>.

An empty cockpit shows empty lists. Fill it in the next step.

### 4. Fill the cockpit with demo data

The blueprint applications of VanillaBP could not be built here: their SNAPSHOT dependencies are in no repository this machine reaches (`ASK-048` in `business-cockpit-ui/plan/QUESTIONS.md`, `business-cockpit-ui/RUN-AGAINST-COCKPIT.md`). The guide uses the conformance modules of the VanillaBP module kit instead (React, Vue, Angular). They are public; the kit is built here from the commit of the npm version `0.1.0-snapshot.6`:

```sh
mkdir -p business-cockpit-ui/build/kit-conformance && cd business-cockpit-ui/build/kit-conformance
COMMIT=$(npm view @vanillabp/bc-module-kit@0.1.0-snapshot.6 gitHead)
git clone https://github.com/vanillabp/business-cockpit-module-kit.git kit
git -C kit checkout $COMMIT
cd kit
npm ci
npm run build:examples
npm run build:conformance
```

(The folder `build` is not under Git.) Serve the modules, in a terminal of its own, and keep it running:

```sh
cd business-cockpit-ui/build/kit-conformance/kit/dist/conformance
PORT=4173 node serve.mjs
```

Register the modules at the backend and report cases and user tasks with the script of the UI repository:

```sh
cd business-cockpit-ui
node scripts/demo-data.mjs
```

The script calls the BPMS API (`/bpms/api/v1_1`, user `local:local`, see the head of the script for the variables). For each of the three modules it registers the module (`accessibleToGroups: template-group`, `uri` `http://localhost:4173/wm/<id>`), and reports three cases (`workflow/created`) with one user task each (`usertask/created`): one claimed by `template-user` and due in 2 days, one only offered to him and due in 5 days, and one finished (`usertask/.../completed`, `workflow/.../completed`). Running it again reports the same ids again and is harmless.

Result: log in as `template-user` and open `/tasks` (My tasks 6, All tasks 6; the three finished tasks are not listed), `/workflows` (In progress 6, Done 3) and `/tasks/demo-vue-module-claimed-task` (also `demo-react-module-...`, `demo-angular-module-...`): the form of the module loads from `/wm/<id>/` through the backend and draws the task title with the buttons Claim, Complete and Dialog. After the registration the header shows no error about a part that could not be loaded. The conformance modules have no page for a case: a case page says "This module has no page for the case." Not tried here: header extensions of the blueprints, live updates and very large lists against the real backend.

### 5. The dev shell

A dev shell lets the developer of a workflow module work on a form without a cockpit. It talks to the official GUI API under `/official-api/gui/api/v1` and to `/dev-shell/user/**`. The cockpit backend of this repository does not answer these paths (checked: 401 for both). So a dev shell does not run against it. It runs against a dev shell simulator. The one in this repository is the TypeScript simulator of the UI repository (it also answers the BPMS API, so a module can report to it). The test applications of the three dev shells are the example of how a module uses one:

```sh
cd business-cockpit-ui
node e2e/dev-shell/build.mjs                 # builds the test applications of the Vue, React and Angular dev shell
SIMULATOR_PORT=8099 node e2e/simulator/main.ts   # keep it running; Node prints a warning about the package type, it is harmless
```

In another terminal, report a user task and choose a user (the cookie keeps the choice, so a browser does this by the start page, `curl` only proves the calls):

```sh
curl -X POST localhost:8099/simulator-api/user-tasks -H 'content-type: application/json' -d '{"userTasks":[{"id":"t1","bpmnProcessId":"ride","workflowModuleId":"dev-module","createdAt":"2026-11-20T08:00:00Z","updatedAt":"2026-11-20T08:00:00Z","businessId":"B-1","title":{"en":"Assess risk"}}]}'
```

Open <http://127.0.0.1:8099/dev-shell-app/index.html> (Vue), `react.html` (React) or `angular.html` (Angular), pick the user `anna` on the start page, then open `#/tasks/t1`. Checked with a browser: all three show `task: Assess risk`.

A module developer does the same in the UI repository of his module: install the package of his framework (`@acme/bc-dev-shell-vue`, `@acme/bc-dev-shell-react` or `@acme/bc-dev-shell-angular`; they are not published, see "Next steps"), import his components and data entries, call `bootstrapDevShell(elementId, { guiApiBase: '/official-api/gui/api/v1', workflowModuleId, userTaskForm, components })` (Vue; the other two shells have the same options), and let his dev server forward `/official-api` and `/dev-shell` to a simulator with `devShellProxyTable` from `@acme/bc-module-kit/dist/dev-server-proxy.js`. I did not build such a module project here, so this paragraph is read from the source, not run. Its sources: `business-cockpit-ui/e2e/dev-shell/src/` (a test module for each framework), `business-cockpit-ui/packages/bc-dev-shell-*/src` and `business-cockpit-ui/packages/bc-module-kit/src/dev-server-proxy.ts`.

To develop the user interface of the cockpit itself against the running backend, see "Developing against the backend" in `business-cockpit-ui/README.md` (profile `ui-dev-server`, `npm run dev`). I did not run that one.

### 6. Run the tests

User interface repository. The Playwright tests start the TypeScript simulator themselves (port 8099, so stop the one of step 5 first). Set `CHROMIUM_PATH` where Playwright's own browser is not installed (here it was not; the system browser is `/usr/bin/chromium`):

```sh
cd business-cockpit-ui
node --test e2e/*.test.mjs
CHROMIUM_PATH=/usr/bin/chromium npx playwright test
```

`npm test` runs both. The Playwright run needs the build of step 1; its test `EXT-040` clones and builds the kit itself into `build/kit-conformance` when that folder is missing. With `BC_BACKEND_URL=http://localhost:8080` and the backend of step 2 running, the test `EXT-058` also runs against it (it serves the modules itself on port 4173, so stop `serve.mjs` first); without it that test is skipped.

Results of the full run here: the node tests (88) passed in two of four runs and failed in the other two on `PKG-054` (a change of the data sends an event on the update stream), so that test is flaky. The Playwright run (394 tests, with `BC_BACKEND_URL` set, 7.6 minutes) passed 393 and failed `EXT-040` (the conformance test of the kit): its set-up timed out waiting for its simulator. Run alone straight afterwards it passed in 3 seconds (`CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/conformance`). In that run the folder `build/kit-conformance` had been built by the commands of step 4, without the file `built-commit.txt` which the test writes, so the test built the kit once more; I did not find out which of the two caused the timeout.

Backend repository (needs Docker, because its tests start containers with Testcontainers; stop the compose project of step 2 first, the tests start their own):

```sh
cd business-cockpit-backend
mvn verify
```

`mvn verify` alone stops in the module `types` (`NoSuchFileException ... ui-uri-types.json`): it downloads `@acme/bc-types` from the npm registry, where it does not exist. Name the built types library instead, after step 1:

```sh
mvn verify -Dbc-types.local=$PWD/../business-cockpit-ui/packages/bc-types
```

Result: 2m25s, 44 tests, 43 passed and `BrowserGoesAwayTest.BE_033_BE_034...` failed once (a log line with "disconnected client" was written). The same test class run alone passed (`-pl types,application -Dtest=BrowserGoesAwayTest`), so it is flaky.

### 7. Stop everything and start again with empty data

Press Ctrl-C in the terminals of the backend, `serve.mjs` and the simulator, then:

```sh
docker stop business-cockpit-ui-nginx
cd business-cockpit-backend
docker compose down -v      # removes the containers and the volume of MongoDB and Keycloak
```

`down -v` throws the data away: the cases, the registered modules and every user added to Keycloak. Start again with step 2 (the nginx image stays built), then step 4's `node scripts/demo-data.mjs` and `serve.mjs`. Check afterwards that nothing is left: `docker ps` and `pgrep -af "java|node|nginx|chromium"`.

## Placeholders

These values stand in for the organisation's real ones. Replace them before anything is published:

| Placeholder | Where it is |
|---|---|
| organisation `com.acme` (Maven group of the backend, the UI jar and the types jar) | `business-cockpit-backend/pom.xml`, `types/pom.xml`, `application/pom.xml`, its `README.md`; `business-cockpit-ui/jars/build-jars.mjs`, `jars/publish-jars.mjs`; the tests `e2e/ui-jar.test.mjs`, `e2e/publish-jars.test.mjs` |
| Java package `com.acme.cockpit` (and `com.acme.cockpit.ui` for the types jar) | the folders below `business-cockpit-backend/application/src/main/java` and `src/test/java`; the types jar's package is set in `types/pom.xml` |
| npm scope `@acme` (seven packages) | every `package.json` below `business-cockpit-ui/packages`, `e2e/*`, the root `package.json`, `package-lock.json`, `renovate.json`, `packages/bc-module-kit/bin/bc-check-entries.mjs`, and `business-cockpit-backend/types/pom.xml` (the download address of `@acme/bc-types`) |
| `-Dbc-types.local=<folder of bc-types>` | `business-cockpit-backend/types/pom.xml`: until `@acme/bc-types` is in the npm registry, the build of the backend needs `mvn verify -Dbc-types.local=$PWD/../business-cockpit-ui/packages/bc-types` (see its README). `mvn verify` fails without it, see step 6 |
| cockpit `0.9.0-SNAPSHOT` instead of `1.0.0` | `business-cockpit-backend/pom.xml` (`business-cockpit.version`, and the snapshot repository below it), `business-cockpit-ui/scripts/fetch-openapi.mjs` (`COCKPIT_VERSION`) |
| versions `0.1.0-SNAPSHOT` of the UI jar and the npm packages | `business-cockpit-ui/package.json` and the workspaces (`npm run set-version <version>`), `ui.version` in `business-cockpit-backend/pom.xml` |
| secrets, passwords, users | `business-cockpit-backend/keycloak/realm.json`, `business-cockpit-backend/application/src/main/resources/config/application-local.yaml`: for a developer's machine only |

## Next steps

Proposals, none of them done. Tell which ones you want.

- Build pipeline: neither repository has one (no `.github` folder). Build and test both: `npm ci`, `npm run build`, `npm test` in the UI repository (Node.js 24, a Chromium, `CHROMIUM_PATH` if needed), `mvn verify` in the backend repository (Java 25, Docker), then build the nginx image and the jars. Use the CI the organisation has.
- Test coverage: a report over the node tests and the Playwright tests of the UI, and over the Java tests, with a limit the build checks. There is none today.
- Publishing: the UI jar (`npm run set-version <release>`, `npm run publish:jars` with `MAVEN_REPOSITORY_URL`), the npm packages (types, module kit, module host, theme, three dev shells; not published, `Q-NPM-SCOPE` is a placeholder), and the types jar (module `types` of the backend repository). Release order: cockpit, user interface, backend repository, see the README of the backend.
- Renovate: `business-cockpit-ui/renovate.json` exists and is tested; it is not active until the repositories sit where Renovate runs. The backend repository has no configuration yet.
- Cockpit 0.9.0-SNAPSHOT to 1.0.0 once it is released: the version property and the snapshot repository in `business-cockpit-backend/pom.xml`, `COCKPIT_VERSION` in `fetch-openapi.mjs`; then check the library's changes (the `/wm` proxy and the GUI API come from it).
- Replace the placeholders in the table above, and the sample realm users.
- Open decisions, see `business-cockpit-ui/plan/QUESTIONS.md`:
  - ASK-001 cell rendering by workflow modules (CUST-002): the skill calls it open; nothing is built.
  - ASK-048 blueprints: build or fetch the SNAPSHOT jars, start the three blueprint applications against the cockpit and repeat step 4 with them. EXT-058 is proven with the conformance modules only.
  - ASK-049 `/wm` without login: `/wm/**` answered 200 without a cookie. Module files are public, but a module's own endpoints below `/wm/` are then not protected by the cockpit.
  - ASK-026 and ASK-028 case list: no search field and no virtual window yet (SRCH-001 to SRCH-006 and SRCH-010 to SRCH-014 for cases); the list appends pages of 20.
  - ASK-008 Firefox: the scroll test SRCH-025 runs in Chromium only; there is no Firefox project in `playwright.config.ts`.
