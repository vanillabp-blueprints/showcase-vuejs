# Questions

## ASK-001 How do workflow modules draw cells of a list themselves?

Story: S72 (CUST-002)
Date: 2026-11-25
Default taken: nothing is generated; `Q-CELL-RENDERING` was answered yes, but the skill says the feature is open and not described yet (module-loading.md, "Cells drawn by a workflow module").
Why this default: the skill gives no rules to build it from.
Answer: open

## ASK-002 Which Maven group, Java package and npm scope are real?

Story: S01
Date: 2026-11-25
Default taken: the placeholders `com.acme`, `com.acme.cockpit` and `@acme` stay (the user kept them).
Why this default: the user decided to keep placeholders.
Answer: no change wanted (2026-11-25)

## ASK-003 SRCH-034 is in no slice of the fixed list

Story: S25b
Date: 2026-11-25
Default taken: SRCH-034 got its own story S25b right after S25, not added to `plan/slices.txt`.
Why this default: the skill's fixed list leaves out this id; the split rule allows a `b` story.
Answer: open

## ASK-004 Does the UI jar belong in the backend when the user interface runs behind nginx?

Story: S05
Date: 2026-11-25
Default taken: `com.acme:business-cockpit-ui` is a dependency of `application` with scope `test`, so the runnable jar embeds no user interface (`Q-HOSTING` is `behind`) while PKG-003 to PKG-005 (applies: always) are proven.
Why this default: project.md says `behind` needs no UI jar; the checklist says the UI jar items always apply.
Answer: open

## ASK-005 Who proves that index.html is sent with no-cache?

Story: S06 (PKG-059)
Date: 2026-11-25
Default taken: S06 proves the bundle layout (index.html at the root, all else below `/assets/`). The header `Cache-Control: no-cache` is set by the nginx configuration, so it is proven where the nginx image is built (PKG-012, PKG-025), not in S06.
Why this default: with `Q-HOSTING` `behind` the backend serves no file itself and no nginx image exists yet.
Answer: open

## ASK-006 The library warns when an update stream's client is gone

Story: S10 (BE-034)
Date: 2026-11-25
Default taken: nothing; the application handles `AsyncRequestNotUsableException` at `DEBUG`, but `UpdateStreams` of the library 0.9.0-SNAPSHOT still logs a WARN "Could not SSE send confirmation, client might stuck" when a tab closes.
Why this default: the line comes from the library, not from a handler the application can replace; lowering its logger would hide other warnings (backend.md forbids that).
Answer: open

## ASK-007 Leaving the list is a page load, so SRCH-018 cannot see a leak of the list component

Story: S27 (SRCH-018)
Date: 2026-11-25
Default taken: the test opens `/tasks`, goes to `/cases` and back by address; heap and DOM nodes after the second leaving are within 10 % of the first. The list component is never unmounted inside a running page because the menu links reload the page.
Why this default: the interview gives no in-app routing; adding a router is outside this story.
Answer: open

## ASK-008 SRCH-025 asks for Firefox, but the test setup has Chromium only

Story: S28 (SRCH-025)
Date: 2026-11-25
Default taken: the test with 1,000,000 entries runs in Chromium and reaches the notice row; no Firefox project exists in `playwright.config.ts` and no Firefox is installed. Also unresolved: in Chromium, after a long wheel scroll through a list of 100,000 rows (4.6 million pixels), a jump or more wheel turns stop the scroll bar about 350 px before the end, because `scrollHeight` changes by a few hundred pixels while rows are drawn there. The notice row is then out of reach. The test therefore reaches the end from a list opened afresh, where it works. The cause is not found; a row height that differs from 46 px or a stale scroll range of the browser are the suspects.
Why this default: installing a second browser and a second Playwright project is outside this story; the cap is 100,000 rows of 46 px, far below the 17.9 million pixels of Firefox.
Answer: open

Update S29 (SRCH-032): two suspects are ruled out. A real row and a placeholder row are exactly 46 px (test SRCH-032), and with 1,000,000 pretended entries `scrollHeight` stays at 4,600,138 px (92 px head + 100,000 rows + notice row) over six jumps from 20 % to 95 %, with the two spacers adding up each time. The jump does not reproduce the stop; only a long wheel scroll did. Still open: the cause. Next idea: log `scrollHeight` and `scrollTop` after every wheel event of a 10 second wheel scroll.

