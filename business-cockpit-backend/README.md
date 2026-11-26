# Business Cockpit backend

The cockpit application of acme: Maven, Spring Boot, Java 25. Modules: `types` (the types jar) and
`application`.

To try the cockpit with the user interface, fill it with demo data, run the tests, and for the next steps, follow [Trying it by hand](../README.md#trying-it-by-hand) in the README of the workspace.

## Start

```
docker compose up -d --wait
mvn -pl application spring-boot:run -Dspring-boot.run.profiles=local
```

Open `http://localhost:8080`. The profile `local` sets the secrets of `keycloak/realm.json`, the
BPMS API user `local` (password `local`) and the addresses of MongoDB, Keycloak (`localhost:8081`)
and Mailpit (`localhost:8025`). Everything in it is for a developer's machine only.

Kafka is not read. If a deployment reads Kafka, it also needs the system property `workerId`, for
example `-Dspring-boot.run.jvmArguments=-DworkerId=1`.

## Local users

Keycloak imports `keycloak/realm.json` at its first start. It holds one group, `template-group`,
and one user, `template-user` with the password `template-user`, a member of that group. They are
a template, for local use only.

## Test users and groups

The groups decide which user tasks and cases a user sees. One template user is not enough to try
the visibilities out. Add test users with different groups to `keycloak/realm.json`, for example
one per group a workflow module names in `accessibleToGroups`. Then import the realm again. Keycloak
imports it only into an empty volume:

```
docker compose down -v
docker compose up -d --wait
```

`down -v` also removes the data of MongoDB. These users and secrets are for a developer's machine
only, never for a deployment.

## What a deployment sets

The application reads these environment variables. None of them has a value for production in
this repository:

| Variable | Meaning |
|---|---|
| `MONGODB_URI` | address of MongoDB |
| `COCKPIT_JWT_KEY` | base64 key (HMAC SHA-256) which signs the tokens of the cockpit |
| `BPMS_API_USERNAME`, `BPMS_API_PASSWORD` | the user whom workflow modules report with |
| `KEYCLOAK_URL` | address of Keycloak, the realm is `business-cockpit` |
| `KEYCLOAK_CLIENT_SECRET` | secret of the client `business-cockpit` (the login) |
| `KEYCLOAK_DIRECTORY_SECRET` | secret of the client `business-cockpit-directory` (the user directory) |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_FROM` | the mail server for notifications |
| `COCKPIT_URI` | the public address of the cockpit |
| `USER_INTERFACE_URI` | address of the nginx image of the user interface |

## Developing the user interface

The user interface runs behind its own nginx image, so the backend embeds no UI jar. For a
developer the profile `ui-dev-server` sends every path the backend does not answer itself to the
dev server of the UI repository:

1. Start the backend with the profiles `local,ui-dev-server`:
   `mvn -pl application spring-boot:run -Dspring-boot.run.profiles=local,ui-dev-server`
2. Run `npm run dev` in the UI repository.
3. Open the address of the backend, `http://localhost:8080`, never the one of the dev server.

The address of the dev server is `user-interface.uri` in
`application/src/main/resources/config/application-ui-dev-server.yaml`, `http://127.0.0.1:5173`.
Without the profile there is no such route. The backend then serves no file of a UI jar for it.

## The types jar and the order of the builds

The module `types` builds the types jar `com.acme:business-cockpit-ui-types` with the class
`com.acme.cockpit.ui.UiUriTypes`: one constant per entry of `ui-uri-types.json` of the npm package
`@acme/bc-types`, `EXTERNAL` included. A workflow module uses the constants instead of typing the
strings. The build downloads the package in the version `ui.version` (the version of the user
interface, see the parent `pom.xml`) from the npm registry, and a small step writes the class.

Until the package of that version is in the registry, or for a build on one machine, name the
folder of the built types library in the UI repository. That skips the download:

```
npm run build --workspaces --if-present     # in the UI repository
mvn verify -Dbc-types.local=$PWD/../business-cockpit-ui/packages/bc-types
```

A release always takes the registry.

Release order: the cockpit release, then the user interface, then this backend repository (the
types jar and the application). Why:

- The user interface needs the OpenAPI files from the cockpit jars.
- The types jar needs the npm package of the user interface.
- If the types were part of the cockpit build, the builds would form a circle: the cockpit build
  would need the package of the user interface, and the user interface needs the cockpit jars
  first.
- If the types were part of the UI build, the UI repository, which only needs npm, would need Java.

In this repository they fit, because the backend comes after the user interface anyway. The order
is: the cockpit release, then the user interface, then this backend repository.

A new version of the user interface gets in as a new value of `ui.version` in the parent
`pom.xml`. The types jar is built from the npm package of that version.

The nginx image of the UI repository (`docker/Dockerfile`) serves the files of the user interface.
The backend passes every path it does not answer itself to it. Its address is
`user-interface.uri`, from the environment variable `USER_INTERFACE_URI`.
