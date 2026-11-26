// What the dev server of a dev shell forwards (dev-shell.md, The proxy of the dev server). It runs in node, so the browser
// code of the kit does not import it; a dev server config imports `@acme/bc-module-kit/dist/dev-server-proxy.js`.
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface DevShellProxyOptions {
  /** The dev shell simulator, `http://localhost:8079` by default. */
  simulator?: string;
  /** The workflow modules whose forms call their own backend through `/wm/<id>/`, by id. */
  workflowModules?: Record<string, string>;
  /** The page every other path gets, because the dev shell is a single-page application. */
  startPage: string;
}

/** The prefix of a path and where it goes, without the prefix for a workflow module: `/wm/<id>` is cut off. */
export function devShellProxyTable({ simulator = 'http://localhost:8079', workflowModules = {} }: Omit<DevShellProxyOptions, 'startPage'>): Record<string, { target: string; cutPrefix: boolean }> {
  return {
    '/official-api': { target: simulator, cutPrefix: false },
    '/dev-shell': { target: simulator, cutPrefix: false },
    ...Object.fromEntries(Object.entries(workflowModules).map(([id, target]) => [`/wm/${id}`, { target, cutPrefix: true }])),
  };
}

/** A node request handler for the dev server: forwards by the table, answers the start page for any other path. */
export function createDevShellProxy(options: DevShellProxyOptions) {
  const table = devShellProxyTable(options);
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = request.url ?? '/';
    const prefix = Object.keys(table).find((candidate) => url === candidate || /^[/?]/.test(url.slice(candidate.length)) && url.startsWith(candidate));
    if (!prefix) {
      response.writeHead(200, { 'content-type': 'text/html' });
      return void response.end(options.startPage);
    }
    const { target, cutPrefix } = table[prefix]!;
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !['host', 'connection', 'content-length'].includes(name))) as Record<string, string>;
    const hasBody = !['GET', 'HEAD'].includes(request.method ?? 'GET');
    try {
      const answer = await fetch(target + (cutPrefix ? url.slice(prefix.length) || '/' : url), { method: request.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined, redirect: 'manual' });
      const answered: Record<string, string | string[]> = Object.fromEntries([...answer.headers].filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].includes(name)));
      const cookies = answer.headers.getSetCookie();
      if (cookies.length) answered['set-cookie'] = cookies;
      response.writeHead(answer.status, answered);
      response.end(Buffer.from(await answer.arrayBuffer()));
    } catch (error) {
      response.writeHead(502, { 'content-type': 'text/plain' });
      response.end(`the dev server could not reach ${target}: ${String(error)}`);
    }
  };
}
