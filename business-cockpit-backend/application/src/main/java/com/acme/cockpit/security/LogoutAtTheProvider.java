package com.acme.cockpit.security;

import io.vanillabp.cockpit.support.security.jwt.JwtProperties;
import io.vanillabp.cockpit.support.security.jwt.JwtSecurityContextRepository;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.WebUtils;

/**
 * Ends the login in the cockpit, and at the provider when it offers an end of session: without
 * that, the provider would log the user in again at the next request, without a question.
 */
class LogoutAtTheProvider implements LogoutSuccessHandler {

  private static final String PROVIDER = "keycloak";

  private final JwtProperties jwtProperties;

  private final ClientRegistrationRepository clientRegistrations;

  /** Where the application reaches Keycloak. */
  private final String keycloakUrl;

  /**
   * Where the browser reaches Keycloak when that differs, for example behind a port mapping of a
   * dev container. Empty when it is the same.
   */
  private final String keycloakBrowserUrl;

  LogoutAtTheProvider(final JwtProperties jwtProperties,
      final ClientRegistrationRepository clientRegistrations,
      final String keycloakUrl,
      final String keycloakBrowserUrl) {
    this.jwtProperties = jwtProperties;
    this.clientRegistrations = clientRegistrations;
    this.keycloakUrl = keycloakUrl;
    this.keycloakBrowserUrl = keycloakBrowserUrl;
  }

  @Override
  public void onLogoutSuccess(final HttpServletRequest request,
      final HttpServletResponse response, final Authentication authentication) throws IOException {
    JwtSecurityContextRepository.clearCookie(jwtProperties, response);
    final var idToken = WebUtils.getCookie(request, KeepTheIdTokenForTheLogout.ID_TOKEN_COOKIE);
    response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie
        .from(KeepTheIdTokenForTheLogout.ID_TOKEN_COOKIE, "").path("/logout").maxAge(0).build()
        .toString());

    final var startPage = ServletUriComponentsBuilder.fromContextPath(request).path("/")
        .toUriString();
    final var provider = clientRegistrations.findByRegistrationId(PROVIDER);
    final var endOfSession = provider.getProviderDetails().getConfigurationMetadata()
        .get("end_session_endpoint");
    if (endOfSession == null) {
      response.sendRedirect(startPage);
      return;
    }
    response.sendRedirect(UriComponentsBuilder.fromUriString(forTheBrowser(endOfSession.toString()))
        .queryParamIfPresent("id_token_hint", Optional.ofNullable(idToken).map(Cookie::getValue))
        .queryParam("client_id", provider.getClientId())
        .queryParam("post_logout_redirect_uri", startPage)
        .encode()
        .toUriString());
  }

  /** The discovery document names Keycloak as the application reaches it, not as the browser does. */
  private String forTheBrowser(final String address) {
    if (keycloakBrowserUrl.isBlank() || !address.startsWith(keycloakUrl)) {
      return address;
    }
    return keycloakBrowserUrl + address.substring(keycloakUrl.length());
  }

}
