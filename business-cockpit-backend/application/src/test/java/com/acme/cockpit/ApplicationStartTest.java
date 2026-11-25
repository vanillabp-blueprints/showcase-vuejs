package com.acme.cockpit;

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
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import io.vanillabp.cockpit.support.security.jwt.JwtUserDetailsProvider;
import io.vanillabp.cockpit.support.security.usercontext.UserDetails;
import io.vanillabp.cockpit.support.security.usercontext.UserDetailsProvider;
import io.vanillabp.cockpit.support.security.usercontext.UserDirectoryService;
import java.util.List;
import java.util.Optional;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.core.annotation.Order;
import org.springframework.security.web.SecurityFilterChain;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mongodb.MongoDBContainer;

/**
 * Starts the whole application against MongoDB of Testcontainers, as a replica set.
 */
@Testcontainers
@Import(ApplicationStartTest.StandInForTheLogin.class)
@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "bpms-api.username=abc",
        "bpms-api.password={noop}123",
        "business-cockpit.application-uri=http://localhost",
        "business-cockpit.jwt.hmacSHA256-base64=4FTHgU8uHPy/ahy8IhXHj/K/BVlh7snSUtf3m1XWLkg=",
    })
class ApplicationStartTest {

  /**
   * The login belongs to a later story. This lets the application start without it: the user
   * of the request comes from the token, nobody is in the directory, every other path is open.
   */
  @TestConfiguration
  static class StandInForTheLogin {

    @Bean
    UserDetailsProvider userDetailsProvider() {
      return new JwtUserDetailsProvider();
    }

    @Bean
    UserDirectoryService userDirectoryService() {
      return new UserDirectoryService() {
        public List<UserDetails> findUsers(final String search) { return List.of(); }
        public List<UserDetails> findUsers(final String search, final List<String> ids) { return List.of(); }
        public List<UserDetails> getAllUsers() { return List.of(); }
        public List<UserDetails> getAllUsers(final List<String> ids) { return List.of(); }
        public Optional<UserDetails> getUser(final String id) { return Optional.empty(); }
      };
    }

    @Bean
    io.vanillabp.cockpit.users.model.PersonAndGroupMapper personAndGroupMapper() {
      return org.mockito.Mockito.mock(io.vanillabp.cockpit.users.model.PersonAndGroupMapper.class);
    }

    @Bean
    io.vanillabp.cockpit.users.model.PersonAndGroupApiMapper personAndGroupApiMapper() {
      return org.mockito.Mockito.mock(io.vanillabp.cockpit.users.model.PersonAndGroupApiMapper.class);
    }

    @Bean
    @Order(99)
    SecurityFilterChain guiHttpSecurity(final HttpSecurity http) throws Exception {
      return http.csrf(csrf -> csrf.disable())
          .authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
          .build();
    }

  }

  @Container
  @ServiceConnection
  static final MongoDBContainer MONGODB = new MongoDBContainer("mongo:8.0.4");

  @Value("${local.server.port}")
  private int port;

  @Autowired
  private ApplicationContext context;

  private final HttpClient client = HttpClient.newHttpClient();

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
    final var response = get("/", null);

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body()).containsIgnoringCase("<div id=\"app\"");
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
