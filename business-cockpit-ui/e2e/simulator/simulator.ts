// The simulator of the UI repository: stands in for the cockpit backend in the end-to-end tests.
// It answers the GUI API, the BPMS API and what the dev shells need, in memory only.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppInformation } from '../../packages/ui/src/generated/cockpit-gui-api/types.gen.ts';
import type { User, WorkflowModule, WorkflowModules } from '../../packages/ui/src/generated/official-gui-api/types.gen.ts';

export const guiApiPath = '/gui/api/v1';
export const officialGuiApiPath = '/official-api/gui/api/v1';
const cookieName = 'bc';
const testModules = ['react-module', 'vue-module', 'angular-module'];
const uiFolder = new URL('../../packages/ui/dist/', import.meta.url).pathname;
const modulesFolder = new URL('../modules/', import.meta.url).pathname;

type SimulatedModule = WorkflowModule & { accessibleToGroups: string[] };
type SimulatedUser = { id: string; name: string; groups: string[] };

const users: SimulatedUser[] = [
  { id: 'anna', name: 'Anna Sales', groups: ['sales'] },
  { id: 'ben', name: 'Ben Support', groups: ['support'] },
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
      const body: User = { id: user.id, display: user.name, groups: user.groups.map((id) => ({ id })) };
      return send(res, 200, body);
    }

    // A list asks for a login, like the chain of the backend does.
    if (path === `${guiApiPath}/usertasks`) {
      return userOf(req) ? send(res, 200, { userTasks: [] }) : send(res, 401);
    }

    // The login at the identity provider, then back to the screen the user was on.
    if (path === '/oauth2/authorization/keycloak') {
      const back = new URL(req.headers.referer ?? '/', 'http://simulator');
      sessionsEndedAt = 0;
      return send(res, 302, undefined, {
        location: back.pathname + back.search,
        'set-cookie': `${cookieName}=${jwtFor(users[0], Date.now())}; Path=/; HttpOnly`,
      });
    }

    if (path === '/logout') {
      return send(res, 302, undefined, { location: '/', 'set-cookie': `${cookieName}=; Path=/; HttpOnly; Max-Age=0` });
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

    // The built user interface: files below /assets/, index.html for every other path of a page.
    if (method === 'GET' && !/^\/(gui|official-api|bpms|dev-shell|simulator-api|wm)\//.test(path)) {
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
