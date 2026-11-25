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
