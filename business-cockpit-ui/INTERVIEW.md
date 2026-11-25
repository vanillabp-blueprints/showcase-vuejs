# Interview

Reference: 1.0.0
Started: 2026-11-25
Last answer: 2026-11-25
Layout: one Git repository (/workspaces/showcase-vuejs, branch `sonnet-1`) that holds both projects as sibling folders. Source: the user.
UI repository: /workspaces/showcase-vuejs/business-cockpit-ui
Backend repository: /workspaces/showcase-vuejs/business-cockpit-backend
Shared files at the workspace root: README.md, COSTS.md

## Q-FRAMEWORK

Which UI framework does the cockpit use, and which version?

Answer: Vue 3.5

## Q-DESIGN-LIBRARY

Which component or design library, and which version?

Answer: Vuetify 4.3 (npm: 4.3.4, peer vue ^3.5.0, checked against Vue 3.5)

## Q-MODULE-FRAMEWORKS

Which frameworks, and which versions, do the workflow modules use?

Answer: Vue 3.5, React 19, Angular 20 (zoneless). Three dev shells.

## Q-BUNDLER

Which build tool builds the cockpit?

Answer: Vite (npm: 8.3.8)

## Q-THEME

Colours, fonts, logo, spacing, dark mode, chart colours.

Answer: Vuetify defaults (palette, fonts, spacing), no logo (text title), chart colours of Vuetify in their order. Dark mode: yes, follows the operating system.

## Q-THEME-TOKENS

Theme as CSS custom properties for module parts?

Answer: yes

## Q-STATE-MARKERS

How does a row show its state?

Answer: none (default look, no symbols)

## Q-WORDING

Which word for a business case?

Answer: `Case` in English, `Vorgang` in German, `Dossier` in French, `Caso` in Spanish

## Q-CASE-KIND

Which field names the kind of a case?

Answer: the case title (`workflowTitle` in the task list, `title` in the case list), a text per language. Note: workflow modules must report the same title for every case of a kind.

## Q-AVATARS

Pictures of persons?

Answer: no, initials only

## Q-LANGUAGE-DEFAULT

Which language is the default?

Answer: English

## Q-LANGUAGE-SWITCH

Can the user switch the language?

Answer: yes

## Q-LANGUAGES

Which languages are offered?

Answer: English (default), German, French, Spanish

## Q-SCREENS

Which screens exist beyond the minimum?

Answer: the minimum (`/tasks`, `/my-tasks`, one case list) plus a notifications screen. No dashboard.

## Q-DASHBOARD

Not asked, because `Q-SCREENS` has no dashboard.

## Q-NOTIFICATIONS

Is there a screen where the user sets up notifications?

Answer: yes (chosen as the extra screen in `Q-SCREENS`)

## Q-SUB-LISTS

Sub-lists?

Answer: none

## Q-ROUTES

Which paths do the screens have, and are they translated?

Answer: translated paths, one per language, each works in every language. Order: all tasks, my tasks, a task, case list, a case, notifications.

- English: `/tasks`, `/my-tasks`, `/tasks/<id>`, `/workflows`, `/workflows/<id>`, `/notifications`
- German: `/aufgaben`, `/meine-aufgaben`, `/aufgabe/<id>`, `/vorgaenge`, `/vorgang/<id>`, `/benachrichtigungen`
- French: `/taches`, `/mes-taches`, `/tache/<id>`, `/dossiers`, `/dossier/<id>`, `/notifications`
- Spanish: `/tareas`, `/mis-tareas`, `/tarea/<id>`, `/casos`, `/caso/<id>`, `/notificaciones`

## Q-VISIBLE-GROUPS

Do some groups see other screens?

Answer: no, everybody sees the same

## Q-FOLLOW-UP

Follow-up feature?

Answer: yes; the task comes back at the start of its day, in the time zone of the browser

## Q-CLOSED-TASKS

Are closed user tasks shown?

Answer: yes

## Q-PRIMARY-FILTERS

