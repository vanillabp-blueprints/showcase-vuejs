/business-cockpit-creator Create a new Business Cockpit. The workspace is a Git repository: work in the current branch. Use sub-agents if you like, but always bring changes made in worktrees back into this branch. For every story, add a row to a table in COSTS.md with these columns: Story, Duration, # Messages, Input tokens, Cache write, Cache read, Output tokens, Est. cost USD. Take the prices for your model from https://platform.claude.com/docs/en/about-claude/pricing.

--> Interview

Please go ahead story by story using a separate sub-agent for each story. Use the session's token recordings to fill the table in COSTS.md for the interview
and each story.

--> Done after 16h

I run "mvn clean package" in "business-cockpit-backend" and got that error:

[INFO] --- exec:3.6.3:exec (write-ui-uri-types) @ business-cockpit-ui-types ---
Exception in thread "main" java.nio.file.NoSuchFileException: /workspaces/showcase-vuejs/business-cockpit-backend/types/target/bc-types/package/ui-uri-types.json

--> No npm-registry run, fallback to use path added

Running the backend tests with mvn verify gives a lot of errors "The $changeStream stage is only supported on replica sets". The don't break the tests, so if this is intended for the test,
then please avoid those ERRORs e.g. by adding a switch to disable life-updates which seems to cause those errors. However, I would prefer to hide all loggings of tests in case they succeed.
This can be done by using @ExtendWith(SuppressOutputExtension.class) from io.vanillabp:test-utils.

--> Done

What about the remaining output of ERRORs which seem to be expected. If that feature causing those errors cannot be switch of on running the tests, then may the annotation
@SuppressOutputExtension.SuppressBackgroundOutput will remove them.

--> Done

On logon using template-user I get a redirect to the application after the Keycloak-login mask but "Invalid credentials" is shown.

--> Done

Please solve that flaky test BE_033_BE_034 or exclude it during the build

--> Flaky test root cause resolved

The welcome screen is not "my tasks". The hover of the user in the header is hidden by the background of the main-area. The visual appearance is without any styles - everything is dark.

--> Fixed

The contents of the lists my-tasks and tasks is higher than the browsers visible area and causes a scroll bar. The list workflows does not. Maybe this is the reason: In the list of workflows
no column search is available.

--> Fixed

The hint "No tasks" is at the bottom of list-area. Please place it at the top.

--> Fixed

In the hover of the user, which should show the list of groups/roles and permissions, the text "No roles or rights are known." is shown although the response of /group-hierarchy a group names

--> Fixed
