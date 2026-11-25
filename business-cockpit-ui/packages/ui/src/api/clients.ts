import { client as cockpitClient } from '../generated/cockpit-gui-api/client.gen';
import { client as officialClient } from '../generated/official-gui-api/client.gen';
import { guiApiBasePath } from '../config';

export function configureGuiApiClients(basePath: string = guiApiBasePath): void {
  officialClient.setConfig({ baseUrl: basePath });
  cockpitClient.setConfig({ baseUrl: basePath });
}

export function updateStreamUrl(basePath: string = guiApiBasePath): string {
  return `${basePath}/updates`;
}