## ASK-009 Rows still have tools of their own, though a row should have only three

Story: S30 (TL-029)
Date: 2026-11-25
Default taken: the row tools of S21 and S22 (mark read/unread, follow-up) stay, with their tests, and the toolbar adds the same actions for the selection. Propose and note stay in the row as well (candidate cell, note cell).
Why this default: behaviour.md says a row has only claim, remove candidate and note; removing the row tools would rewrite tests of two finished stories and is outside S30.
Answer: open

## ASK-010 Bulk claim over a task held by a colleague

Story: S30 (ACT-018, ACT-012)
Date: 2026-11-25
Default taken: after the ended/suspended question, a bulk claim asks one more question ("Some of the selected tasks are held by colleagues. Claim them anyway?") when a selected task has another assignee; the single claim question names the holder, this one cannot.
Why this default: ACT-012 says claiming asks first every time; the checklist gives no wording for several tasks.
Answer: open

Update ASK-007 (S30, TL-031): switching lists is a page load, so the test of TL-031 passes through the reload; `open()` drops the selection too, but no test can fail on it.

## ASK-011 The three test modules do not exist yet, so PKG-040 cannot run against them

PKG-040 names the three test modules and the conformance modules. They are built in S33 (PKG-056). In S32 the check is proven on synthetic modules and over every `bc-manifest.json` found in the repository (none yet). Whoever builds `e2e/modules/` in S33 must make `bc-check-entries` run over them, and the PKG-040 test then stops being vacuous.

Resolved in S33: `e2e/modules/build.mjs` runs `bc-check-entries` on each module and the PKG-040 test scans the built manifests (run `npm run build` first).

## ASK-012 The event protocol of the module kit is only partly built

S33 built `requestFromCockpit`, `rejectOpenRequests`, `defineBcElement`, the event and manifest constants and the manifest functions. Not built: `sendTo`, `receiveMessage`, `showNotification`, `openDialog`, `closeDialog`, `toBcUserTask`, `toBcWorkflow`, the host side of the protocol (answering `bc-request`), the manifest re-read after a minute and the registry. The stories of the EXT block (loading parts into the cockpit) must build them; none of the five ids of S33 asks for them.

## ASK-013 The Angular test module is built with esbuild in JIT mode

`e2e/modules/angular-module` uses `@angular/compiler` at run time (JIT) and esbuild with decorators, not `ng build`. It runs in the newest Angular (22.3.0) and passes the end-to-end test, but the build is not the AOT build of the Angular CLI. Decide in a later story whether the module must be built with `ng build`.

## ASK-014 The registry and the loader are partly built, the cockpit has no page for one row yet

S35 built the registry (`createModuleRegistry`: one `GET /workflow-module`, one `GET /workflow-module/{id}` for a late module), the opening of a row by `uiUriType`, and the Header in the app bar. The loader still reads each manifest once per session: the re-read after a minute and dropping an old build (module-loading.md, "A new build of a module") are unbuilt. `EXTERNAL` rows are recognised but not opened. A row of a known type whose module the user may not see counts as "cannot be opened here". A row without `uiUriType` gets neither a load nor a notice, because the rows of earlier tests carry none; the real GUI API always sends one. Later EXT stories should decide whether to treat the missing type as unknown too.

## ASK-015 The part of a page for user tasks and cases does not exist yet, so EXT-035 and EXT-037 are proven on the header and on the host

