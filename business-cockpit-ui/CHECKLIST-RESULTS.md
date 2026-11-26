# Checklist results

Reference 1.0.0, story S73. Suite result: final run of `sh plan/checks/S73.sh` after the last edit: 392 Playwright tests passed, `node --test e2e/*.test.mjs` 88 passed, 0 failed. (An earlier run had COL-016 fail once under load; it passed alone and in the final run.)

Counts: 333 proven, 36 not fully proven (of these 2 have no test at all: EXT-058, CUST-002; LIVE-021 has a comment only), 33 not chosen. Total 402 items.

How this was decided: an item is "proven" when a test names it in its title (Playwright title, node test title, or `@DisplayName` of a backend test) and no question of `plan/QUESTIONS.md` names a gap for it. Titles were matched by script against `npx playwright test --list`; the body of the tests was NOT reopened for every id in S73, and "seen red before green" was not re-checked for all of them (only where a question records it, e.g. ASK-035). The backend tests (`BE-*`, `PKG-004/005/024/036/037`) are Java tests run by the checks of their stories (S04 to S10, S15, S17, S64, S70); S73 did not rerun them (Maven, Docker and Testcontainers). S74 part 1: EXT-040 is proven by `e2e/conformance/kit-conformance.spec.ts` (kit 0.1.0-snapshot.6, commit 7caecd7, 19 checks of the kit's `cockpit.test.js` against the simulator; seen red with the modules not served and with wrong task pages, then green). Everything that needs a running cockpit backend with Keycloak and MongoDB is left for S74.

## Not fully proven

|Id|Question|What is missing|Evidence that exists|
|---|---|---|---|
|PKG-003|ASK-004|UI jar scope test only (Q-HOSTING behind)|e2e/ui-jar.test.mjs:15|
|PKG-004|ASK-004|UI jar scope test only (Q-HOSTING behind)|backend ApplicationStartTest.java:88|
|PKG-005|ASK-004|release build proven; UI jar scope test only (Q-HOSTING behind)|backend BuildAndConfigurationTest.java:104|
|PKG-050|ASK-016|drawAreas beside drawPage, undecided which one pages use|modules/modules.spec.ts:35, modules/modules.spec.ts:45, modules/modules.spec.ts:53 (+1)|
|PKG-059|ASK-005|layout proven; Cache-Control no-cache of index.html belongs to the nginx image (PKG-025)|e2e/bundle-layout.test.mjs:18, e2e/bundle-layout.test.mjs:26|
|BE-004|ASK-027|list controllers proven in the backend; note endpoints of the case list not covered by ListControllersTest|backend ListControllersTest.java:55|
|BE-034|ASK-006|handled at DEBUG by the application; the library still logs a WARN when a tab closes|backend BrowserGoesAwayTest.java:76, backend BrowserGoesAwayTest.java:93|
|TL-029|ASK-009|rows still have own tools beyond the three; ASK-010 wording of bulk claim|tasks/selection.spec.ts:71|
|COL-001|ASK-019|task list only; case list draws no WorkflowList columns|tasks/module-columns.spec.ts:37|
|COL-003|ASK-019|width of a module column is not applied; case list draws no module columns|tasks/module-columns.spec.ts:55|
|COL-022|ASK-020|width set on the header cell only; body cells can still push a column wider|tasks/module-columns.spec.ts:272|
|ACT-012|ASK-010|no wording given for a bulk claim of a task held by a colleague|tasks/row-actions-conflicts.spec.ts:28|
|TF-005|ASK-021|the cut with "..." has no value to show (Q-TASK-HEADER-INFO nothing) and is untested|tasks/task-page.spec.ts:77|
|TF-024|ASK-024|tested for task titles, menu and toggle; case titles were not tested when written; Cross-Origin-Opener-Policy of the backend open|tasks/task-window.spec.ts:134|
|SRCH-018|ASK-007|a leak inside a running page cannot be seen, leaving the list is a page load|tasks/paging.spec.ts:248|
|SRCH-025|ASK-008|proven in Chromium only, Firefox asked for, not installed; scroll bar stops 350 px before the end after a long wheel scroll|tasks/paging.spec.ts:433|
|SRCH-034|ASK-003|no slice of the fixed list; own story S25b|tasks/sorting.spec.ts:166|
|LIVE-021|ASK-034|no list limited to workflow modules exists; no test, premise only|none|
|LIVE-025|ASK-035|premise test only: no list sends workflowModuleIds or businessIds|tasks/live-updates-limits.spec.ts:13|
|EXT-021|ASK-014|test shows the notice for an unknown type; a known type of a module the user may not see and EXTERNAL rows are not opened (ASK-014, ASK-021)|modules/loading.spec.ts:60|
|EXT-023|ASK-036|toast look minimal, not a Vuetify component|modules/extension-parts.spec.ts:118|
|EXT-034|ASK-015|names a conformance module of the kit; the kit's modules now run in conformance/kit-conformance.spec.ts (EXT-040), the test module of this entry is still the repository's own|modules/parts.spec.ts:89|
|EXT-041|ASK-016|areas proven partly; see ASK-016 and ASK-021|modules/parts.spec.ts:220, modules/parts.spec.ts:235|
|EXT-043|ASK-016|second half (a page loads its entries when shown) added by task page stories; name check of cockpit.openDialog not built|modules/parts.spec.ts:275|
|EXT-044|ASK-016|name check of cockpit.openDialog is not built|modules/parts.spec.ts:297|
|EXT-047|ASK-014|files of an old build are not dropped|modules/parts.spec.ts:367|
|EXT-048|ASK-017|proven on the header only, the menu has no parts|modules/parts.spec.ts:410|
|EXT-055|ASK-018|dialog and toast proven on the simulator and in cockpit code, not against the backend|modules/protocol.spec.ts:120, modules/protocol.spec.ts:76|
|EXT-058|ASK-046|needs a running backend with the blueprints; carried over to S74|none|
|EXT-059|ASK-018|proven on the TypeScript simulator only; the /wm proxy of the backend is missing (carry-over S74 with EXT-058)|modules/protocol.spec.ts:195|
|DS-006|ASK-036|toast look minimal, not a Vuetify component|dev-shell/dev-shell.spec.ts:104|
|DS-011|ASK-042|part gets currentUser {id} only, because DS-011 forbids GET /app/current-user|dev-shell/dev-shell.spec.ts:162|
|DS-018|ASK-043|task page area body only, React test module has no style element in its shadow root|compare/compare.spec.ts:44|
|DS-019|ASK-043|as DS-018|compare/compare.spec.ts:58|
|DS-024|ASK-044|proven against the TypeScript simulator only; no Java dev shell simulator here|dev-shell/dev-shell.spec.ts:361|
|CUST-002|ASK-001|blocked by open ASK-001, nothing built, no test|none|

Also open and affecting no single id: ASK-002 (placeholders), ASK-011 to ASK-013 (test modules, partial kit protocol, Angular JIT build), ASK-025 to ASK-033 (limits of the task page, case list and live list), ASK-038, ASK-039 to ASK-044 (notifications, dev shell gaps), ASK-045 (nothing published, Maven upload tested against a local server), ASK-047 (what S73 did not do). Ids whose test was only seen to pass: not recorded; treat every test not named in a question as "seen green, red not re-checked in S73".

## Not chosen

|Id|Reason (Applies column of CHECKLIST.md)|
|---|---|
|PKG-012|not chosen: Q-HOSTING|
|PKG-013|not chosen: Q-HOSTING|
|PKG-038|not chosen: Q-BACKEND|
|PKG-058|not chosen: Q-AVATARS|
|PKG-060|not chosen: Q-HOSTING|
|BE-009|not chosen: Q-LOGIN-KIND|
|BE-015|not chosen: Q-KAFKA|
|BE-021|not chosen: Q-AVATARS|
|BE-022|not chosen: Q-AVATARS|
|BE-023|not chosen: Q-AVATARS|
|BE-026|not chosen: Q-USER-DIRECTORY|
|BE-029|not chosen: Q-AVATARS|
|BE-030|not chosen: Q-DASHBOARD|
|AUTH-001|not chosen: Q-HOSTING|
|NAV-005|not chosen: Q-DASHBOARD|
|NAV-007|not chosen: Q-SUB-LISTS|
|NAV-008|not chosen: Q-VISIBLE-GROUPS|
|NAV-017|not chosen: Q-EXTENSION-POINTS|
|NAV-018|not chosen: Q-SUB-LISTS|
|NAV-023|not chosen: Q-AVATARS|
|NAV-024|not chosen: Q-AVATARS|
|NAV-025|not chosen: Q-AVATARS|
|NAV-026|not chosen: Q-AVATARS|
|NAV-033|not chosen: Q-DASHBOARD|
|TL-026|not chosen: Q-FOLLOW-UP, Q-CLOSED-TASKS|
|TL-027|not chosen: Q-STATE-MARKERS|
|COL-014|not chosen: Q-MODULE-COLUMNS|
|ACT-014|not chosen: Q-LIVE-MODE|
|TF-036|not chosen: Q-CLAIM|
|WL-011|not chosen: Q-STATE-MARKERS|
|LIVE-008|not chosen: Q-LIVE-MODE|
|LIVE-009|not chosen: Q-LIVE-MODE|
|EXT-017|not chosen: Q-EXTENSION-POINTS|

## Proven

|Id|Test|
|---|---|
|PKG-002|e2e/repository.test.mjs:74|
|PKG-006|e2e/module-kit.test.mjs:18, e2e/module-kit.test.mjs:26|
|PKG-008|e2e/repository.test.mjs:203|
|PKG-009|e2e/module-kit.test.mjs:72|
|PKG-011|e2e/publish-jars.test.mjs:104, e2e/publish-jars.test.mjs:115, e2e/publish-jars.test.mjs:126 (+2)|
|PKG-014|e2e/repository.test.mjs:195|
|PKG-017|e2e/module-kit.test.mjs:35|
|PKG-019|e2e/repository.test.mjs:58, e2e/repository.test.mjs:68|
|PKG-020|e2e/module-kit.test.mjs:84|
|PKG-024|backend UserInterfaceBehindTest.java:102, backend UserInterfaceBehindTest.java:82, backend UserInterfaceBehindTest.java:92|
|PKG-025|e2e/nginx-image.test.mjs:39, e2e/nginx-image.test.mjs:52, e2e/nginx-image.test.mjs:63 (+1)|
|PKG-032|e2e/renovate.test.mjs:14, e2e/renovate.test.mjs:23, e2e/renovate.test.mjs:40|
|PKG-033|e2e/module-kit.test.mjs:48, e2e/module-kit.test.mjs:61, e2e/module-kit.test.mjs:65|
|PKG-034|e2e/dev-shell-packages.test.mjs:21|
|PKG-035|e2e/repository.test.mjs:37|
|PKG-036|backend UiUriTypesTest.java:36, backend UiUriTypesTest.java:56, backend UiUriTypesTest.java:65|
|PKG-037|backend UiUriTypesTest.java:74, backend UiUriTypesTest.java:87|
|PKG-039|e2e/module-kit.test.mjs:102, e2e/module-kit.test.mjs:111, e2e/module-kit.test.mjs:116 (+3)|
|PKG-040|e2e/module-kit-entries.test.mjs:84, e2e/module-kit-entries.test.mjs:95|
|PKG-041|e2e/module-kit-entries.test.mjs:29, e2e/module-kit-entries.test.mjs:40, e2e/module-kit-entries.test.mjs:50|
|PKG-042|e2e/module-kit-entries.test.mjs:56, e2e/module-kit-entries.test.mjs:66, e2e/module-kit-entries.test.mjs:75|
|PKG-043|e2e/module-kit-entries.test.mjs:103, e2e/module-kit-entries.test.mjs:117|
|PKG-044|e2e/repository.test.mjs:25, e2e/repository.test.mjs:32|
|PKG-045|e2e/repository.test.mjs:44, e2e/repository.test.mjs:49|
|PKG-046|e2e/repository.test.mjs:155, e2e/repository.test.mjs:161, e2e/repository.test.mjs:174|
|PKG-047|e2e/repository.test.mjs:129, e2e/repository.test.mjs:148|
|PKG-048|e2e/module-kit-entries.test.mjs:124|
|PKG-049|e2e/module-kit-entries.test.mjs:144, e2e/module-kit-entries.test.mjs:154|
|PKG-051|e2e/module-kit-names.test.mjs:15, e2e/module-kit-names.test.mjs:23|
|PKG-052|e2e/repository.test.mjs:209|
|PKG-053|e2e/module-kit-names.test.mjs:30, e2e/module-kit-names.test.mjs:39|
|PKG-054|e2e/simulator.test.mjs:20, e2e/simulator.test.mjs:26, e2e/simulator.test.mjs:32 (+5)|
|PKG-055|e2e/repository.test.mjs:107, e2e/repository.test.mjs:112, e2e/repository.test.mjs:119|
|PKG-056|e2e/module-kit-names.test.mjs:54, e2e/module-kit-names.test.mjs:64, modules/modules.spec.ts:35 (+2)|
|PKG-057|e2e/module-kit-names.test.mjs:73|
|PKG-061|readme/readme.spec.ts:10|
|PKG-062|e2e/repository.test.mjs:82|
|PKG-063|e2e/repository.test.mjs:296, e2e/repository.test.mjs:303, e2e/repository.test.mjs:311 (+1)|
|PKG-064|e2e/repository.test.mjs:326, e2e/repository.test.mjs:330, e2e/repository.test.mjs:340 (+1)|
|BE-001|backend BuildAndConfigurationTest.java:33, backend BuildAndConfigurationTest.java:43|
|BE-002|backend BuildAndConfigurationTest.java:92|
|BE-003|backend BuildAndConfigurationTest.java:142|
|BE-005|backend LoginTest.java:107|
|BE-006|backend ApplicationStartTest.java:63|
|BE-007|backend LoginTest.java:76|
|BE-008|backend LoginTest.java:97|
|BE-010|backend LoginTest.java:128|
|BE-011|backend LoginTest.java:149|
|BE-012|backend DockerComposeTest.java:24, backend DockerComposeTest.java:31, backend DockerComposeTest.java:42 (+1)|
|BE-013|backend DockerComposeTest.java:65, backend DockerComposeTest.java:76|
|BE-014|backend BuildAndConfigurationTest.java:151|
|BE-016|backend NotificationMailTest.java:63|
|BE-017|backend ApplicationStartTest.java:105, backend ApplicationStartTest.java:115|
|BE-018|readme/readme.spec.ts:22|
|BE-019|readme/readme.spec.ts:36|
|BE-020|backend IntegrationTestsRuleTest.java:18|
|BE-024|backend BuildAndConfigurationTest.java:53, backend BuildAndConfigurationTest.java:63|
|BE-025|backend BuildAndConfigurationTest.java:80|
|BE-027|backend BuildAndConfigurationTest.java:255|
|BE-028|backend BuildAndConfigurationTest.java:122|
|BE-031|backend ApplicationStartTest.java:99, backend UserInterfaceRouteTest.java:102, backend UserInterfaceRouteTest.java:114 (+2)|
|BE-032|backend LogoutTest.java:55|
|BE-033|backend BrowserGoesAwayTest.java:93|
|AUTH-002|auth/auth.spec.ts:18|
|AUTH-003|auth/auth.spec.ts:33|
|AUTH-004|auth/auth.spec.ts:39|
|AUTH-005|auth/auth.spec.ts:52|
|AUTH-006|auth/auth.spec.ts:64|
|AUTH-007|auth/auth.spec.ts:115, backend LogoutTest.java:80|
|AUTH-008|auth/auth.spec.ts:76|
|AUTH-009|auth/auth.spec.ts:88|
|AUTH-010|auth/auth.spec.ts:104|
|NAV-001|tasks/tasks.spec.ts:37|
|NAV-002|tasks/tasks.spec.ts:46|
|NAV-003|cases/case-list.spec.ts:47|
|NAV-004|cases/case-page.spec.ts:82|
|NAV-006|frame/frame.spec.ts:19|
|NAV-009|frame/frame.spec.ts:32|
|NAV-010|frame/frame.spec.ts:46|
|NAV-011|frame/frame.spec.ts:91|
|NAV-013|frame/frame.spec.ts:113|
|NAV-014|language/translated-paths.spec.ts:21|
|NAV-015|language/translated-paths.spec.ts:35|
|NAV-016|language/translated-paths.spec.ts:48|
|NAV-019|frame/rights.spec.ts:26|
|NAV-020|frame/rights.spec.ts:66|
|NAV-021|frame/rights.spec.ts:85|
|NAV-022|frame/rights.spec.ts:107|
|NAV-027|frame/rights.spec.ts:128|
|NAV-028|language/translated-paths.spec.ts:61|
|NAV-029|frame/frame.spec.ts:126|
|NAV-030|frame/rights.spec.ts:146|
|NAV-031|language/language.spec.ts:14|
|NAV-032|language/language.spec.ts:31|
|TL-001|tasks/status-line.spec.ts:40|
|TL-002|tasks/status-line.spec.ts:65|
|TL-003|tasks/status-line.spec.ts:80|
|TL-005|tasks/status-line.spec.ts:98|
|TL-006|tasks/status-line.spec.ts:119|
|TL-007|tasks/row-look.spec.ts:25|
|TL-008|tasks/tasks.spec.ts:56|
|TL-009|tasks/status-line.spec.ts:137|
|TL-010|tasks/closed-and-follow-up.spec.ts:25|
|TL-011|tasks/selection.spec.ts:35, tasks/selection.spec.ts:49|
|TL-012|tasks/tasks.spec.ts:76|
|TL-013|tasks/tasks.spec.ts:92|
|TL-014|tasks/row-actions.spec.ts:28|
|TL-015|tasks/tasks.spec.ts:105|
|TL-016|tasks/tasks.spec.ts:122|
|TL-017|tasks/row-actions.spec.ts:69|
|TL-018|tasks/tasks.spec.ts:135|
|TL-019|tasks/selection.spec.ts:124|
|TL-021|tasks/closed-and-follow-up.spec.ts:41|
|TL-022|tasks/task-page.spec.ts:45|
|TL-023|tasks/row-look.spec.ts:35|
|TL-024|tasks/tasks.spec.ts:156|
|TL-025|tasks/row-actions.spec.ts:97, tasks/selection.spec.ts:124|
|TL-028|tasks/closed-and-follow-up.spec.ts:60|
|TL-030|tasks/selection.spec.ts:91|
|TL-031|tasks/selection.spec.ts:111|
|TL-032|tasks/tasks.spec.ts:170|
|TL-033|tasks/tasks.spec.ts:254|
|COL-004|tasks/module-columns.spec.ts:72|
|COL-005|tasks/module-columns.spec.ts:104, tasks/module-columns.spec.ts:88|
|COL-006|tasks/module-columns.spec.ts:112, tasks/module-columns.spec.ts:131|
|COL-007|tasks/module-columns.spec.ts:140|
|COL-008|tasks/module-columns.spec.ts:157|
|COL-009|tasks/module-columns.spec.ts:172|
|COL-010|tasks/module-columns.spec.ts:193|
|COL-011|tasks/module-columns.spec.ts:202|
|COL-012|tasks/module-columns.spec.ts:211|
|COL-013|tasks/module-columns.spec.ts:227|
|COL-015|tasks/tasks.spec.ts:185|
|COL-016|tasks/module-columns.spec.ts:237|
|COL-017|tasks/tasks.spec.ts:195|
|COL-018|tasks/tasks.spec.ts:212|
|COL-019|tasks/tasks.spec.ts:222|
|COL-020|tasks/module-columns.spec.ts:247|
|COL-021|tasks/tasks.spec.ts:234|
|ACT-001|tasks/row-actions.spec.ts:45|
|ACT-003|tasks/row-actions.spec.ts:57|
|ACT-004|tasks/row-actions.spec.ts:85|
|ACT-005|tasks/row-actions-more.spec.ts:28|
|ACT-006|tasks/row-actions-more.spec.ts:40|
|ACT-007|tasks/row-actions-more.spec.ts:56, tasks/selection.spec.ts:124, tasks/selection.spec.ts:171|
|ACT-008|tasks/row-actions-more.spec.ts:75|
|ACT-009|tasks/row-actions-more.spec.ts:90, tasks/selection.spec.ts:171|
|ACT-010|tasks/row-actions-more.spec.ts:109|
|ACT-013|tasks/row-actions-conflicts.spec.ts:60|
|ACT-015|tasks/row-actions-conflicts.spec.ts:79|
|ACT-016|tasks/row-actions-conflicts.spec.ts:91|
|ACT-017|tasks/row-actions-conflicts.spec.ts:113|
|ACT-018|tasks/selection.spec.ts:171|
|ACT-019|tasks/task-page.spec.ts:127|
|TF-001|tasks/task-page.spec.ts:33|
|TF-004|tasks/task-page.spec.ts:60|
|TF-006|tasks/task-page.spec.ts:113, tasks/task-page.spec.ts:85|
|TF-007|tasks/task-window.spec.ts:40|
|TF-008|tasks/task-page-areas.spec.ts:31|
|TF-011|tasks/task-page-changes.spec.ts:21|
|TF-013|cases/case-page.spec.ts:96|
|TF-014|notifications/notifications.spec.ts:22|
|TF-016|tasks/task-page-areas.spec.ts:60|
|TF-017|tasks/task-window.spec.ts:55, tasks/task-window.spec.ts:74, tasks/task-window.spec.ts:89|
|TF-018|tasks/task-window.spec.ts:101, tasks/task-window.spec.ts:115, tasks/task-window.spec.ts:123|
|TF-019|tasks/task-page-areas.spec.ts:98|
|TF-020|modules/loading.spec.ts:114, tasks/task-page-areas.spec.ts:112|
|TF-022|modules/protocol.spec.ts:211, modules/protocol.spec.ts:231, tasks/task-page-areas.spec.ts:71 (+1)|
|TF-023|tasks/task-page-areas.spec.ts:120, tasks/task-page-areas.spec.ts:131|
|TF-025|tasks/task-page-loading.spec.ts:47|
|TF-026|tasks/task-page-loading.spec.ts:102, tasks/task-page-loading.spec.ts:114, tasks/task-page-loading.spec.ts:68 (+2)|
|TF-027|tasks/task-page-loading.spec.ts:127, tasks/task-page-loading.spec.ts:139|
|TF-029|tasks/task-page-loading.spec.ts:152, tasks/task-page-loading.spec.ts:163|
|TF-030|tasks/task-page-barrier.spec.ts:65|
|TF-031|tasks/task-page-barrier.spec.ts:86|
|TF-035|tasks/task-page-barrier.spec.ts:35, tasks/task-page-barrier.spec.ts:51|
|TF-037|tasks/task-page-changes.spec.ts:41|
|TF-038|tasks/task-page-barrier.spec.ts:102|
|TF-039|tasks/task-page-loading.spec.ts:175|
|TF-040|tasks/task-page-loading.spec.ts:196|
|TF-041|tasks/task-page-look.spec.ts:33|
|TF-042|tasks/task-page-look.spec.ts:65|
|TF-043|tasks/task-page-barrier.spec.ts:121, tasks/task-page-barrier.spec.ts:136|
|TF-044|tasks/task-page-barrier.spec.ts:143, tasks/task-page-barrier.spec.ts:157|
|TF-045|tasks/task-window.spec.ts:148|
|WL-001|cases/case-list.spec.ts:66|
|WL-002|cases/case-list.spec.ts:89|
|WL-003|cases/case-list.spec.ts:112|
|WL-004|cases/case-list.spec.ts:129|
|WL-005|cases/case-list.spec.ts:142|
|WL-006|cases/case-list.spec.ts:154|
|WL-007|cases/case-list.spec.ts:174|
|WL-008|cases/case-list.spec.ts:201|
|WL-009|cases/case-list.spec.ts:222, cases/case-list.spec.ts:280|
|WL-010|cases/case-list.spec.ts:231|
|WL-012|cases/case-list.spec.ts:250|
|WL-013|cases/case-list.spec.ts:260|
|WP-001|cases/case-page.spec.ts:106|
|WP-003|cases/case-page.spec.ts:119|
|WP-007|cases/case-page.spec.ts:128|
|WP-008|cases/case-page.spec.ts:147|
|WP-009|cases/case-page-more.spec.ts:47|
|WP-010|cases/case-page-more.spec.ts:108, cases/case-page-more.spec.ts:58, cases/case-page-more.spec.ts:77 (+1)|
|WP-011|cases/case-page-more.spec.ts:116|
|WP-012|cases/case-page-more.spec.ts:127, cases/case-page-more.spec.ts:139|
|WP-014|cases/case-page-more.spec.ts:159|
|WP-015|cases/case-page-more.spec.ts:196|
|SRCH-001|tasks/search.spec.ts:29|
|SRCH-002|tasks/search.spec.ts:45|
|SRCH-003|tasks/search.spec.ts:67|
|SRCH-004|tasks/search.spec.ts:80|
|SRCH-005|tasks/search.spec.ts:102|
|SRCH-006|tasks/search.spec.ts:127|
|SRCH-007|tasks/sorting.spec.ts:29|
|SRCH-008|tasks/sorting.spec.ts:53|
|SRCH-009|tasks/sorting.spec.ts:77|
|SRCH-010|tasks/paging.spec.ts:58|
|SRCH-011|tasks/paging.spec.ts:45|
|SRCH-012|tasks/paging.spec.ts:30|
|SRCH-013|tasks/paging.spec.ts:110|
|SRCH-014|tasks/paging.spec.ts:86|
|SRCH-015|tasks/paging.spec.ts:174|
|SRCH-016|tasks/paging.spec.ts:214|
|SRCH-017|tasks/paging.spec.ts:227|
|SRCH-019|tasks/paging.spec.ts:267|
|SRCH-020|tasks/paging.spec.ts:281|
|SRCH-021|tasks/paging.spec.ts:340|
|SRCH-022|tasks/paging.spec.ts:357|
|SRCH-023|tasks/paging.spec.ts:379, tasks/paging.spec.ts:401|
|SRCH-024|tasks/paging.spec.ts:409, tasks/paging.spec.ts:423|
|SRCH-026|tasks/sorting.spec.ts:98|
|SRCH-027|tasks/sorting.spec.ts:115|
|SRCH-028|tasks/paging.spec.ts:452|
|SRCH-029|tasks/paging-timers.spec.ts:124, tasks/paging-timers.spec.ts:148, tasks/paging-timers.spec.ts:41 (+3)|
|SRCH-030|tasks/paging-timers.spec.ts:159, tasks/paging-timers.spec.ts:169|
|SRCH-031|tasks/memory-measurement.spec.ts:43|
|SRCH-032|tasks/paging-timers.spec.ts:177, tasks/paging-timers.spec.ts:191|
|SRCH-033|tasks/sorting.spec.ts:147|
|LIVE-001|tasks/live-updates.spec.ts:26|
|LIVE-002|tasks/live-updates.spec.ts:37|
|LIVE-003|tasks/live-updates.spec.ts:57|
|LIVE-004|tasks/live-updates.spec.ts:72|
|LIVE-005|tasks/live-updates-more.spec.ts:30|
|LIVE-006|tasks/live-updates-more.spec.ts:55|
|LIVE-007|tasks/live-updates-more.spec.ts:66|
|LIVE-010|tasks/live-updates-more.spec.ts:86|
|LIVE-011|tasks/live-updates-more.spec.ts:103|
|LIVE-012|tasks/live-updates-more.spec.ts:114|
|LIVE-013|tasks/live-updates-resilience.spec.ts:32, tasks/live-updates-resilience.spec.ts:49|
|LIVE-014|tasks/live-updates-resilience.spec.ts:73|
|LIVE-015|tasks/live-updates-resilience.spec.ts:92|
|LIVE-016|tasks/live-updates-resilience.spec.ts:110|
|LIVE-017|tasks/live-updates-resilience.spec.ts:128|
|LIVE-018|tasks/live-updates-resilience.spec.ts:137|
|LIVE-019|tasks/live-updates-stream.spec.ts:33|
|LIVE-020|tasks/live-updates-stream.spec.ts:46|
|LIVE-022|tasks/live-updates-stream.spec.ts:67|
|LIVE-023|tasks/live-updates-stream.spec.ts:83|
|LIVE-024|tasks/live-updates-stream.spec.ts:101, tasks/live-updates-stream.spec.ts:122|
|EXT-005|modules/modules.spec.ts:106|
|EXT-007|modules/modules.spec.ts:126|
|EXT-008|modules/modules.spec.ts:132|
|EXT-009|modules/modules.spec.ts:141|
|EXT-010|modules/modules.spec.ts:149|
|EXT-011|modules/modules.spec.ts:166|
|EXT-012|modules/extension-parts.spec.ts:51|
|EXT-013|modules/extension-parts.spec.ts:70|
|EXT-014|modules/extension-parts.spec.ts:85|
|EXT-016|modules/loading.spec.ts:23|
|EXT-018|modules/extension-parts.spec.ts:97|
|EXT-019|modules/loading.spec.ts:48|
|EXT-024|modules/page-dialogs.spec.ts:25|
|EXT-026|modules/loading.spec.ts:71|
|EXT-027|modules/loading.spec.ts:91|
|EXT-029|modules/loading.spec.ts:102|
|EXT-031|modules/parts.spec.ts:48|
|EXT-033|modules/parts.spec.ts:62|
|EXT-035|modules/parts.spec.ts:114|
|EXT-036|modules/parts.spec.ts:139, modules/parts.spec.ts:159|
|EXT-037|modules/parts.spec.ts:170, modules/parts.spec.ts:186|
|EXT-039|modules/page-dialogs.spec.ts:91|
|EXT-040|conformance/kit-conformance.spec.ts:61|
|EXT-042|modules/page-dialogs.spec.ts:104|
|EXT-045|modules/parts.spec.ts:322|
|EXT-046|modules/parts.spec.ts:341|
|EXT-049|modules/parts.spec.ts:438|
|EXT-050|modules/parts.spec.ts:457|
|EXT-051|modules/parts.spec.ts:480|
|EXT-052|modules/parts.spec.ts:497|
|EXT-053|modules/parts.spec.ts:508|
|EXT-054|modules/protocol.spec.ts:59|
|EXT-056|modules/protocol.spec.ts:132, modules/protocol.spec.ts:162|
|EXT-057|modules/protocol.spec.ts:173|
|EXT-060|modules/extension-parts.spec.ts:136|
|SET-001|settings/settings.spec.ts:29|
|SET-002|settings/settings.spec.ts:45|
|SET-003|language/translated-paths.spec.ts:97|
|SET-004|settings/settings.spec.ts:59|
|SET-005|settings/settings.spec.ts:68|
|SET-006|settings/settings.spec.ts:79|
|I18N-001|language/language.spec.ts:52|
|I18N-002|language/language.spec.ts:65|
|I18N-003|language/translated-paths.spec.ts:72|
|I18N-004|language/language.spec.ts:73|
|I18N-005|language/language.spec.ts:82|
|I18N-006|language/language-files.spec.ts:25, language/language-files.spec.ts:33|
|I18N-007|tasks/paging.spec.ts:100|
|I18N-008|language/toasts.spec.ts:37|
|NOTI-001|notifications/notifications.spec.ts:38|
|NOTI-002|notifications/notifications.spec.ts:51|
|NOTI-003|notifications/notifications.spec.ts:89|
|DS-001|e2e/dev-shell-packages.test.mjs:12|
|DS-002|dev-shell/dev-shell.spec.ts:22|
|DS-003|dev-shell/dev-shell.spec.ts:36|
|DS-004|dev-shell/dev-shell.spec.ts:48|
|DS-005|dev-shell/dev-shell.spec.ts:68|
|DS-007|dev-shell/dev-shell.spec.ts:123|
|DS-008|dev-shell/dev-shell.spec.ts:136|
|DS-009|dev-shell/dev-shell.spec.ts:148|
|DS-010|dev-shell/dev-shell.spec.ts:453|
|DS-012|dev-shell/dev-shell.spec.ts:175|
|DS-013|dev-shell/dev-shell.spec.ts:196|
|DS-014|dev-shell/dev-shell.spec.ts:220|
|DS-015|dev-shell/dev-shell.spec.ts:236|
|DS-016|dev-shell/dev-shell.spec.ts:442|
|DS-017|dev-shell/dev-shell.spec.ts:250|
|DS-020|dev-shell/dev-shell.spec.ts:262|
|DS-021|dev-shell/dev-shell.spec.ts:277|
|DS-022|dev-shell/dev-shell.spec.ts:312|
|DS-023|dev-shell/dev-shell.spec.ts:342, e2e/dev-shell-settings.test.mjs:7|
|DS-025|dev-shell/dev-shell.spec.ts:385|
|DS-026|dev-shell/dev-shell.spec.ts:411|
|CUST-001|customer/customer.spec.ts:13, e2e/repository.test.mjs:311|
