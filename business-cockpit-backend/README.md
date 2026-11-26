# Business Cockpit backend

The cockpit application of acme: Maven, Spring Boot, Java 25. Modules: `types` (the types jar) and
`application`.

## Start

```
docker compose up -d --wait
mvn -pl application spring-boot:run -Dspring-boot.run.profiles=local
```

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

In this repository they fit, because the backend comes after the user interface anyway.

The nginx image of the UI repository (`docker/Dockerfile`) serves the files of the user interface.
The backend passes every path it does not answer itself to it. Its address is
`user-interface.uri`, from the environment variable `USER_INTERFACE_URI`.