S36 built `ModulePart.vue` (ask, load, draw, notes, retry) and uses it in the header only. The cockpit has no page of a user task or a case yet. EXT-035 (a form's visual entry loads only when shown) is tested on the host with a fake module; EXT-037 is tested through the header. The page of a user task must use `ModulePart` and repeat both tests there. Also open: EXT-034 names a conformance module of the kit, which does not exist yet (the three test modules are covered); the earlier-build note ("the module was updated", reload button) of the table in module-loading.md is unbuilt (ASK-014).

## ASK-016 EXT-043, EXT-044 and the areas of EXT-041 are proven without the pages and dialogs they belong to

S37 built `drawPage` in the module host (areas of the cockpit, else `all`) and the check of names against the longer prefixes of the registry. Nothing in the cockpit calls `drawPage` yet, because the page of a user task or a case does not exist (ASK-015). The name check of `cockpit.openDialog` is not built: there is no `openDialog` action nor a dialog (ASK-012). EXT-043 is tested on the rows of the list (hover and focus load no file); its second half (a page loads its entries when shown) needs the page. EXT-047 re-reads the manifest but does not yet drop the files of an old build when the manifest changed (ASK-014). `drawAreas` (one ask for each area, used by PKG-050 tests) stays beside `drawPage`; decide which one the pages use.

## ASK-017 EXT-048 is proven on the header only, the menu has no parts yet

S38 built the new-build path: the loader tells its users (`onNewBuild`), the header looks for a new build when the page gets focus or becomes visible (no timer: AUTH-006 forbids background requests) and its parts ask again. The menu (`Pages` entry) does not exist in the cockpit yet, so only the header asks again; a part of a page stays as it is. A module without a hash or `?v=` in its manifest files gets the old data entry again after a new build, because `import()` keeps the address (module-loading.md accepts this). The files of the old build are still not dropped (ASK-014).

## ASK-018 The proxy of EXT-059 and the dialog and toast of EXT-055 are proven on the simulator and in the cockpit code, not on the backend

S39 built the answer to every action of the minimum set (`minimumActions` in the host, `cockpitActions` in `packages/ui/src/modules/actions.ts`), the messages between areas (`createPage`, `NO_TARGET`), the properties and functions of every part, and `sendTo`, `receiveMessage`, `showNotification`, `openDialog`, `closeDialog` in the kit (rest of ASK-012; `toBcUserTask` and `toBcWorkflow` are still unbuilt). EXT-059 is proven on the simulator, which stands in for the proxy under `/wm/<id>/` (ETag, Last-Modified, gzip, 304). The backend has no `/wm` route in this repository; the proxy of the business-cockpit library must pass the four headers on, which needs a test against the real container. The toast is a plain element and the dialog a native `<dialog>`; the look of toasts (EXT-023, DS-006) and the pages for a user task and a case (`/tasks/<id>`, `/workflows/<id>`; the actions only navigate there, ASK-015) are not built. `workflow.getUserTasks` asks for all tasks of the case and filters `activeOnly` in the browser. A part is not told when a toast or dialog closes by leaving the page; subscriptions are not dropped when a part leaves the page (not in these ids).


## ASK-019 Module columns of the task list: what S40 left to later stories

Story: S40 (COL-001, COL-003 to COL-007)
Date: 2026-11-25

The task list shows module columns (merge by `path`, priority, `show`, failed module note, `value` cells). Open: the case list does not draw `WorkflowList` columns yet; `sortable`, `filterable` and `resizeable` of a module column are not used (the header does not sort or filter by them); `width` is not applied. A column function is called once per loaded row, in the browser, and its answer is kept until the row leaves the window. The note of a failed module sits in each module cell of its row, or in the title cell when the list has no module column at all.


## ASK-020 Column width: what S42 left open

Story: S42 (COL-022)
Date: 2026-11-25

A dragged width is set on the header cell (width, min-width, max-width); the cells of the rows keep the layout the table gives them, so a long value can still push a column wider than its header. `width` of a module column (its default width) is not applied. The case list has no resizable columns yet because it draws no module columns (ASK-019). Open: should the body cells be cut at the width (ellipsis) or fixed table layout be used?


## ASK-021 Task page: what S43 left open

Story: S43 (TL-022, ACT-019, TF-001, TF-004, TF-005, TF-006)
Date: 2026-11-25

The page draws the form through `host.drawPage`, not through `ModulePart`, so the note and retry of ASK-015 are not on the page (EXT-035 and EXT-037 are not repeated there); the page shows `cannot open here` for a module the cockpit does not know or a type other than `ES_MODULES`, and `external` rows are not opened (no redirect). The interview gives no information for the header of a task (Q-TASK-HEADER-INFO: nothing), so the cut with "..." of TF-005 has no value to show and is untested. The react test module names only `all`, so a test of the three areas on the page needs another module. After an action the header reads the task again but the form is not given the new task (no `update` of the properties). ACT-019: the list reads its whole window again for any task named on `bc-cockpit`, not only the one row. The task page loads its task with the base path of the list of all tasks.
Answer: open


## ASK-022 Task page: what S44 left open

Story: S44 (TF-008, TF-016, TF-019, TF-020, TF-022, TF-023)
Date: 2026-11-25

The task page scrolls in its own area (`height: calc(100vh - var(--v-layout-top))`); the case page does not exist yet, so TF-008 is proven on the task page only. The react test module names the three areas only for a task of the process `areas`; any other task still gets `all`. An external task opens through the link of the list (`target=_blank`); opening it does not mark it as read, and the address `/tasks/<id>` of an external task still shows `cannot open here` (ASK-021). The note is saved on Enter and when the field loses focus; a note typed and then overwritten by an update of the task from another tab is replaced only after the save. `leavePage` drops the kept messages when the task page unmounts; a full reload of the browser tab drops them with the page. TF-023 is built for `Q-NOTES` = yes only.
Answer: open

## ASK-023 Task page: what S45 left open

Story: S45 (TF-025, TF-026, TF-027, TF-029, TF-039, TF-040)
Date: 2026-11-25

The cockpit was a page per address; for TF-039 (no entry loaded twice, no second manifest read) App.vue now opens a link to a task, the back button and the `navigate` action in the same page with `history.pushState` (list pages and other links still load the page). The note of a task page does not name the entry for a failed data entry beyond `UserTaskForm`; ASK-021 is closed by the notes and retry on the page (EXT-035 and EXT-037 are now also on the page). Not built: the case page (WP-010 uses the same steps). Whether the other links of the cockpit should also open in the page is open.
Answer: open

## ASK-024 Task tab: what S47 left open

Story: S47 (TF-007, TF-017, TF-018, TF-024, TF-045)
Date: 2026-11-25
Default taken: a list answers the question `{ question: 'list' }` on `bc-cockpit` with `{ list: true, visibility }`; the back button is on every task page (also one opened in the same page), and it never asks when the task has no assignee or another one. A tab which stays open after `window.close()` shows the hint after 100 ms. With no answer in 300 ms the tab loads the list of all tasks itself (a page load). TF-024: no case page exists yet, so only task titles, the menu and the toggle are tested. The cockpit and the simulator set no `Cross-Origin-Opener-Policy`; the backend was not touched, so whether it sets one is open. `window.open('', 'bc-list')` after the 300 ms wait may be refused by a popup blocker, the focus of an opener is the safe path.
Answer: open

## ASK-025 Task page barrier: what S48 left open

Story: S48 (TF-030, TF-031, TF-035, TF-038, TF-043, TF-044)
Date: 2026-11-25
Default taken: the barrier is a translucent note over the page which takes no pointer, so the areas beneath stay readable and scroll with wheel and touch; the web components under it are `inert` (their host elements), their areas are not. `Q-CLAIM` = hard is a constant in taskState.ts. Every update of the open task now gives `userTask` again to the web components (also after notes or follow-up), which closes the gap named in ASK-021. A suspended task wins over the claim in the note. The touch is tested by the pointer-events value of the barrier, not by a real touch gesture. The backend and simulator needed no change. TF-036 (informal claiming) is not built.
Answer: open


## ASK-026 Case list: what S49 left open

Story: S49 (NAV-003, WL-001, WL-002, WL-003, WL-004, WL-005)
Date: 2026-11-26
Default taken: the case list is its own component, not a mode of TaskList.vue; it appends pages of 20 as the user scrolls and has no virtual window yet (SRCH-010 to SRCH-014 for cases, and the carry-over of SRCH-001 to SRCH-006 from S24, are open). The id column is empty (no selection column until WL-010 is decided), the title is plain text until the page of a case exists (NAV-004), the chosen primary filter is not kept as a setting (WL-009), the toolbar and search field are missing. The ended column shows only for Done as WL-013 asks, tested only through WL-002. The backend needed no change.
Answer: open
