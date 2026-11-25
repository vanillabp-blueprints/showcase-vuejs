import { client as cockpitClient } from '../generated/cockpit-gui-api/client.gen';
import { client as officialClient } from '../generated/official-gui-api/client.gen';
import { guiApiBasePath } from '../config';

// a failed call keeps the status and the text of its answer, so an action can tell a conflict from a refusal (ACT-013, ACT-015)
// and a list can show what the server wrote for the user (SRCH-034)
export class FailedCall extends Error {
  constructor(readonly status: number | undefined, readonly answer?: string) {
    super(`call failed with ${status}`);
  }
}

function answerTextOf(error: unknown): string | undefined {
  if (typeof error === 'string') return error || undefined;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : undefined;
}

let statusKept = false;

export function configureGuiApiClients(basePath: string = guiApiBasePath): void {
  if (!statusKept) {
    officialClient.interceptors.error.use((error, response) => new FailedCall(response?.status, answerTextOf(error)));
    statusKept = true;
  }
  officialClient.setConfig({ baseUrl: basePath });
  cockpitClient.setConfig({ baseUrl: basePath });
}

export function updateStreamUrl(basePath: string = guiApiBasePath): string {
  return `${basePath}/updates`;
}
