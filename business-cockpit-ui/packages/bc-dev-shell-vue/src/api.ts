/** What the shell reads from the GUI API of the simulator; the shape is the one of the cockpit's GUI API. */
export interface Entry { id: string; title?: Record<string, string> }
export interface DevShellUser { id: string; name: string }

export class NotAllowed extends Error {}

export function createApi(guiApiBase: string) {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(path, init);
    if (response.status === 401) throw new NotAllowed('no user is chosen');
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    return (await response.json()) as T;
  };
  const list = async (kind: 'usertask' | 'workflow'): Promise<Entry[]> => {
    // the drop-down asks with the primary filter All, newest first, in blocks of 20 (dev-shell.md)
    const body = JSON.stringify({ mode: 'All', pageNumber: 0, pageSize: 20, sort: 'createdAt', sortAscending: false });
    const answer = await call<{ userTasks?: Entry[]; workflows?: Entry[] }>(`${guiApiBase}/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    return (kind === 'usertask' ? answer.userTasks : answer.workflows) ?? [];
  };
  return {
    userTasks: () => list('usertask'),
    workflows: () => list('workflow'),
    userTask: (id: string) => call<Record<string, unknown>>(`${guiApiBase}/usertask/${encodeURIComponent(id)}`),
    workflow: (id: string) => call<Record<string, unknown>>(`${guiApiBase}/workflow/${encodeURIComponent(id)}`),
    users: () => call<DevShellUser[]>('/dev-shell/user/all'),
    chosenUser: async () => (await (await fetch('/dev-shell/user/')).text()) || '---',
    chooseUser: async (id: string) => { await fetch(`/dev-shell/user/${encodeURIComponent(id)}`, { method: 'POST' }); },
  };
}
