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
 * Logs in and out at a real Keycloak, the one of keycloak/realm.json: the logout has to end the
 * session at Keycloak, or the next request would log the user in again without a question.
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
        "business-cockpit.jwt.hmacSHA256-base64=4FTHgU8uHPy/ahy8IhXHj/K/BVlh7snSUtf3m1XWLkg=",
    })
class LogoutTest {

  @Container
  @ServiceConnection
  static final MongoDBContainer MONGODB = new MongoDBContainer("mongo:8.0.4");

  @DynamicPropertySource
  static void keycloak(final DynamicPropertyRegistry registry) {
    TestKeycloak.register(registry);
  }

  @Value("${local.server.port}")
  private int port;

  private TestBrowser browser;

  @BeforeEach
  void openABrowser() {
    browser = new TestBrowser(port);
  }

  @Test
  @DisplayName("BE-032 the login keeps the ID token in an HttpOnly cookie with the path /logout, and the logout deletes both cookies and goes to the end session endpoint of Keycloak")
  void BE_032_the_login_keeps_the_id_token_in_a_cookie_and_the_logout_goes_to_the_end_session_endpoint()
      throws Exception {
    browser.logIn();
    final var idToken = browser.cookie("bc-id-token").orElseThrow();
    assertThat(idToken.isHttpOnly()).isTrue();
    assertThat(idToken.getPath()).isEqualTo("/logout");
    assertThat(browser.cookie("bc")).isPresent();

    final var logout = browser.get("/logout");

    assertThat(logout.statusCode()).isIn(302, 303);
    final var target = URI.create(logout.headers().firstValue("Location").orElseThrow());
    assertThat(target.toString()).startsWith(TestKeycloak.url() + "/realms/business-cockpit/protocol/openid-connect/logout");
    final var query = UriComponentsBuilder.fromUri(target).build().getQueryParams();
    assertThat(query.getFirst("id_token_hint")).isEqualTo(idToken.getValue());
    assertThat(query.getFirst("client_id")).isEqualTo("business-cockpit");
    assertThat(query.getFirst("post_logout_redirect_uri")).isEqualTo(browser.base() + "/");

    final List<String> cookies = logout.headers().allValues("Set-Cookie");
    assertThat(cookies).anyMatch(cookie -> cookie.startsWith("bc=;") && cookie.contains("1970"));
    assertThat(cookies).anyMatch(cookie -> cookie.startsWith("bc-id-token=") && cookie.contains("Max-Age=0"));
  }

  @Test
  @DisplayName("AUTH-007 after /logout the browser comes back to the start page and the next request asks Keycloak for a new login")
  void AUTH_007_after_the_logout_the_browser_comes_back_and_the_next_request_asks_for_a_new_login()
      throws Exception {
    browser.logIn();
    final var currentUser = browser.getJson("/gui/api/v1/app/current-user");
    assertThat(currentUser.body()).contains(TestBrowser.USER);

    final var landing = browser.followRedirects(browser.get("/logout"));

    // Keycloak sends the browser back to the start page, which has no login and asks Keycloak
    // again. Keycloak asks for the password: its own session has ended
    assertThat(landing.uri().toString()).startsWith(TestKeycloak.url());
    assertThat(landing.body()).contains("kc-form-login");
    assertThat(browser.cookie("bc")).isEmpty();
    assertThat(browser.getJson("/gui/api/v1/usertasks").statusCode()).isEqualTo(401);
  }

}
