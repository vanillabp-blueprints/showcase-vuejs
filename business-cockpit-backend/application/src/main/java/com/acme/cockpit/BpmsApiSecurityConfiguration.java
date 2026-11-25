package com.acme.cockpit;

import static org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.pathPattern;

import io.vanillabp.cockpit.bpms.BpmsApiAuthority;
import io.vanillabp.cockpit.bpms.BpmsApiProperties;
import io.vanillabp.cockpit.config.startup.BpmsApiIsConfigured;
import io.vanillabp.cockpit.config.startup.BpmsApiIsNotConfigured;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationEntryPoint;
import org.springframework.security.web.context.NullSecurityContextRepository;
import org.springframework.security.web.util.matcher.OrRequestMatcher;

/**
 * Secures the BPMS API with HTTP basic against the one user the workflow modules report with.
 * A workflow module authenticates on every request, so nothing is kept between requests.
 */
@Configuration
public class BpmsApiSecurityConfiguration {

  private final BpmsApiProperties properties;

  public BpmsApiSecurityConfiguration(final BpmsApiProperties properties) {
    this.properties = properties;
  }

  @Bean
  @Order(1)
  @Conditional(BpmsApiIsConfigured.class)
  public SecurityFilterChain bpmsApiHttpSecurity(final HttpSecurity http) throws Exception {

    final var basicEntryPoint = new BasicAuthenticationEntryPoint();
    basicEntryPoint.setRealmName(properties.getRealmName());
    basicEntryPoint.afterPropertiesSet();

    return http
        .securityMatcher(new OrRequestMatcher(
            pathPattern(io.vanillabp.cockpit.bpms.api.v1.BpmsApiController.BPMS_API_URL_PREFIX + "/**"),
            pathPattern(io.vanillabp.cockpit.bpms.api.v1_1.BpmsApiController.BPMS_API_URL_PREFIX + "/**")))
        .csrf(AbstractHttpConfigurer::disable)
        .cors(AbstractHttpConfigurer::disable)
        .authorizeHttpRequests(requests -> requests.anyRequest().authenticated())
        .authenticationManager(new ProviderManager(
            new DaoAuthenticationProvider(bpmsApiUserDetailsService())))
        .httpBasic(basic -> basic
            .securityContextRepository(new NullSecurityContextRepository())
            .authenticationEntryPoint(basicEntryPoint))
        .build();

  }

  @Bean
  @Conditional(BpmsApiIsConfigured.class)
  public InMemoryUserDetailsManager bpmsApiUserDetailsService() {

    final var user = User.builder()
        .username(properties.getUsername())
        .password(properties.getPassword())
        .roles(BpmsApiAuthority.BPMS_API_ROLE)
        .build();
    return new InMemoryUserDetailsManager(user);

  }

  /**
   * Stands in for the BPMS API user as long as it is not configured. Without a
   * {@code UserDetailsService} Spring Boot invents a user and prints its password.
   */
  @Bean
  @Conditional(BpmsApiIsNotConfigured.class)
  public InMemoryUserDetailsManager noUsersUntilTheBpmsApiIsConfigured() {

    return new InMemoryUserDetailsManager();

  }

}
