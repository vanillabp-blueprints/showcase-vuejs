package com.acme.cockpit.security;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.SavedRequestAwareAuthenticationSuccessHandler;

/**
 * Keeps the ID token of the provider in a cookie of its own, for the logout at the provider. The
 * browser sends the cookie with the logout only, because its path is {@code /logout}.
 */
class KeepTheIdTokenForTheLogout extends SavedRequestAwareAuthenticationSuccessHandler {

  static final String ID_TOKEN_COOKIE = "bc-id-token";

  @Override
  public void onAuthenticationSuccess(final HttpServletRequest request,
      final HttpServletResponse response, final Authentication authentication)
      throws ServletException, IOException {
    if (authentication.getPrincipal() instanceof OidcUser user) {
      final var cookie = ResponseCookie.from(ID_TOKEN_COOKIE, user.getIdToken().getTokenValue())
          .httpOnly(true)
          .secure(request.isSecure())
          .sameSite("Lax")
          .path("/logout")
          .build();
      response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
    super.onAuthenticationSuccess(request, response, authentication);
  }

}
