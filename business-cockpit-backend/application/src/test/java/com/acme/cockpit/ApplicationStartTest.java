package com.acme.cockpit;

import io.vanillabp.integration.test.utils.SuppressOutputExtension;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import io.vanillabp.integration.test.utils.CapturedOutput;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.Order;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mongodb.MongoDBContainer;

/**
 * Starts the whole application against MongoDB of Testcontainers, as a replica set.
 */
@Testcontainers
@ExtendWith(SuppressOutputExtension.class)
@SuppressOutputExtension.SuppressBackgroundOutput
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        // no nginx here: the UI jar on the class path answers, see UserInterfaceBehindTest for the route
        "user-interface.uri=false",
        "bpms-api.username=abc",
        "bpms-api.password={noop}123",
        "business-cockpit.application-uri=http://localhost",
        "business-cockpit.jwt.hmacSHA256-base64=4FTHgU8uHPy/ahy8IhXHj/K/BVlh7snSUtf3m1XWLkg=",
    })
class ApplicationStartTest {

  @DynamicPropertySource
  static void keycloak(final DynamicPropertyRegistry registry) {
    TestKeycloak.register(registry);
  }

  @Container
  @ServiceConnection
  static final MongoDBContainer MONGODB = new MongoDBContainer("mongo:8.0.4");

  @Value("${local.server.port}")
  private int port;

  @Autowired
  private ApplicationContext context;

  private final HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

  @Test
  @DisplayName("BE-006 bpms api chain has order 1, asks for basic credentials and the log names no missing chain")
  void BE_006_bpms_api_chain_has_order_1_asks_for_basic_credentials_and_the_log_names_no_missing_chain(
      final CapturedOutput output) throws Exception {
    final var bean = context.getBean("bpmsApiHttpSecurity", SecurityFilterChain.class);
    final var method = BpmsApiSecurityConfiguration.class.getMethod(
        "bpmsApiHttpSecurity", org.springframework.security.config.annotation.web.builders.HttpSecurity.class);
    assertThat(bean).isNotNull();
    assertThat(method.getAnnotation(Order.class).value()).isEqualTo(1);

    final var withoutLogin = get("/bpms/api/v1/anything", null);
    assertThat(withoutLogin.statusCode()).isEqualTo(401);
    assertThat(withoutLogin.headers().firstValue("WWW-Authenticate").orElse(""))
        .startsWith("Basic realm=\"BPMS-API\"");

    final var wrongPassword = get("/bpms/api/v1_1/anything", "abc:wrong");
    assertThat(wrongPassword.statusCode()).isEqualTo(401);
    final var withLogin = get("/bpms/api/v1_1/anything", "abc:123");
    assertThat(withLogin.statusCode()).isNotEqualTo(401);

    assertThat(output.getAll())
        .doesNotContain("BPMS API is not configured")
        .doesNotContainIgnoringCase("no security filter chain");
  }

  @Test
  @DisplayName("PKG-004 ui jar on the class path makes the root path show the user interface")
  void PKG_004_ui_jar_on_the_class_path_makes_the_root_path_show_the_user_interface()
      throws Exception {
    final var browser = new TestBrowser(port);
    final var response = browser.logIn();

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body()).containsIgnoringCase("<div id=\"app\"");
  }

  @Test
  @DisplayName("BE-031 without an address of a user interface the backend has no route to it")
  void BE_031_without_an_address_the_backend_has_no_route_to_a_user_interface() {
    assertThat(context.containsBean("userInterfaceRoute")).isFalse();
  }

  @Test
  @DisplayName("BE-017 a list without a login answers 401 and a page without a login is sent on to the provider")
  void BE_017_a_list_without_a_login_answers_401_and_a_page_without_a_login_is_sent_on_to_the_provider()
      throws Exception {
    assertThat(get("/gui/api/v1/usertasks", null).statusCode()).isEqualTo(401);
    final var page = html("/some/page");
    assertThat(page.statusCode()).isIn(302, 303);
    assertThat(page.headers().firstValue("Location").orElseThrow()).contains("/oauth2/authorization/");
  }

  @Test
  @DisplayName("BE-017 the application started against MongoDB of Testcontainers gives the title from app info")
  void BE_017_the_application_started_against_mongodb_of_testcontainers_gives_the_title_from_app_info()
      throws Exception {
    final var info = get("/gui/api/v1/app/info", null);
    assertThat(info.statusCode()).isEqualTo(200);
    assertThat(info.body()).containsPattern("\"titleLong\"\\s*:\\s*\"Business Cockpit\"");
  }

  private HttpResponse<String> html(final String path) throws Exception {
    return client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
        .header("Accept", "text/html").build(), HttpResponse.BodyHandlers.ofString());
  }

  private HttpResponse<String> get(final String path, final String credentials) throws Exception {
    final var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
    if (credentials != null) {
      request.header("Authorization",
          "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes()));
    }
    return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

}
