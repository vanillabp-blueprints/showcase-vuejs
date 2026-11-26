// The simulator of the UI repository: stands in for the cockpit backend in the end-to-end tests.
// It answers the GUI API, the BPMS API and what the dev shells need, in memory only.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import type { AppInformation } from '../../packages/ui/src/generated/cockpit-gui-api/types.gen.ts';
import type { Person, User, UserTask, Workflow, WorkflowModule, WorkflowModules } from '../../packages/ui/src/generated/official-gui-api/types.gen.ts';

export const guiApiPath = '/gui/api/v1';
export const officialGuiApiPath = '/official-api/gui/api/v1';
const cookieName = 'bc';
const idTokenCookieName = 'bc-id-token';
const testModules = ['react-module', 'vue-module', 'angular-module'];
const uiFolder = new URL('../../packages/ui/dist/', import.meta.url).pathname;
const devShellFolder = new URL('../dev-shell/dist/', import.meta.url).pathname;
const modulesFolder = new URL('../modules/', import.meta.url).pathname;

type SimulatedModule = WorkflowModule & { accessibleToGroups: string[] };
type SimulatedUser = { id: string; name: string; groups: string[]; email: string };
type CountRequest = { path: string; mode?: string; modes: string[]; keys: string[] };

const userTaskFields = ['id', 'businessId', 'workflowTitle', 'title', 'taskDefinition', 'dueDate', 'assignee', 'candidateUsers', 'note', 'followUpDate', 'endedAt', 'endReason', 'suspendedAt', 'read', 'createdAt', 'updatedAt'];

const users: SimulatedUser[] = [
  { id: 'anna', name: 'Anna Sales', groups: ['sales'], email: 'anna@acme.example' },
  { id: 'ben', name: 'Ben Support', groups: ['support'], email: 'ben@acme.example' },
];

export interface Simulator {
  port: number;
  stop(): Promise<void>;
}

/** What the web server of a module answers for a file: an ETag, Last-Modified, gzip on request and 304 for a file which did not change. */
function moduleAnswer(file: string, type: string, asked: IncomingMessage['headers']): { status: number; headers: Record<string, string>; body: Buffer } {
  const content = readFileSync(file);
  const etag = `"${createHash('sha1').update(content).digest('hex')}"`;
  const lastModified = statSync(file).mtime.toUTCString();
  // The manifest has a fixed name, so it is never cached without asking again.
  const headers: Record<string, string> = { 'content-type': type, etag, 'last-modified': lastModified, ...(file.endsWith('bc-manifest.json') ? { 'cache-control': 'no-cache' } : {}) };
  const unchanged = asked['if-none-match'] !== undefined
    ? asked['if-none-match'] === etag
    : asked['if-modified-since'] !== undefined && Date.parse(asked['if-modified-since']) >= Date.parse(lastModified);
  if (unchanged) return { status: 304, headers, body: Buffer.alloc(0) };
  if (/\bgzip\b/.test(String(asked['accept-encoding'] ?? '')) && type !== 'application/octet-stream') {
    return { status: 200, headers: { ...headers, 'content-encoding': 'gzip', vary: 'Accept-Encoding' }, body: gzipSync(content) };
  }
  return { status: 200, headers, body: content };
}

