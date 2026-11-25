package com.acme.cockpit.userinterface;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cloud.gateway.server.mvc.filter.BeforeFilterFunctions;
import org.springframework.cloud.gateway.server.mvc.handler.GatewayRouterFunctions;
import org.springframework.cloud.gateway.server.mvc.handler.HandlerFunctions;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.http.HttpMethod;
import org.springframework.web.servlet.function.RequestPredicates;
import org.springframework.web.servlet.function.support.RouterFunctionMapping;

/**
 * Passes every path the backend does not answer itself to the user interface, at the address in
 * {@code user-interface.uri}. The route is not a {@code RouterFunction} bean: Spring MVC asks
 * those before the controllers, and a route for {@code /**} there would take every GET.
 */
@Configuration
@ConditionalOnProperty("user-interface.uri")
public class UserInterfaceRouteConfiguration {

  // after the controllers (order 0), before the static files of the UI jar
  private static final int AFTER_THE_CONTROLLERS = Ordered.LOWEST_PRECEDENCE - 10;

  @Bean
  public RouterFunctionMapping userInterfaceRoute(@Value("${user-interface.uri}") final String uri) {

    final var route = GatewayRouterFunctions
        .route("user-interface")
        .route(RequestPredicates.method(HttpMethod.GET).and(RequestPredicates.path("/**")),
            HandlerFunctions.http())
        .before(BeforeFilterFunctions.uri(uri))
        .build();
    final var mapping = new RouterFunctionMapping(route);
    mapping.setOrder(AFTER_THE_CONTROLLERS);
    return mapping;

  }

}