Which primary filters does the task list offer, and which is the default?

Answer: `OpenTasksWithoutFollowUp` (default), `OpenTasksWithFollowUp`, `ClosedTasksOnly`. Not offered: `OpenTaskOnlyFollowUp` (the user dropped it; the follow-up feature itself stays on).

| Primary filter | English | German | French | Spanish |
|---|---|---|---|---|
| `OpenTasksWithoutFollowUp` | Open | Offen | Ouvertes | Abiertas |
| `OpenTasksWithFollowUp` | All open | Alle offenen | Toutes ouvertes | Todas abiertas |
| `ClosedTasksOnly` | Closed | Erledigt | Terminées | Cerradas |

## Q-WORKFLOW-FILTERS

Which primary filters does the case list offer, and which is the default?

Answer: `InProgress` (default) and `Done`.

| Primary filter | English | German | French | Spanish |
|---|---|---|---|---|
| `InProgress` | In progress | In Bearbeitung | En cours | En curso |
| `Done` | Done | Abgeschlossen | Terminés | Finalizados |

## Q-NOTES

Can user tasks and cases carry notes?

Answer: yes

## Q-TASK-COLUMNS

Which fixed columns does the task list have, and in which order?

Answer: id, business id, case kind, title, due, assignee, candidate users, notes, follow-up, ended (read back and confirmed)

## Q-WORKFLOW-COLUMNS

Which fixed columns does the case list have, and in which order?

Answer: id, business id, title, notes, created, ended. No case kind column (the user dropped it; the kind is the title anyway).

## Q-MODULE-COLUMNS

Do workflow modules add columns?

Answer: yes

## Q-BULK-ACTIONS

Which actions are offered for several selected tasks or cases?

Answer: tasks: claim, propose to a person, mark as read/unread, follow-up, notes. Not offered in bulk: give back (unclaim). Cases: notes.

## Q-CLAIM

Informal or hard claiming?

Answer: hard

## Q-PAGE-SIZE

Rows per page?

Answer: 20

## Q-MAX-LIST-ENTRIES

Maximum entries of a list?

Answer: 100,000

## Q-HEADER

What does the header show without an open task?

Answer: the title, the toggle of the lists, the user and the menu

## Q-TASK-PAGE-AREAS

Areas on the page of a user task?

Answer: body, information, actions (and always `all`)

## Q-WORKFLOW-PAGE-AREAS

Areas on the page of a case?

Answer: body, information, actions (and always `all`)

## Q-TASK-INFORMATION-AREA

What do modules show in the area `information` of a task?

Answer: business id, case title

## Q-TASK-HEADER-INFO

Information about the open task in the header?

Answer: nothing

## Q-TASK-HEADER-ACTIONS

Actions on the open task in the header?

Answer: claim and give back, propose to a person, follow-up, note, mark as unread

## Q-WORKFLOW-HEADER-INFO

Information about the open case in the header?

Answer: nothing

## Q-WORKFLOW-HEADER-ACTIONS

Actions on the open case in the header?

Answer: note

## Q-OWN-WINDOW

Does a user task open in a tab of its own?

Answer: yes

## Q-LIVE-MODE

How do lists react to changes?

Answer: live

## Q-EXTENSION-POINTS

Which extension points exist beyond the four minimum ones?

Answer: `Header`: yes. `Pages`: no. No other.

## Q-CELL-RENDERING

Shall workflow modules draw cells themselves?

Answer: yes. Note: the skill does not generate this yet; recorded only. Becomes a question in plan/QUESTIONS.md.

## Q-UI-URI-TYPE

Which `ui-uri-type` values does the UI understand?

Answer: `ES_MODULES`, `EXTERNAL`

## Q-DATA-ENTRY-LIMIT

Maximum size of a data entry?

Answer: 32 KB before compression

## Q-BACKEND

Shall the skill create the backend repository?

