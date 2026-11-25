// The simulator of the UI repository: stands in for the cockpit backend in the end-to-end tests.
// It answers the GUI API, the BPMS API and what the dev shells need, in memory only.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppInformation } from '../../packages/ui/src/generated/cockpit-gui-api/types.gen.ts';
import type { User, UserTask, WorkflowModule, WorkflowModules } from '../../packages/ui/src/generated/official-gui-api/types.gen.ts';

export const guiApiPath = '/gui/api/v1';
export const officialGuiApiPath = '/official-api/gui/api/v1';
const cookieName = 'bc';
const idTokenCookieName = 'bc-id-token';
const testModules = ['react-module', 'vue-module', 'angular-module'];
const uiFolder = new URL('../../packages/ui/dist/', import.meta.url).pathname;
const modulesFolder = new URL('../modules/', import.meta.url).pathname;

type SimulatedModule = WorkflowModule & { accessibleToGroups: string[] };
type SimulatedUser = { id: string; name: string; groups: string[]; email: string };
type CountRequest = { path: string; mode?: string; keys: string[] };

const users: SimulatedUser[] = [
  { id: 'anna', name: 'Anna Sales', groups: ['sales'], email: 'anna@acme.example' },
  { id: 'ben', name: 'Ben Support', groups: ['support'], email: 'ben@acme.example' },
];

export interface Simulator {
  port: number;
  stop(): Promise<void>;
}