export async function startSimulator(options: { port: number }): Promise<Simulator> {
  let modules = new Map<string, SimulatedModule>();
  const streams = new Set<ServerResponse>();
  // a test makes the update stream answer with a status instead of opening, and reads when it was asked for
  let streamRefusal: number | undefined;
  let streamAttempts: number[] = [];
  // like the cockpit, a new stream gets a RELOAD right after it opened; a test may hold it back to say when it comes
  let reloadAfterOpenMs = 0;
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
  // the cases the case list answers
  let workflows: Workflow[] = [];
  let listsFail = false;
  // the text of the 400 a sorted request is answered with, as the server does for a sort it refuses (SRCH-034)
  let sortRefusal: string | undefined;
  // what the bulk calls and the single calls of the tools asked, in order
  let bulkRequests: { action: string; ids: string[]; query: Record<string, string>; body: Record<string, unknown> }[] = [];
  let listRequests: { path: string; body: Record<string, unknown>; initialTimestamp?: string; serverTimestamp?: string }[] = [];
  let suggestionRequests: { query: string; path?: string; at: number }[] = [];
  // the settings of each user, as the cockpit keeps them in customSettings, and the requests which touched them
  let appLanguages = 'en,de,fr,es';
  let settingsOfUsers = new Map<string, Map<string, unknown>>();
  let settingRequests: { method: string; key: string; body?: unknown }[] = [];
  // the answer of the group hierarchy of the user, whether it fails, how long it takes, and how often it was asked
  let hierarchyAnswer: unknown = { givenByOrganisation: [], modules: [] };
  let hierarchyFails = false;
  let hierarchyDelayMilliseconds = 0;
  let hierarchyRequests = 0;
  // the notification settings of the cockpit: the channels, the kinds of case, what the user chose and where each channel reaches them
  let notificationMedia: { type: string; name?: Record<string, string> }[] = [];
  let notificationWorkflows: object[] = [];
  let notificationConfig: object = {};
  let recipientValues = new Map<string, string>();
  let notificationRequests: { method: string; path: string; body?: unknown }[] = [];
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

  // which tasks a primary filter lets through; without a mode the server takes OpenTasksWithFollowUp
  // a task which ended after the list started stays in a list of open tasks (LIVE-003)
  const inMode = (task: UserTask, mode = 'OpenTasksWithFollowUp', startedAt?: string): boolean => {
    const open = !task.endedAt || (startedAt !== undefined && task.endedAt > startedAt);
    const putAside = Boolean(task.followUpDate) && new Date(task.followUpDate!).getTime() > Date.now();
    if (mode === 'All') return true;
    if (mode === 'ClosedTasksOnly') return Boolean(task.endedAt);
    if (mode === 'OpenTasksWithFollowUp') return open;
    if (mode === 'OpenTasksWithoutFollowUp') return open && !putAside;
    if (mode === 'OpenTaskOnlyFollowUp') return open && putAside;
    throw new Error(`unknown mode ${mode}`);
  };

  const inWorkflowMode = (one: Workflow, mode = 'All'): boolean => {
    if (mode === 'All') return true;
    if (mode === 'Done') return Boolean(one.endedAt);
    if (mode === 'InProgress') return !one.endedAt;
    throw new Error(`unknown mode ${mode}`);
  };

  // what a filter looks at: the field of its path, a translatable text as all its languages; without a path the reported
  // full text and the note, the only two fields the server searches
  type Query = { path?: string; query: string; caseInsensitive?: boolean };
  const valueAt = (task: UserTask, path: string | undefined): string => {
    if (!path) return `${(task as Record<string, unknown>).detailsFulltextSearch ?? ''} ${task.note ?? ''}`;
    const value = (task as Record<string, unknown>)[path];
    if (value && typeof value === 'object') return Object.values(value).join(' ');
    return String(value ?? '');
  };
  // the query is plain text, so a dot or a parenthesis is only itself
  const matches = (task: UserTask, search: Query): boolean => {
    const value = valueAt(task, search.path);
    return search.caseInsensitive ? value.toLowerCase().includes(search.query.toLowerCase()) : value.includes(search.query);
  };
  // the value a sort path stands for: a person sorts by its name (the stored field `sort`) and its id
  const sortValue = (task: UserTask, path: string): string => {
    const [field, key] = [path.split('.')[0]!, path.split('.').slice(1).join('.')];
    const value = (task as Record<string, unknown>)[field];
    if (value && typeof value === 'object') {
      const part = (value as Record<string, string | undefined>)[key === 'sort' ? 'display' : key];
      return part ?? '';
    }
    return String(value ?? '');
  };
  // no sort keeps the order of the list
  const sortedBy = (tasks: UserTask[], sort: string, ascending: boolean): UserTask[] => {
    const paths = sort.split(',').filter(Boolean);
    if (paths.length === 0) return tasks;
    const compare = (a: UserTask, b: UserTask): number => {
      for (const path of paths) {
        const [left, right] = [sortValue(a, path), sortValue(b, path)];
        if (left !== right) return left < right ? -1 : 1;
      }
      return 0;
    };
    return [...tasks].sort((a, b) => (ascending ? compare(a, b) : compare(b, a)));
  };
  // the words that contain the query with their counts: the most frequent first, then alphabetical, 21 at most
  const suggestionsFor = (tasks: UserTask[], query: string, path: string | undefined): { item: string; count: number }[] => {
    if (query.length < 3) return [];
    const counted = new Map<string, number>();
    for (const task of tasks) {
      for (const word of valueAt(task, path).split(/\s+/).filter(Boolean)) {
        if (word.toLowerCase().includes(query.toLowerCase())) counted.set(word, (counted.get(word) ?? 0) + 1);
      }
    }
    return [...counted].map(([item, count]) => ({ item, count })).sort((a, b) => b.count - a.count || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0)).slice(0, 21);
  };

  const publish = (eventName: string, elements: object[]) => {
    const data = JSON.stringify(elements, null, 2).split('\n').map((line) => `data: ${line}`).join('\n');
    for (const stream of streams) stream.write(`id: ${crypto.randomUUID()}\nevent: ${eventName}\n${data}\n\n`);
  };

  const route = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://simulator');
    // The official GUI API below /official-api answers what the GUI API of the cockpit answers, from the same data.
    const path = url.pathname.startsWith(`${officialGuiApiPath}/`) ? guiApiPath + url.pathname.slice(officialGuiApiPath.length) : url.pathname;
    const method = req.method ?? 'GET';

    if (path === `${guiApiPath}/app/info`) {
      const info: AppInformation = { titleShort: 'Cockpit', titleLong: 'Business Cockpit of acme', version: 'simulator', additionalProperties: { languages: appLanguages } };
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

    // The roles and rights of the user, for all modules in one answer (NAV-019).
    if (path === `${guiApiPath}/app/current-user/group-hierarchy`) {
      if (!userOf(req)) return send(res, 401);
      hierarchyRequests++;
      if (hierarchyDelayMilliseconds) await new Promise((resolve) => setTimeout(resolve, hierarchyDelayMilliseconds));
      return hierarchyFails ? send(res, 500) : send(res, 200, hierarchyAnswer);
    }
    if (path === '/simulator-api/group-hierarchy' && method === 'POST') {
      const body = await readBody(req);
      hierarchyAnswer = body.answer ?? hierarchyAnswer;
      hierarchyFails = body.fails === true;
      hierarchyDelayMilliseconds = Number(body.delayMilliseconds ?? 0);
      return send(res, 200);
    }
    if (path === '/simulator-api/group-hierarchy-requests') return send(res, 200, hierarchyRequests);

    // The notification settings (NOTI-001 to NOTI-003). A mail address which is not one mailbox is answered with 400 and one line of text.
    const notifications = /^\/gui\/api\/v1\/notifications\/(media|config|recipient-config|workflows)(?:\/([^/]+))?$/.exec(path);
    if (notifications) {
      if (!userOf(req)) return send(res, 401);
      const [, kind, medium] = notifications;
      const body = method === 'PUT' ? await readBody(req) : undefined;
      notificationRequests.push({ method, path: path.slice(guiApiPath.length), body });
      if (kind === 'media' && method === 'GET') return send(res, 200, notificationMedia);
      if (kind === 'workflows' && method === 'GET') return send(res, 200, notificationWorkflows);
      if (kind === 'config' && method === 'GET') return send(res, 200, notificationConfig);
      if (kind === 'config' && method === 'PUT') {
        notificationConfig = body ?? {};
        return send(res, 200);
      }
      if (kind === 'recipient-config' && method === 'GET') {
        return send(res, 200, notificationMedia.filter((one) => one.type === 'email').map((one) => ({
          medium: one.type,
          name: one.name,
          values: [{ type: 'emailAddress', title: { en: 'Address for notifications', de: 'Adresse für Benachrichtigungen' }, description: { en: 'Where the mails go', de: 'Wohin die Mails gehen' }, value: recipientValues.get(`${one.type}:emailAddress`) }],
        })));
      }
      if (kind === 'recipient-config' && method === 'PUT' && medium) {
        const address = String((body ?? {}).emailAddress ?? '');
        if (!/^[^\s@,;]+@[^\s@,;]+$/.test(address)) {
          res.writeHead(400, { 'content-type': 'text/plain' });
          return void res.end('This is not one mailbox.');
        }
        recipientValues.set(`${medium}:emailAddress`, address);
        return send(res, 200);
      }
    }
    if (path === '/simulator-api/notifications' && method === 'POST') {
      const body = await readBody(req);
      notificationMedia = (body.media ?? []) as typeof notificationMedia;
      notificationWorkflows = (body.workflows ?? []) as object[];
      return send(res, 200);
    }
    if (path === '/simulator-api/notification-requests') return send(res, 200, notificationRequests);

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
      if (listsFail) return send(res, 500);
      const body = await readBody(req);
      if (sortRefusal && body.sort) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        return res.end(sortRefusal);
      }
      const initialTimestamp = url.searchParams.get('initialTimestamp') ?? undefined;
      const serverTimestamp = initialTimestamp ?? new Date().toISOString();
      listRequests.push({ path, body, initialTimestamp, serverTimestamp });
      // sort and filter paths are fields of the list, else the cockpit answers 400
      const searches = (body.searchQueries ?? []) as Query[];
      const paths = [
        ...String(body.sort ?? '').split(',').filter(Boolean),
        ...((body.filters ?? []) as { key: string }[]).map((filter) => filter.key),
        ...searches.flatMap((search) => (search.path ? [search.path] : [])),
      ];
      // two entries with the same path answer 500, as the server does today
      const searchPaths = searches.map((search) => search.path ?? '');
      if (new Set(searchPaths).size !== searchPaths.length) return send(res, 500);
      if (paths.some((path) => !/^[A-Za-z0-9_]+(\.[A-Za-z0-9_-]+)*$/.test(path) || (!path.startsWith('details.') && !userTaskFields.includes(path.split('.')[0]!)))) return send(res, 400);
      const shown = userTasks
        .filter((task) => (list[1] ? task.assignee?.id === user.id : true))
        .filter((task) => inMode(task, body.mode as string | undefined, initialTimestamp))
        .filter((task) => searches.every((search) => matches(task, search)));
      const sorted = sortedBy(shown, String(body.sort ?? ''), body.sortAscending !== false);
      const size = Number(body.pageSize ?? 20);
      const number = Number(body.pageNumber ?? 0);
      return send(res, 200, {
        serverTimestamp,
        page: { totalElements: shown.length, totalPages: Math.ceil(shown.length / size), number, size },
        userTasks: sorted.slice(number * size, (number + 1) * size),
      });
    }
    // The suggestions of a search field, like OPTIONS /usertask: over open tasks, not over the primary filter.
    if (list && method === 'OPTIONS') {
      const user = userOf(req);
      if (!user) return send(res, 401);
      const query = url.searchParams.get('query') ?? '';
      const searchPath = url.searchParams.get('path') ?? undefined;
      suggestionRequests.push({ query, path: searchPath, at: Date.now() });
      const searches = (((await readBody(req)).searchQueries ?? []) as Query[]);
      const open = userTasks.filter((task) => (list[1] ? task.assignee?.id === user.id : true)).filter((task) => !task.endedAt && searches.every((search) => matches(task, search)));
      return send(res, 200, { result: suggestionsFor(open, query, searchPath) });
    }
    if (path === '/simulator-api/suggestion-requests') return send(res, 200, suggestionRequests);
    // One task, like GET /usertask/{id}; ?markAsRead=true marks it as read in the same call.
    const oneTask = /^\/gui\/api\/v1(?:\/current-user)?\/usertask\/([^/]+)$/.exec(path);
    if (oneTask && method === 'GET') {
      if (!userOf(req)) return send(res, 401);
      const found = userTasks.find((candidate) => candidate.id === decodeURIComponent(oneTask[1]!));
      if (!found) return send(res, 404);
      if (url.searchParams.get('markAsRead') === 'true') found.read = true;
      return send(res, 200, found);
    }
    // Put a task on follow-up, or clear the date, like PATCH /usertask/{id}/follow-up-date of the cockpit.
    const followUp = /^\/gui\/api\/v1\/usertask\/([^/]+)\/follow-up-date$/.exec(path);
    if (followUp && method === 'PATCH') {
      if (!userOf(req)) return send(res, 401);
      const found = userTasks.find((candidate) => candidate.id === decodeURIComponent(followUp[1]!));
      if (!found) return send(res, 404);
      if (found.endedAt) return send(res, 409);
      const body = await readBody(req);
      bulkRequests.push({ action: 'follow-up-date', ids: [found.id], query: {}, body });
      const timestamp = body.timestamp as string | undefined;
      found.followUpDate = timestamp ?? undefined;
      return send(res, 200, found);
    }
    // Mark as read, or as unread (?unread=true); allowed for an ended task too.
    const markRead = /^\/gui\/api\/v1\/usertask\/([^/]+)\/mark-as-read$/.exec(path);
    if (markRead && method === 'PATCH') {
      if (!userOf(req)) return send(res, 401);
      const found = userTasks.find((candidate) => candidate.id === decodeURIComponent(markRead[1]!));
      if (!found) return send(res, 404);
      found.read = url.searchParams.get('unread') !== 'true';
      return send(res, 200);
    }
    // The same actions for a list of ids, like PATCH /usertask/claim of the cockpit: all or none, 409 when one task may not be changed.
    const bulk = /^\/gui\/api\/v1(?:\/current-user)?\/usertask\/(claim|assign|mark-as-read|note)$/.exec(path);
    if (bulk && method === 'PATCH') {
      const user = userOf(req);
      if (!user) return send(res, 401);
      const body = await readBody(req);
      const ids = (body.userTaskIds ?? []) as string[];
      if (ids.length > 1000) return send(res, 400);
      const action = bulk[1]!;
      bulkRequests.push({ action, ids, query: Object.fromEntries(url.searchParams), body });
      const found = ids.map((id) => userTasks.find((candidate) => candidate.id === id));
      if (found.some((task) => !task)) return send(res, 404);
      const tasks = found as UserTask[];
      const refused = (task: UserTask) =>
        action === 'mark-as-read' ? false : action === 'note' ? Boolean(task.endedAt) : Boolean(task.endedAt || task.suspendedAt);
      if (tasks.some(refused)) return send(res, 409);
      const person = (id: string): Person => {
        const { name, email } = users.find((candidate) => candidate.id === id)!;
        return { id, display: name, displayShort: name.split(' ')[0], email };
      };
      const unclaim = url.searchParams.get('unclaim') === 'true';
      const userId = url.searchParams.get('userId') ?? '';
      if (action === 'assign' && !users.some((candidate) => candidate.id === userId)) return send(res, 400);
      for (const task of tasks) {
        if (action === 'mark-as-read') task.read = url.searchParams.get('unread') !== 'true';
        else if (action === 'note') task.note = (body.text as string | undefined) || undefined;
        else if (action === 'claim') task.assignee = unclaim ? undefined : person(user.id);
        else {
          const others = (task.candidateUsers ?? []).filter((candidate) => candidate.id !== userId);
          task.candidateUsers = url.searchParams.get('unassign') === 'true' ? others : [...others, person(userId)];
        }
      }
      return send(res, 200);
    }
    // One case and the user tasks of one case, like GET /workflow/{id} and POST /workflow/{id}/usertasks of the cockpit.
    const oneCase = /^\/gui\/api\/v1\/workflow\/([^/]+)(\/usertasks)?$/.exec(path);
    if (oneCase && oneCase[1] !== 'note' && ((!oneCase[2] && method === 'GET') || (oneCase[2] && method === 'POST'))) {
      if (!userOf(req)) return send(res, 401);
      const id = decodeURIComponent(oneCase[1]!);
      const found = workflows.find((candidate) => candidate.id === id);
      if (!found) return send(res, 404);
      if (!oneCase[2]) return send(res, 200, found);
      const ofCase = userTasks.filter((task) => (task as Record<string, unknown>).workflowId === id);
      return send(res, 200, { serverTimestamp: new Date().toISOString(), page: { totalElements: ofCase.length, totalPages: 1, number: 0, size: 100 }, userTasks: ofCase });
    }
    // The note of one case and of a list of cases, like PATCH /workflow/{id}/note and /workflow/note of the cockpit.
    const caseNote = /^\/gui\/api\/v1\/workflow\/(?:([^/]+)\/note|note)$/.exec(path);
    if (caseNote && method === 'PATCH') {
      if (!userOf(req)) return send(res, 401);
      const body = await readBody(req);
      const ids = caseNote[1] ? [decodeURIComponent(caseNote[1])] : ((body.workflowIds ?? []) as string[]);
      if (ids.length > 1000) return send(res, 400);
      const found = ids.map((id) => workflows.find((candidate) => candidate.id === id));
      if (found.some((one) => !one)) return send(res, 404);
      bulkRequests.push({ action: caseNote[1] ? 'case-note' : 'cases-note', ids, query: {}, body });
      for (const one of found as Workflow[]) one.note = (body.text as string | undefined) || undefined;
      return send(res, 200);
    }
    if (path === '/simulator-api/bulk-requests') return send(res, 200, bulkRequests);
    // Claim or give back (?unclaim=true), assign or unassign (?userId=) and the note of one task, like the cockpit does it.
    const taskAction = /^\/gui\/api\/v1(?:\/current-user)?\/usertask\/([^/]+)\/(claim|assign|note)$/.exec(path);
    if (taskAction && method === 'PATCH') {
      const user = userOf(req);
      if (!user) return send(res, 401);
      const found = userTasks.find((candidate) => candidate.id === decodeURIComponent(taskAction[1]!));
      if (!found) return send(res, 404);
      if (found.endedAt || found.suspendedAt) return send(res, 409);
      const person = (id: string): Person => {
        const { name, email } = users.find((candidate) => candidate.id === id)!;
        return { id, display: name, displayShort: name.split(' ')[0], email };
      };
      if (taskAction[2] === 'claim') {
        if (url.searchParams.get('unclaim') === 'true') {
          if (found.assignee && found.assignee.id !== user.id) return send(res, 400);
          found.assignee = undefined;
        } else found.assignee = person(user.id);
        return send(res, 200);
      }
      if (taskAction[2] === 'assign') {
        const userId = url.searchParams.get('userId') ?? '';
        if (!users.some((candidate) => candidate.id === userId)) return send(res, 400);
        const others = (found.candidateUsers ?? []).filter((candidate) => candidate.id !== userId);
        found.candidateUsers = url.searchParams.get('unassign') === 'true' ? others : [...others, person(userId)];
        return send(res, 200);
      }
      const text = (await readBody(req)).text as string | undefined;
      found.note = text || undefined;
      return send(res, 200, found);
    }
    // Search users, to propose a task to a person.
    if (/^\/gui\/api\/v1(\/current-user)?\/user$/.test(path) && method === 'POST') {
      if (!userOf(req)) return send(res, 401);
      const query = (url.searchParams.get('query') ?? '').toLowerCase();
      const found = users.filter((user) => user.name.toLowerCase().includes(query) || user.id.includes(query));
      return send(res, 200, { users: found.map(({ id, name, email }) => ({ id, display: name, displayShort: name.split(' ')[0], email })) });
    }
    if (path === '/simulator-api/user-tasks' && method === 'GET') return send(res, 200, userTasks);
    if (path === '/simulator-api/user-tasks' && method === 'POST') {
      userTasks = ((await readBody(req)).userTasks ?? []) as UserTask[];
      return send(res, 200);
    }
    // Many tasks of several modules at once, made here so a test need not post tens of thousands of them;
    // every `closedEvery`-th task has ended, every 7th one is put aside
    if (path === '/simulator-api/generate-user-tasks' && method === 'POST') {
      const { count = 0, modules: moduleCount = 3, closedEvery = 4 } = (await readBody(req)) as { count?: number; modules?: number; closedEvery?: number };
      userTasks = Array.from({ length: count }, (_, index) => {
        const id = `t${String(index).padStart(6, '0')}`;
        const closed = index % closedEvery === closedEvery - 1;
        return {
          id,
          workflowModuleId: `module-${index % moduleCount}`,
          bpmnProcessId: 'process',
          createdAt: '2026-11-20T08:00:00Z',
          updatedAt: '2026-11-20T08:00:00Z',
          businessId: `B-${id}`,
          title: { en: `Check ${id}`, de: `Prüfe ${id}` },
          workflowTitle: { en: `Kind ${index % moduleCount}`, de: `Art ${index % moduleCount}` },
          ...(closed ? { endedAt: '2026-11-21T08:00:00Z' } : {}),
          ...(!closed && index % 7 === 0 ? { followUpDate: '2099-01-01T08:00:00Z' } : {}),
        } as UserTask;
      });
      return send(res, 200);
    }
    if (path === '/simulator-api/workflows' && method === 'POST') {
      workflows = ((await readBody(req)).workflows ?? []) as Workflow[];
      return send(res, 200);
    }
    // The case list: the modes of a case list are All, InProgress (not ended, suspended cases included) and Done.
    if (path === `${guiApiPath}/workflow` && method === 'POST') {
      if (!userOf(req)) return send(res, 401);
      if (listsFail) return send(res, 500);
      const body = await readBody(req);
      const initialTimestamp = url.searchParams.get('initialTimestamp') ?? undefined;
      const serverTimestamp = initialTimestamp ?? new Date().toISOString();
      listRequests.push({ path, body, initialTimestamp, serverTimestamp });
      const searches = (body.searchQueries ?? []) as Query[];
      const shown = workflows
        .filter((one) => inWorkflowMode(one, body.mode as string | undefined))
        .filter((one) => searches.every((search) => matches(one as unknown as UserTask, search)));
      const sorted = sortedBy(shown as unknown as UserTask[], String(body.sort ?? ''), body.sortAscending !== false) as unknown as Workflow[];
      const size = Number(body.pageSize ?? 20);
      const number = Number(body.pageNumber ?? 0);
      return send(res, 200, {
        serverTimestamp,
        page: { totalElements: shown.length, totalPages: Math.ceil(shown.length / size), number, size },
        workflows: sorted.slice(number * size, (number + 1) * size),
      });
    }
    if (path === `${guiApiPath}/usertasks`) {
      return userOf(req) ? send(res, 200, { userTasks: [] }) : send(res, 401);
    }
    if (path === '/simulator-api/fail-lists' && method === 'POST') {
      listsFail = Boolean((await readBody(req)).fail);
      return send(res, 200);
    }
    if (path === '/simulator-api/refuse-sort' && method === 'POST') {
      sortRefusal = ((await readBody(req)).text as string | undefined) || undefined;
      return send(res, 200);
    }
    if (path === '/simulator-api/list-requests') return send(res, 200, listRequests);

    // The counts of the header toggle, for the three base paths of the lists.
    const countPath = /^\/gui\/api\/v1(\/current-user)?\/(usertask|workflow)\/count$/.exec(path);
    if (countPath && method === 'POST') {
      if (!userOf(req)) return send(res, 401);
      const filters = ((await readBody(req)).filters ?? []) as { key: string; mode?: string }[];
      countRequests.push({ path, mode: filters[0]?.mode, modes: filters.map((filter) => filter.mode ?? ''), keys: filters.map((filter) => filter.key) });
      const total = countPath[2] === 'workflow' ? counts.cases : countPath[1] ? counts.myTasks : counts.allTasks;
      // the toggle of the header takes the numbers a test sets, the primary filters of a list count the tasks
      const countOf = (filter: { key: string; mode?: string }): number => {
        if (filter.key === 'toggle') return total;
        if (countPath[2] === 'workflow') return workflows.filter((one) => inWorkflowMode(one, filter.mode)).length;
        return userTasks.filter((task) => (countPath[1] ? task.assignee?.id === userOf(req)?.id : true)).filter((task) => inMode(task, filter.mode)).length;
      };
      return send(res, 200, { serverTimestamp: new Date().toISOString(), counts: filters.map((filter) => ({ key: filter.key, count: countOf(filter) })) });
    }
    if (path === '/simulator-api/counts' && method === 'POST') {
      counts = { ...counts, ...(await readBody(req)) };
      return send(res, 200);
    }
    if (path === '/simulator-api/count-requests') return send(res, 200, countRequests);
    if (path === '/simulator-api/count-requests/clear' && method === 'POST') {
      countRequests = [];
      return send(res, 200);
    }
    if (path === '/simulator-api/current-user' && method === 'POST') {
      namesOfCurrentUser = await readBody(req);
      return send(res, 200);
    }
    // One delivery of the update stream: one event with the given number of elements.
    if (path === '/simulator-api/publish' && method === 'POST') {
      const body = await readBody(req);
      // `items` are the elements as they are, else `elements` ones with an id each
      publish(String(body.event), (body.items as object[] | undefined) ?? Array.from({ length: Number(body.elements ?? 1) }, () => ({ id: crypto.randomUUID() })));
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
    // a test changes the languages app/info offers
    if (path === '/simulator-api/app-languages' && method === 'POST') {
      appLanguages = String((await readBody(req)).languages);
      return send(res, 200);
    }
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

    // a test lets the server end the streams, and asks how many are open
    if (path === '/simulator-api/end-streams' && method === 'POST') {
      for (const stream of [...streams]) stream.end();
      streams.clear();
      return send(res, 200);
    }
    if (path === '/simulator-api/stream-count') return send(res, 200, streams.size);
    if (path === '/simulator-api/stream-refusal' && method === 'POST') {
      streamRefusal = ((await readBody(req)).status as number | undefined) ?? undefined;
      return send(res, 200);
    }
    if (path === '/simulator-api/reload-after-open' && method === 'POST') {
      reloadAfterOpenMs = Number((await readBody(req)).milliseconds ?? 0);
      return send(res, 200);
    }
    if (path === '/simulator-api/stream-attempts') return send(res, 200, streamAttempts);

    if (path === `${guiApiPath}/updates`) {
      streamAttempts.push(Date.now());
      if (streamRefusal) return send(res, streamRefusal);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      streams.add(res);
      res.write(': stream open\n\n');
      setTimeout(() => {
        for (const event of ['UserTask', 'Workflow']) {
          const data = JSON.stringify([{ event: { name: event, id: '', type: 'RELOAD', initiatorKind: 'SYSTEM' } }], null, 2).split('\n').map((line) => `data: ${line}`).join('\n');
          if (streams.has(res)) res.write(`id: ${crypto.randomUUID()}\nevent: ${event}\n${data}\n\n`);
        }
      }, reloadAfterOpenMs);
      req.on('close', () => streams.delete(res));
      return;
    }

    const visibleTo = (module: SimulatedModule, user: SimulatedUser | undefined) =>
      module.accessibleToGroups.length === 0 || (user?.groups ?? []).some((group) => module.accessibleToGroups.includes(group));
    const oneModule = new RegExp(`^(?:${officialGuiApiPath}|${guiApiPath})/workflow-module/([^/]+)$`).exec(path);
    if (oneModule && method === 'GET') {
      const module = modules.get(oneModule[1]);
      if (!module || !visibleTo(module, userOf(req))) return send(res, 404);
      return send(res, 200, { id: module.id, version: module.version, uri: module.uri });
    }
    if ((path === `${officialGuiApiPath}/workflow-module` || path === `${guiApiPath}/workflow-module`) && method === 'GET') {
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
      streamRefusal = undefined;
      streamAttempts = [];
      reloadAfterOpenMs = 0;
      protectPages = true;
      groupsOfCurrentUser = undefined;
      namesOfCurrentUser = {};
      counts = { myTasks: 0, allTasks: 0, cases: 0 };
      countRequests = [];
      userTasks = [];
      workflows = [];
      listRequests = [];
      bulkRequests = [];
      suggestionRequests = [];
      listsFail = false;
      sortRefusal = undefined;
      settingsOfUsers = new Map();
      appLanguages = 'en,de,fr,es';
      settingRequests = [];
      notificationMedia = [];
      notificationWorkflows = [];
      notificationConfig = {};
      recipientValues = new Map();
      notificationRequests = [];
      hierarchyAnswer = { givenByOrganisation: [], modules: [] };
      hierarchyFails = false;
      hierarchyDelayMilliseconds = 0;
      hierarchyRequests = 0;
      savedAddress = undefined;
      return send(res, 200);
    }

    // The built test modules, the way the cockpit forwards to a module. No other module is served.
    const modulePart = /^\/wm\/([^/]+)\/(.+)$/.exec(path);
    if (modulePart && testModules.includes(modulePart[1])) {
      const file = join(modulesFolder, modulePart[1], 'dist', modulePart[2]);
      if (!file.includes('..') && existsSync(file)) {
        // The module is the upstream and this is the proxy: it passes Cache-Control, ETag, Last-Modified and Content-Encoding on
        // unchanged and passes a conditional request on, so a manifest which did not change is a 304 (EXT-059).
        const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream';
        const upstream = moduleAnswer(file, type, req.headers);
        res.writeHead(upstream.status, upstream.headers);
        return void res.end(upstream.body);
      }
    }

    // The test application of the dev shell, built without a cockpit.
    const devShellFile = /^\/dev-shell-app\/([A-Za-z0-9._-]+)$/.exec(path);
    if (devShellFile && method === 'GET') {
      const file = join(devShellFolder, devShellFile[1]!);
      if (existsSync(file)) {
        res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
        return void res.end(readFileSync(file));
      }
    }

    // The built user interface: files below /assets/ stay open, index.html for every other path of
    // a page asks for a login first, before any deep link.
    if (method === 'GET' && !/^\/(gui|official-api|bpms|dev-shell|dev-shell-app|simulator-api|simulator-idp|wm)\//.test(path)) {
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
