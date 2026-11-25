# Business cockpit user interface of acme

One npm workspaces repository: the user interface (`packages/ui`), the types, the module kit and
host, the theme and the dev shells. Node.js 24 or newer is the only tool it needs.

## Build and test

```sh
npm ci
npm run build   # workspaces in order, then the UI jar in build/jars
npm test
```

## Developing against the backend

The browser talks to the backend only, so the login, the cookie and the paths are the same as in
production.

1. Start the backend repository as its `README.md` says, with the profile `ui-dev-server` added
   to `local`.
2. Run `npm run dev`. The dev server of `packages/ui` listens on `127.0.0.1:5173` and refuses
   to start on another port, because the backend names that address. It serves the user interface
   at `/` and answers an unknown path with `index.html`.
3. Open the address of the backend, for example `http://localhost:8080`, never the one of the dev
   server, and log in.

The backend forwards no WebSocket. The hot reload therefore connects to port 5173 directly. If
the hot reload does not reach the browser, for example because a proxy or a container hides that
port, reload the page by hand after a change.
