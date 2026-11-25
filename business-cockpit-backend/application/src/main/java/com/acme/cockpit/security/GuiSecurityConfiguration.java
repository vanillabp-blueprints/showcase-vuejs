package com.acme.cockpit.security;

import static io.vanillabp.cockpit.config.web.WebSecurityConfiguration.appInfoRequestMatcher;
import static io.vanillabp.cockpit.config.web.WebSecurityConfiguration.assetsRequestMatcher;
import static io.vanillabp.cockpit.config.web.WebSecurityConfiguration.currentUserRequestMatcher;
import static io.vanillabp.cockpit.config.web.WebSecurityConfiguration.staticRequestMatcher;
import static io.vanillabp.cockpit.config.web.WebSecurityConfiguration.updatesRequestMatcher;
import static io.vanillabp.cockpit.config.web.WebSecurityConfiguration.workflowModulesProxyRequestMatcher;
import static org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.pathPattern;

import io.vanillabp.cockpit.config.properties.ApplicationProperties;
import io.vanillabp.cockpit.support.security.jwt.JwtAuthenticationToken;
import io.vanillabp.cockpit.support.security.jwt.JwtLogoutSuccessHandler;
import io.vanillabp.cockpit.support.security.jwt.JwtMapper;
import io.vanillabp.cockpit.support.security.jwt.JwtRenewalFilter;
import io.vanillabp.cockpit.support.security.jwt.JwtSecurityContextRepository;
import io.vanillabp.cockpit.support.security.jwt.JwtUserDetailsProvider;
import io.vanillabp.cockpit.support.security.jwt.PassiveJwtSecurityFilter;
import io.vanillabp.cockpit.support.security.usercontext.UserDetailsProvider;
import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter;
import org.springframework.security.oauth2.client.web.OAuth2LoginAuthenticationFilter;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestCustomizers;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;

/**
 * How a person logs in: at the OpenID Connect provider, Keycloak. After the login the cockpit's
 * own token travels in the cookie of the cockpit, and nothing else carries a login.
 */
@Configuration
public class GuiSecurityConfiguration {

  private final ApplicationProperties properties;

  public GuiSecurityConfiguration(final ApplicationProperties properties) {
    this.properties = properties;
  }

  /**
   * The chain of the GUI API and the user interface. It has no security matcher, so it takes every
   * request that no other chain takes.
   */
  @Bean
  @Order(99)
  public SecurityFilterChain guiHttpSecurity(
      final HttpSecurity http,
      final JwtSecurityContextRepository jwtSecurityContextRepository,
      final JwtMapper<? extends JwtAuthenticationToken> jwtMapper,
      final ClientRegistrationRepository clientRegistrationRepository) throws Exception {

    // Spring Authorization Server asks every client for PKCE, although the client has a secret
    final var authorizationRequests = new DefaultOAuth2AuthorizationRequestResolver(
        clientRegistrationRepository,
        OAuth2AuthorizationRequestRedirectFilter.DEFAULT_AUTHORIZATION_REQUEST_BASE_URI);
    authorizationRequests.setAuthorizationRequestCustomizer(
        OAuth2AuthorizationRequestCustomizers.withPkce());

    http
        .csrf(AbstractHttpConfigurer::disable)
        .cors(AbstractHttpConfigurer::disable)
        .anonymous(AbstractHttpConfigurer::disable)
        .authorizeHttpRequests(requests -> requests
            // a later dispatch of a request that was checked already
            .dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR)
            .permitAll()
            .requestMatchers(appInfoRequestMatcher, currentUserRequestMatcher, assetsRequestMatcher,
                staticRequestMatcher, workflowModulesProxyRequestMatcher)
            .permitAll()
            // the actuator is for operations: an endpoint gets a chain of its own below order 99
            .requestMatchers(pathPattern("/actuator/**"))
            .denyAll()
            .anyRequest()
            .authenticated())
        // the GUI API answers 401 instead of a redirect to the provider, so the user interface
        // notices a lost login. It comes before oauth2Login, so it is asked first
        .exceptionHandling(exceptions -> exceptions
            .defaultAuthenticationEntryPointFor(
                new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                PathPatternRequestMatcher.withDefaults().matcher("/gui/api/**")))
        .oauth2Login(login -> login
            .authorizationEndpoint(endpoint -> endpoint
                .authorizationRequestResolver(authorizationRequests))
            // writing the login to the repository of the chain would keep it in the HTTP session,
            // so the post processor replaces it after Spring Security has built the filter
            .withObjectPostProcessor(new ObjectPostProcessor<OAuth2LoginAuthenticationFilter>() {
              @Override
              public <O extends OAuth2LoginAuthenticationFilter> O postProcess(final O filter) {
                filter.setSecurityContextRepository(jwtSecurityContextRepository);
                return filter;
              }
            }))
        .logout(logout -> logout
            .logoutUrl("/logout")
            .logoutSuccessHandler(jwtLogoutSuccessHandler()))
        .addFilterAfter(new PassiveJwtSecurityFilter(properties.getJwt(), jwtMapper),
            BasicAuthenticationFilter.class)
        .addFilterAfter(new JwtRenewalFilter(properties.getJwt(), jwtMapper, updatesRequestMatcher),
            PassiveJwtSecurityFilter.class);

    return http.build();

  }

  private JwtLogoutSuccessHandler jwtLogoutSuccessHandler() {

    final var handler = new JwtLogoutSuccessHandler(properties.getJwt());
    handler.setDefaultTargetUrl("/");
    return handler;

  }

  /**
   * The library needs this bean and brings none. It needs no directory of its own: the library's
   * {@code jwtMapper} asks the user directory on every request.
   */
  @Bean
  public UserDetailsProvider userDetailsProvider() {

    return new JwtUserDetailsProvider();

  }

}