export async function startSimulator(options: { port: number }): Promise<Simulator> {
  let modules = new Map<string, SimulatedModule>();
  const streams = new Set<ServerResponse>();
  // every login before this moment has ended, the way a login ends after its maximal duration
  let sessionsEndedAt = 0;
  // the session at the identity provider, which a logout has to end
  let providerSession = false;
  let loginPrompts = 0;
  let endSessions: Record<string, string>[] = [];
  let protectPages = true;
  let groupsOfCurrentUser: string[] | undefined;
  let namesOfCurrentUser: { display?: string | null; displayShort?: string | null } = {};
  let counts = { myTasks: 0, allTasks: 0, cases: 0 };
  let countRequests: CountRequest[] = [];
  // the user tasks the lists answer, as a workflow module reported them, and the requests of the lists
  let userTasks: UserTask[] = [];
  let listRequests: { path: string; body: Record<string, unknown> }[] = [];
  // the settings of each user, as the cockpit keeps them in customSettings, and the requests which touched them
  let settingsOfUsers = new Map<string, Map<string, unknown>>();
  let settingRequests: { method: string; key: string; body?: unknown }[] = [];
  // the address a browser wanted before it was sent to the login, which the backend keeps
  let savedAddress: string | undefined;

  const send = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };

  const readBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : {};
  };

  const userOf = (req: IncomingMessage): SimulatedUser | undefined => {
    const token = /(?:^|;\s*)bc=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    if (!token) return undefined;
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    if (claims.iat !== undefined && claims.iat < sessionsEndedAt) return undefined;
    return users.find((user) => user.id === claims.sub);
  };

  const jwtFor = (user: SimulatedUser, issuedAt?: number): string => {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${part({ alg: 'none' })}.${part({ sub: user.id, name: user.name, groups: user.groups, iat: issuedAt })}.simulator`;
  };

  const publish = (eventName: string, elements: object[]) => {
    const data = JSON.stringify(elements, null, 2).split('\n').map((line) => `data: ${line}`).join('\n');
    for (const stream of streams) stream.write(`id: ${crypto.randomUUID()}\nevent: ${eventName}\n${data}\n\n`);
  };

  const route = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://simulator');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (path === `${guiApiPath}/app/info`) {
      const info: AppInformation = { titleShort: 'Cockpit', titleLong: 'Business Cockpit of acme', version: 'simulator' };
      return send(res, 200, info);
    }

    // Open to everybody: a request without a login gets 200 without a body.
    if (path === `${guiApiPath}/app/current-user`) {
      const user = userOf(req);
      if (!user) return send(res, 200);
      const display = namesOfCurrentUser.display === undefined ? user.name : namesOfCurrentUser.display ?? undefined;
      const displayShort = namesOfCurrentUser.displayShort === undefined ? user.name.split(' ')[0] : namesOfCurrentUser.displayShort ?? undefined;
      const body: User = { id: user.id, display, displayShort, email: user.email, groups: (groupsOfCurrentUser ?? user.groups).map((id) => ({ id })) };
      return send(res, 200, body);
    }

    // The settings of the user. The key holds letters, digits, - _ and : only, like the cockpit demands.
    const setting = new RegExp(`^${guiApiPath}/app/current-user/settings/([^/]+)$`).exec(path);
    if (setting) {
      const user = userOf(req);
      if (!user) return send(res, 401);
      const key = decodeURIComponent(setting[1]!);
      if (!/^[A-Za-z0-9_:-]{1,200}$/.test(key)) return send(res, 400);
      const own = settingsOfUsers.get(user.id) ?? new Map<string, unknown>();
      settingsOfUsers.set(user.id, own);
      if (method === 'PUT') {
        const text = Buffer.concat(await Array.fromAsync(req as AsyncIterable<Buffer>)).toString('utf8');
        const body = text ? JSON.parse(text) : null;
        if (body === null) return send(res, 400);
        settingRequests.push({ method, key, body });
        own.set(key, body);
        return send(res, 200);
      }
      if (method === 'GET') {
        settingRequests.push({ method, key });
        return own.has(key) ? send(res, 200, own.get(key)) : send(res, 404);
      }
      if (method === 'DELETE') {
        settingRequests.push({ method, key });
        own.delete(key);
        return send(res, 200);
      }
    }
    if (path === '/simulator-api/setting-requests') return send(res, 200, settingRequests);
    if (path === '/simulator-api/setting-requests/clear' && method === 'POST') {
      settingRequests = [];
      return send(res, 200);
    }

    // The lists ask for a login, like the chain of the backend does. The list of all tasks shows every
    // task the user may work on, the list of the user's own tasks only those the user is assigned to.
    const list = /^\/gui\/api\/v1(\/current-user)?\/usertask$/.exec(path);
    if (list && method === 'POST') {
      const user = userOf(req);
      if (!user) return send(res, 401);
      const body = await readBody(req);
      listRequests.push({ path, body });
      const shown = userTasks.filter((task) => (list[1] ? task.assignee?.id === user.id : true));
      const size = Number(body.pageSize ?? 20);
      const number = Number(body.pageNumber ?? 0);
      return send(res, 200, {
        serverTimestamp: new Date().toISOString(),
        page: { totalElements: shown.length, totalPages: Math.ceil(shown.length / size), number, size },
        userTasks: shown.slice(number * size, (number + 1) * size),
      });
    }
    if (path === '/simulator-api/user-tasks' && method === 'POST') {
      userTasks = ((await readBody(req)).userTasks ?? []) as UserTask[];
      return send(res, 200);
    }
    if (path === `${guiApiPath}/usertasks`) {
      return userOf(req) ? send(res, 200, { userTasks: [] }) : send(res, 401);
    }
    if (path === '/simulator-api/list-requests') return send(res, 200, listRequests);

    // The counts of the header toggle, for the three base paths of the lists.
    const countPath = /^\/gui\/api\/v1(\/current-user)?\/(usertask|workflow)\/count$/.exec(path);
    if (countPath && method === 'POST') {
      if (!userOf(req)) return send(res, 401);
      const filters = ((await readBody(req)).filters ?? []) as { key: string; mode?: string }[];
      countRequests.push({ path, mode: filters[0]?.mode, keys: filters.map((filter) => filter.key) });
      const total = countPath[2] === 'workflow' ? counts.cases : countPath[1] ? counts.myTasks : counts.allTasks;
      return send(res, 200, { serverTimestamp: new Date().toISOString(), counts: filters.map((filter) => ({ key: filter.key, count: total })) });
    }
    if (path === '/simulator-api/counts' && method === 'POST') {
      counts = { ...counts, ...(await readBody(req)) };
      return send(res, 200);
    }
    if (path === '/simulator-api/count-requests') return send(res, 200, countRequests);
    if (path === '/simulator-api/current-user' && method === 'POST') {
      namesOfCurrentUser = await readBody(req);
      return send(res, 200);
    }
    // One delivery of the update stream: one event with the given number of elements.
    if (path === '/simulator-api/publish' && method === 'POST') {
      const body = await readBody(req);
      publish(String(body.event), Array.from({ length: Number(body.elements ?? 1) }, () => ({ id: crypto.randomUUID() })));
      return send(res, 200);
    }

    // The login at the identity provider, then back to the screen the user was on. An identity
    // provider with a session of its own logs in without a question, otherwise it asks once.
    if (path === '/oauth2/authorization/keycloak') {
      const referer = req.headers.referer ? new URL(req.headers.referer) : undefined;
      const back = savedAddress ?? (referer ? referer.pathname + referer.search : '/');
      savedAddress = undefined;
      sessionsEndedAt = 0;
      if (!providerSession) loginPrompts += 1;
      providerSession = true;
      const user = users[0];
      const cookie = (name: string, value: string, extra: string) => `${name}=${value}; Path=${extra}; HttpOnly`;
      res.writeHead(302, {
        location: back,
        'set-cookie': [
          cookie(cookieName, jwtFor(user, Date.now()), '/'),
          cookie(idTokenCookieName, jwtFor(user, Date.now()), '/logout'),
        ],
      });
      return void res.end();
    }

    // Ends the cockpit's login, then the one at the provider, which sends the browser back.
    if (path === '/logout') {
      const idToken = /(?:^|;\s*)bc-id-token=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
      const endSession = new URL('/simulator-idp/end-session', 'http://simulator');
      if (idToken) endSession.searchParams.set('id_token_hint', idToken);
      endSession.searchParams.set('client_id', 'business-cockpit');
      endSession.searchParams.set('post_logout_redirect_uri', `http://${req.headers.host}/`);
      res.writeHead(302, {
        location: endSession.pathname + endSession.search,
        'set-cookie': [
          `${cookieName}=; Path=/; HttpOnly; Max-Age=0`,
          `${idTokenCookieName}=; Path=/logout; HttpOnly; Max-Age=0`,
        ],
      });
      return void res.end();
    }

    if (path === '/simulator-idp/end-session') {
      providerSession = false;
      endSessions.push(Object.fromEntries(url.searchParams));
      return send(res, 302, undefined, { location: url.searchParams.get('post_logout_redirect_uri') ?? '/' });
    }

    if (path === '/simulator-api/state') return send(res, 200, { loginPrompts, endSessions });
    if (path === '/simulator-api/protect-pages' && method === 'POST') {
      protectPages = (await readBody(req)).on !== false;
      return send(res, 200);
    }
    if (path === '/simulator-api/groups' && method === 'POST') {
      groupsOfCurrentUser = (await readBody(req)).groups as string[];
      return send(res, 200);
    }

    if (path === '/simulator-api/expire-sessions' && method === 'POST') {
      sessionsEndedAt = Date.now() + 1;
      return send(res, 200);
    }

    if (path === `${guiApiPath}/updates`) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      streams.add(res);
      res.write(': stream open\n\n');
      req.on('close', () => streams.delete(res));
      return;
    }

    if (path === `${officialGuiApiPath}/workflow-module` && method === 'GET') {
      const user = userOf(req);
      const visible = [...modules.values()].filter((module) =>
        module.accessibleToGroups.length === 0 || (user?.groups ?? []).some((group) => module.accessibleToGroups.includes(group)));
      const listed: WorkflowModules = { modules: visible.map(({ id, version, uri }) => ({ id, version, uri })) };
      return send(res, 200, listed);
    }

    const moduleRegistration = /^\/bpms\/api\/v1_1\/workflow-module\/([^/]+)$/.exec(path);
    if (moduleRegistration && method === 'POST') {
      const body = await readBody(req);
      const id = moduleRegistration[1];
      modules.set(id, { id, version: (modules.get(id)?.version ?? 0) + 1, uri: String(body.uri ?? ''), accessibleToGroups: (body.accessibleToGroups as string[] | undefined) ?? [] });
      return send(res, 200);
    }

    const userTaskReport = /^\/bpms\/api\/v1_1\/workflow-module\/([^/]+)\/usertask\/([^/]+)$/.exec(path);
    if (userTaskReport && method === 'POST') {
      const body = await readBody(req);
      send(res, 200);
      publish('UserTask', [{ id: userTaskReport[2], workflowModuleId: userTaskReport[1], event: 'CREATED', ...body }]);
      return;
    }

    if (path === '/dev-shell/user/all/id') return send(res, 200, users.map((user) => user.id));
    if (path === '/dev-shell/user/all') return send(res, 200, users);
    if (path === '/dev-shell/user/' && method === 'GET') return send(res, 200, userOf(req)?.id ?? '');
    const chosenUser = /^\/dev-shell\/user\/([^/]+)$/.exec(path);
    if (chosenUser && method === 'POST') {
      if (chosenUser[1] === '---') return send(res, 200, undefined, { 'set-cookie': `${cookieName}=; Path=/; HttpOnly; Max-Age=0` });
      const user = users.find((candidate) => candidate.id === chosenUser[1]);
      if (!user) return send(res, 404);
      return send(res, 200, undefined, { 'set-cookie': `${cookieName}=${jwtFor(user)}; Path=/; HttpOnly` });
    }

    if (path === '/simulator-api/reset' && method === 'POST') {
      modules = new Map();
      sessionsEndedAt = 0;
      providerSession = false;
      loginPrompts = 0;
      endSessions = [];
      protectPages = true;
      groupsOfCurrentUser = undefined;
      namesOfCurrentUser = {};
      counts = { myTasks: 0, allTasks: 0, cases: 0 };
      countRequests = [];
      userTasks = [];
      listRequests = [];
      settingsOfUsers = new Map();
      settingRequests = [];
      savedAddress = undefined;
      return send(res, 200);
    }

    // The built test modules, the way the cockpit forwards to a module. No other module is served.
    const modulePart = /^\/wm\/([^/]+)\/(.+)$/.exec(path);
    if (modulePart && testModules.includes(modulePart[1])) {
      const file = join(modulesFolder, modulePart[1], 'dist', modulePart[2]);
      if (!file.includes('..') && existsSync(file)) {
        res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
        return void res.end(readFileSync(file));
      }
    }

    // The built user interface: files below /assets/ stay open, index.html for every other path of
    // a page asks for a login first, before any deep link.
    if (method === 'GET' && !/^\/(gui|official-api|bpms|dev-shell|simulator-api|simulator-idp|wm)\//.test(path)) {
      if (!path.startsWith('/assets/') && protectPages && !userOf(req)) {
        savedAddress = path + url.search;
        return send(res, 302, undefined, { location: '/oauth2/authorization/keycloak' });
      }
      const file = join(uiFolder, path.startsWith('/assets/') ? path : 'index.html');
      if (!file.includes('..') && existsSync(file)) {
        const types: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
        const extension = file.slice(file.lastIndexOf('.'));
        res.writeHead(200, { 'content-type': types[extension] ?? 'application/octet-stream' });
        return void res.end(readFileSync(file));
      }
    }
    send(res, 404);
  };

  const server: Server = createServer((req, res) => {
    route(req, res).catch((error) => send(res, 500, { message: String(error) }));
  });
  await new Promise<void>((resolve) => server.listen(options.port, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;

  return {
    port,
    stop: () => new Promise<void>((resolve) => {
      for (const stream of streams) stream.end();
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
