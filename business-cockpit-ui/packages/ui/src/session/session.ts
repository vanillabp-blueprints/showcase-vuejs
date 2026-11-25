import { OfficialCurrentUserApi } from '../generated/official-gui-api';
import type { User } from '../generated/official-gui-api';

// The login is the job of the backend. The user interface only sends the browser there.
export const loginPath = '/oauth2/authorization/keycloak';

/** The backend keeps the address while the user logs in and brings the browser back to it. */
export function goToLogin(): void {
  window.location.assign(loginPath);
}

/** The user who is logged in. Without a login the browser leaves for the login and nothing is returned. */
export async function currentUser(): Promise<User | undefined> {
  // an answer without a body means that nobody is logged in
  const user = await new OfficialCurrentUserApi().currentUser();
  if (!user?.id) {
    goToLogin();
    return undefined;
  }
  return user;
}

/**
 * Any later request answered with 401 loads the current address again as a whole page. The backend
 * asks for the login before every page and keeps the address, so after the login the user is back
 * on the same screen.
 */
export function sendToLoginOnUnauthorized(): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401) window.location.assign(window.location.href);
    return response;
  };
}
