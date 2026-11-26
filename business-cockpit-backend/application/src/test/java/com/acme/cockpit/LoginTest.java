package com.acme.cockpit;

import io.vanillabp.integration.test.utils.SuppressOutputExtension;
import org.junit.jupiter.api.extension.ExtendWith;
import static org.assertj.core.api.Assertions.assertThat;

import io.vanillabp.cockpit.support.security.jwt.JwtUserDetailsProvider;
import io.vanillabp.cockpit.support.security.usercontext.UserDetailsProvider;
import io.vanillabp.cockpit.support.security.usercontext.UserDirectoryService;
import io.vanillabp.cockpit.users.model.PersonAndGroupApiMapper;
import io.vanillabp.cockpit.users.model.PersonAndGroupMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mongodb.MongoDBContainer;

/**
 * Logs in at a real Keycloak, the one of keycloak/realm.json, the way a browser does: follows the
 * redirects with an HTTP client that keeps cookies and sends the login form of Keycloak.
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
class LoginTest {

  private static final String USER = TestBrowser.USER;
  private static final String GROUP = "template-group";

  @Container
  @ServiceConnection
  static final MongoDBContainer MONGODB = new MongoDBContainer("mongo:8.0.4");

  @DynamicPropertySource
  static void keycloak(final DynamicPropertyRegistry registry) {
    TestKeycloak.register(registry);
  }

  @Value("${local.server.port}")
  private int port;

  @Autowired
  private ApplicationContext context;

  private TestBrowser browser;

  @BeforeEach
  void openABrowser() {
    browser = new TestBrowser(port);
  }

  @Test
  @DisplayName("BE-007 a browser without a login is sent to Keycloak and comes back with the cookie and the user with its groups")
  void BE_007_a_browser_without_a_login_is_sent_to_keycloak_and_comes_back_with_the_cookie_and_the_user_with_its_groups()
      throws Exception {
    final var start = browser.get("/");
    assertThat(start.statusCode()).isIn(302, 303);
    assertThat(start.headers().firstValue("Location").orElseThrow()).contains("/oauth2/authorization/");

    browser.followToTheLoginPage(start);
    final var landing = browser.logIn();

    assertThat(landing.uri().getPort()).isEqualTo(port);
    final var cookie = browser.cookie("bc");
    assertThat(cookie).as("cookie of the cockpit").isPresent();
    assertThat(cookie.get().isHttpOnly()).isTrue();

    final var currentUser = browser.getJson("/gui/api/v1/app/current-user");
    assertThat(currentUser.statusCode()).isEqualTo(200);
    assertThat(currentUser.body()).contains(USER).contains(GROUP);
  }

  @Test
  @DisplayName("BE-008 a request of the gui api without a login answers 401 and no redirect")
  void BE_008_a_request_of_the_gui_api_without_a_login_answers_401_and_no_redirect() throws Exception {
    final var response = browser.get("/gui/api/v1/usertasks");

    assertThat(response.statusCode()).isEqualTo(401);
    assertThat(response.headers().firstValue("Location")).isEmpty();
    assertThat(browser.getJson("/gui/api/v1/app/current-user/settings").statusCode()).isEqualTo(401);
  }

  @Test
  @DisplayName("BE-005 chain guiHttpSecurity has order 99, refuses the actuator and opens no more than the five matchers")
  void BE_005_chain_guiHttpSecurity_has_order_99_refuses_the_actuator_and_opens_no_more_than_the_five_matchers()
      throws Exception {
    final var method = com.acme.cockpit.security.GuiSecurityConfiguration.class.getMethod(
        "guiHttpSecurity",
        HttpSecurity.class,
        io.vanillabp.cockpit.support.security.jwt.JwtSecurityContextRepository.class,
        io.vanillabp.cockpit.support.security.jwt.JwtMapper.class,
        org.springframework.security.oauth2.client.registration.ClientRegistrationRepository.class);
    assertThat(method.getAnnotation(Order.class).value()).isEqualTo(99);
    assertThat(context.getBean("guiHttpSecurity", SecurityFilterChain.class)).isNotNull();

    assertThat(browser.get("/actuator/health").statusCode()).isEqualTo(403);

    browser.logIn();
    assertThat(browser.get("/actuator/health").statusCode()).isEqualTo(403);
    assertThat(browser.getJson("/gui/api/v1/app/current-user/settings").statusCode()).isNotEqualTo(401);
    assertThat(browser.getJson("/gui/api/v1/app/info").statusCode()).isEqualTo(200);
  }

  @Test
  @DisplayName("BE-010 the token travels in the cookie only and no filter of the backend reads the authorization header")
  void BE_010_the_token_travels_in_the_cookie_only_and_no_filter_of_the_backend_reads_the_authorization_header()
      throws Exception {
    browser.logIn();
    final var token = browser.cookie("bc").orElseThrow().getValue();

    final var withoutCookie = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()
        .send(HttpRequest.newBuilder(URI.create(browser.base() + "/gui/api/v1/usertasks"))
            .header("Authorization", "Bearer " + token).build(), HttpResponse.BodyHandlers.ofString());
    assertThat(withoutCookie.statusCode()).isEqualTo(401);

    try (Stream<Path> sources = Files.walk(Path.of("src/main/java"))) {
      assertThat(sources.filter(path -> path.toString().endsWith(".java"))
          .map(LoginTest::read)
          .filter(source -> source.toLowerCase().contains("authorization\"")
              || source.contains("HttpHeaders.AUTHORIZATION")))
          .isEmpty();
    }
  }

  @Test
  @DisplayName("BE-011 userDetailsProvider and both mappers exist, there is one directory of the library and no mapper of its own")
  void BE_011_userDetailsProvider_and_both_mappers_exist_there_is_one_directory_of_the_library_and_no_mapper_of_its_own(
      @Autowired final UserDirectoryService directory) {
    assertThat(context.getBean("userDetailsProvider", UserDetailsProvider.class))
        .isInstanceOf(JwtUserDetailsProvider.class);
    assertThat(context.getBean(PersonAndGroupApiMapper.class)).isNotNull();
    assertThat(context.getBean(PersonAndGroupMapper.class)).isNotNull();
    assertThat(context.getBeansOfType(UserDirectoryService.class)).hasSize(1);
    assertThat(directory.getClass().getName()).startsWith("io.vanillabp.cockpit.");
    assertThat(context.getBeansOfType(GrantedAuthoritiesMapper.class)).isEmpty();
    assertThat(context.getBean("jwtMapper").getClass().getName()).startsWith("io.vanillabp.cockpit.");

    final var users = directory.findUsers("template");
    assertThat(users).extracting("id").contains(USER);
    assertThat(directory.getUser(USER).orElseThrow().getAuthorities()).contains(GROUP);
  }

  private static String read(final Path path) {
    try {
      return Files.readString(path);
    } catch (Exception cannotRead) {
      throw new IllegalStateException(cannotRead);
    }
  }

}
