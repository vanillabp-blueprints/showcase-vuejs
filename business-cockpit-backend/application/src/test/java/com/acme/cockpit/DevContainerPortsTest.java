package com.acme.cockpit;

import io.vanillabp.integration.test.utils.SuppressOutputExtension;
import org.junit.jupiter.api.extension.ExtendWith;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.util.UriComponentsBuilder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mongodb.MongoDBContainer;

/**
 * The profile devcontainer: the application reaches Keycloak at its own address, but the browser
 * of a dev container reaches it at a port with an offset, so every address the browser follows has
 * to name that one.
 */
@ExtendWith(SuppressOutputExtension.class)
@SuppressOutputExtension.SuppressBackgroundOutput
@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "bpms-api.username=abc",
        "bpms-api.password={noop}123",
        "business-cockpit.application-uri=http://localhost",
        "spring.profiles.active=devcontainer",
        "business-cockpit.jwt.hmacSHA256-base64=4FTHgU8uHPy/ahy8IhXHj/K/BVlh7snSUtf3m1XWLkg=",
    })
class DevContainerPortsTest {

  @Container
  @ServiceConnection
  static final MongoDBContainer MONGODB = new MongoDBContainer("mongo:8.0.4");

  @DynamicPropertySource
  static void keycloak(final DynamicPropertyRegistry registry) {
    TestKeycloak.register(registry);
    // the application reaches Keycloak by another name than the browser does
    registry.add("keycloak-browser-url", TestKeycloak::url);
    registry.add("KEYCLOAK_URL", () -> TestKeycloak.url().replaceFirst("//[^:]+:", "//localhost:"));
  }

  @Value("${local.server.port}")
  private int port;

  private TestBrowser browser;

  @BeforeEach
  void openABrowser() {
    browser = new TestBrowser(port);
  }

  @Test
  @DisplayName("BE-040 with the profile devcontainer the login page is opened at the address of the browser and comes back to the address the browser used")
  void BE_040_the_login_page_is_opened_at_the_port_of_the_browser() throws Exception {
    final var toTheLogin = browser.get("/oauth2/authorization/keycloak");

    assertThat(toTheLogin.statusCode()).isIn(302, 303);
    final var target = URI.create(toTheLogin.headers().firstValue("Location").orElseThrow());
    assertThat(target.toString())
        .startsWith(browserUrl() + "/realms/business-cockpit/protocol/openid-connect/auth");
    final var query = UriComponentsBuilder.fromUri(target).build().getQueryParams();
    assertThat(query.getFirst("redirect_uri"))
        .isEqualTo(browser.base() + "/login/oauth2/code/keycloak");
  }

  @Test
  @DisplayName("BE-041 with the profile devcontainer the logout goes to the end session endpoint at the address of the browser")
  void BE_041_the_logout_goes_to_the_end_session_endpoint_at_the_port_of_the_browser()
      throws Exception {
    final var logout = browser.get("/logout");

    assertThat(logout.statusCode()).isIn(302, 303);
    assertThat(logout.headers().firstValue("Location").orElseThrow()).startsWith(
        browserUrl() + "/realms/business-cockpit/protocol/openid-connect/logout");
  }

  @Test
  @DisplayName("BE-042 with the profile devcontainer the login succeeds although Keycloak names itself in the ID token as the browser reached it")
  void BE_042_the_login_succeeds_when_the_browser_reaches_keycloak_by_another_address()
      throws Exception {
    browser.logIn();

    final var currentUser = browser.getJson("/gui/api/v1/app/current-user");
    assertThat(currentUser.statusCode()).isEqualTo(200);
    assertThat(currentUser.body()).contains(TestBrowser.USER);
  }

  private static String browserUrl() {
    return TestKeycloak.url();
  }

}
