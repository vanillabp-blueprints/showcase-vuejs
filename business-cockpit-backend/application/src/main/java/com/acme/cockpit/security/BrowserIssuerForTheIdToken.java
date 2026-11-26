package com.acme.cockpit.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenDecoderFactory;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenValidator;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.jwt.JwtDecoderFactory;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;

/**
 * Keycloak names itself in the ID token as the browser reached it when the login began, for example
 * http://localhost:38180, while the application read the issuer from Keycloak at its own address
 * (http://localhost:8180). Behind a port mapping both differ, so the ID token is checked against
 * the address of the browser. Everything else of the check stays as Spring does it.
 *
 * <p>Keycloak also refuses the access token at its user info endpoint, because the request names
 * another address than the token. The ID token already carries the claims the cockpit needs, so the
 * user info is not asked for.
 */
@Configuration
@Profile("devcontainer")
class BrowserIssuerForTheIdToken {

  @Bean
  JwtDecoderFactory<ClientRegistration> idTokenDecoderFactory(
      @Value("${keycloak-browser-url}") final String keycloakBrowserUrl) {
    final var factory = new OidcIdTokenDecoderFactory();
    factory.setJwtValidatorFactory(registration -> new DelegatingOAuth2TokenValidator<>(
        new JwtTimestampValidator(),
        new OidcIdTokenValidator(ClientRegistration.withClientRegistration(registration)
            .issuerUri(keycloakBrowserUrl + "/realms/business-cockpit")
            .build())));
    return factory;
  }

  @Bean
  OAuth2UserService<OidcUserRequest, OidcUser> oidcUserService() {
    final var service = new OidcUserService();
    service.setRetrieveUserInfo(request -> false);
    return service;
  }

}