Answer: yes, in the folder `business-cockpit-backend` of the same Git repository (user's answer to the question for the backend folder)

## Q-BACKEND-FRAMEWORK

Not asked: a backend the skill creates is Spring Boot.

## Q-BUILD-TOOL

Maven or Gradle?

Answer: Maven

## Q-LOGIN-KIND

How does a user log in?

Answer: oidc, with the Keycloak of the docker-compose.yaml

## Q-TOKEN

Where does the browser keep the login?

Answer: cookie. Only possible choice today (`header` cannot be generated); not a user decision.

## Q-HOSTING

Where does the user interface run?

Answer: behind (own nginx image; the backend passes unknown paths to it through a Spring Cloud Gateway route `/**`)

## Q-LOGIN

Login paths?

Answer: `/oauth2/authorization/<id>`, `/login/oauth2/code/<id>`, `/logout`

## Q-COCKPIT-VERSION

Which Business Cockpit version?

Answer: group `io.vanillabp.businesscockpit`, version `0.9.0-SNAPSHOT` (checked on the snapshot repository; 1.0.0 is not released, latest release 0.4.3). Moves to 1.0.0 once released: a plan step, only the version property and dropping the snapshot repository (BE-024).

## Q-COCKPIT-REPOSITORY

From which Maven repository are the cockpit jars loaded?

Answer: Maven Central, releases from `repo1.maven.org`, snapshots from `central.sonatype.com/repository/maven-snapshots`, no token

## Q-UI-JAR

Maven coordinates of the UI jar.

Answer: Placeholder: `com.acme:business-cockpit-ui:0.1.0-SNAPSHOT` (group `com.acme` given by the user, a fictional name, so kept as a placeholder; version taken as a default without asking)

## Q-TYPES-JAR

Coordinates and Java package of the types jar.

Answer: Placeholder: `com.acme:business-cockpit-ui-types`, package `com.acme.cockpit.ui`; the module `types` of the backend repository

## Q-MAVEN-REPOSITORY

Into which Maven repository is the UI jar uploaded?

Answer: a local file repository only, for now (no company repository). No credentials. The upload script still uses HTTP `PUT`, against a small local server that stores into a folder; the address and credential variables are configurable, so a company repository can be set later.

## Q-NPM-SCOPE

npm scope, names and registry.

Answer: Placeholder: scope `@acme`: `@acme/bc-types`, `@acme/bc-module-kit`, `@acme/bc-module-host`, `@acme/bc-theme`, `@acme/bc-dev-shell-vue`, `@acme/bc-dev-shell-react`, `@acme/bc-dev-shell-angular`. Registry npmjs.org; nothing published for now.

## Q-BACKEND-COORDINATES

Group, artifact and Java package of the backend.

Answer: Placeholder: `com.acme:business-cockpit-backend`, package `com.acme.cockpit`; modules `types` and `application`

## Q-JAVA-VERSION

Java version?

Answer: 25 (OpenJDK 25.0.5 is installed here)

## Q-OIDC-PROVIDER

Which OIDC provider?

Answer: the Keycloak of the docker-compose.yaml: realm `business-cockpit`, client `business-cockpit`, user id from `preferred_username`

## Q-USER-DIRECTORY

Where does the backend find users and groups?

Answer: keycloak

## Q-AVATAR-SOURCE

Not asked, because `Q-AVATARS` is no.

## Q-AVATAR-CACHE

Not asked, because `Q-AVATARS` is no.

## Q-LIST-CONTROLLERS

Which lists get a controller?

Answer: all user tasks, own tasks, case list, workflow modules; default visibilities of the cockpit; no role lists

## Q-BPMS-API-USER

BPMS API user?

Answer: user name from `BPMS_API_USERNAME`, password from `BPMS_API_PASSWORD`; `local` values in application-local.yaml

## Q-KAFKA

Kafka?

Answer: no

## Q-MAIL

Notification e-mails?

Answer: yes (Mailpit in docker-compose.yaml)

## Q-E2E-TOOL

End-to-end test tool?

Answer: Playwright

## Q-MEMORY-LIMIT

Heap limit after the memory test?

Answer: 150 MB
