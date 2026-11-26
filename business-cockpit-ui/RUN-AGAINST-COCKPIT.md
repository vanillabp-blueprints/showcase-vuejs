# Run against a running cockpit

Story S74, part 2. Date 2026-11-26. Everything below ran on one machine and was stopped afterwards.

## What ran

| Part | How |
|---|---|
| MongoDB (replica set), Mailpit, Keycloak 26.4.7 on 8180 | `docker compose up -d --wait` in `business-cockpit-backend` |
| Backend | `USER_INTERFACE_URI=http://127.0.0.1:8090 mvn -o -pl application spring-boot:run -Dspring-boot.run.profiles=local` (port 8080) |
| User interface (`behind`) | the image `nginx:1.29-alpine` with `packages/ui/dist` and `docker/nginx.conf.template` mounted, port 8090; the backend's route `/**` forwards to it |
| Modules | `PORT=4173 node serve.mjs` from `build/kit-conformance/kit/dist/conformance` (kit 0.1.0-snapshot.6, commit 7caecd7) |
| Registration | `POST /bpms/api/v1_1/workflow-module/{id}` with `uri` `http://localhost:4173/wm/{id}`, `accessibleToGroups` `template-group`, basic auth `local:local` |
| Data | per module one case (`POST /bpms/api/v1_1/workflow/created`) and one user task (`POST /bpms/api/v1_1/usertask/created`, `userTaskId`, `uiUriType` `ES_MODULES`, `uiUriPath` `/bc-manifest.json`, `title`, assignee and candidate `template-user`) |
| Login | Playwright with `CHROMIUM_PATH=/usr/bin/chromium`: Keycloak form, `template-user` / `template-user` |

Repeatable as one test: `BC_BACKEND_URL=http://localhost:8080 CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/running-cockpit` (title EXT-058; skipped without `BC_BACKEND_URL`; needs the kit built by `e2e/conformance/kit-conformance.spec.ts` and the backend and nginx running as above).

## Results

| Check | Result |
|---|---|
| Login through Keycloak by browser, header shows `template-user` | pass |
| `/wm/<id>/bc-manifest.json` and entries through the backend, with the module's `Cache-Control` (`no-cache`, `max-age=3600`) | pass |
| Lists: three rows in the task list, three in the case list; case page opens (the conformance modules have no case page: "This module has no page for the case.") | pass |
| Page of a user task loads the React form from `/wm/react-module/` | pass |
| Kit `cockpit.test.js` (conformance test, EXT-040) against the backend: React, Vue, Angular | 19 pass, 0 fail |
| `running-cockpit.spec.ts` (EXT-058) | 1 pass |
| Backend `WorkflowModuleProxyTest` (EXT-058, EXT-059, Testcontainers, stub module) | 3 pass; seen red once with the stub registered at a wrong path |

## The `/wm` route

The backend repository has no `/wm` code of its own, and needs none: the library `business-cockpit` 0.9.0-SNAPSHOT (`MicroserviceProxyRegistry`) forwards `/wm/<id>/<path>` to the registered `uri` and passes `Cache-Control`, `ETag`, `Last-Modified`, `304` and `Content-Encoding: gzip` on (proven by the Java test). ASK-018 (no route) was a wrong assumption; ASK-049.

## GUI API paths on the real backend (session of `template-user`)

All answered as intended, no security configuration had to change.

| Path | Status |
|---|---|
| GET `/app/current-user`, `/app/info`, `/app/current-user/group-hierarchy` (body `givenByOrganisation: [template-group]`, `modules: []`) | 200 |
| GET/PUT/DELETE `/app/current-user/settings/{key}` | 200 / 204 / 204 (GET of a key never set: 404, the UI handles it) |
| GET `/workflow-module`, `/workflow-module/{id}`, `/usertask/{id}`, `/workflow/{id}` | 200 |
| POST `/workflow/{id}/usertasks?llatcup=true` | 200 |
| POST `/usertask`, `/workflow`, `/current-user/usertask`, `/usertask/count`, `/workflow/count` | 200 |
| PATCH `/usertask/{id}/note`, `/usertask/note`, `/workflow/{id}/note`, `/workflow/note` | 200 |
| PATCH `/usertask/{id}/follow-up-date`, `/usertask/{id}/mark-as-read`, `/usertask/mark-as-read` | 200 |
| PATCH `/usertask/{id}/claim` (also `unclaim=true`), `/usertask/claim`, `/usertask/{id}/assign`, `/usertask/assign?unassign=true` | 200 |
| GET `/notifications/media`, `/notifications/config`, `/notifications/recipient-config`, `/notifications/workflows`; PUT `/notifications/config` | 200 |
| GET `/updates` (SSE, opened by the page) | 200 |
| PUT `/notifications/recipient-config/EMAIL` with an empty body | 404 (not a security block; not explored further) |

## Gaps

- The blueprint applications were not run: their SNAPSHOT dependencies cannot be fetched here (ASK-048). EXT-058 is proven with the conformance modules only; its wording names the blueprints.
- Live updates without reload, scrolling with large data and the header extension of a blueprint were not tried against the real backend.
- `/wm/**` needs no login (a request without a cookie got 200). Not changed (ASK-049).
- The toast of EXT-055 was not tried against the real backend.
- ASK-001 (CUST-002) and ASK-034 (LIVE-021) stay open; S72 and S73 stay `in-progress` because of them.
