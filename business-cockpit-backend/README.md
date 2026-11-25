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
