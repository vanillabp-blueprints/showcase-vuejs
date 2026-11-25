import { client as cockpitClient } from '../generated/cockpit-gui-api/client.gen';
import { client as officialClient } from '../generated/official-gui-api/client.gen';
import { guiApiBasePath } from '../config';

// a failed call keeps the status of its answer, so an action can tell a conflict from a refusal (ACT-013, ACT-015)
export class FailedCall extends Error {
  constructor(readonly status: number | undefined) {
    super(`call failed with ${status}`);
  }
}

let statusKept = false;

export function configureGuiApiClients(basePath: string = guiApiBasePath): void {
  if (!statusKept) {
    officialClient.interceptors.error.use((_error, response) => new FailedCall(response?.status));
    statusKept = true;
  }
  officialClient.setConfig({ baseUrl: basePath });
  cockpitClient.setConfig({ baseUrl: basePath });
}

export function updateStreamUrl(basePath: string = guiApiBasePath): string {
  return `${basePath}/updates`;
}
