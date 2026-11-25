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
