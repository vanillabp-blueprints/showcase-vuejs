package com.acme.cockpit;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mongodb.MongoDBContainer;
import org.springframework.web.servlet.function.support.RouterFunctionMapping;

/**
 * PKG-024: with Q-HOSTING behind the backend always has the route /** to the nginx image, in a
 * handler mapping of its own after the controllers, behind the security of the backend. No profile
 * is active; the address of the nginx comes from the environment variable USER_INTERFACE_URI. A
 * small HTTP server stands in for the nginx.
 */
@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "bpms-api.username=abc",
        "bpms-api.password={noop}123",
        "business-cockpit.application-uri=http://localhost",
        "business-cockpit.jwt.hmacSHA256-base64=4FTHgU8uHPy/ahy8IhXHj/K/BVlh7snSUtf3m1XWLkg=",
    })
class UserInterfaceBehindTest {

  private static final List<String> RECEIVED = new CopyOnWriteArrayList<>();

  private static final HttpServer NGINX = nginx();

  @Container
  @ServiceConnection
  static final MongoDBContainer MONGODB = new MongoDBContainer("mongo:8.0.4");

  @DynamicPropertySource
  static void theNginxIsTheStub(final DynamicPropertyRegistry registry) {
    TestKeycloak.register(registry);
    registry.add("user-interface.uri", () -> "http://127.0.0.1:" + NGINX.getAddress().getPort());
  }

  @Value("${local.server.port}")
  private int port;

  @Autowired
  private ApplicationContext context;

  private TestBrowser browser;

  @BeforeEach
  void freshBrowser() {
    browser = new TestBrowser(port);
    RECEIVED.clear();
  }

  @AfterAll
  static void stopTheNginx() {
    NGINX.stop(0);
  }

  @Test
  @DisplayName("PKG-024 application.yaml takes the address of the nginx from the environment")
  void PKG_024_application_yaml_takes_the_address_of_the_nginx_from_the_environment() {
    final var yaml = new YamlPropertiesFactoryBean();
    yaml.setResources(new ClassPathResource("config/application.yaml"));
    final Properties configuration = yaml.getObject();

    assertThat(configuration.getProperty("user-interface.uri")).startsWith("${USER_INTERFACE_URI:http://");
  }

  @Test
  @DisplayName("PKG-024 without any profile the route to the nginx has its own mapping after the controllers")
  void PKG_024_the_route_to_the_nginx_has_its_own_mapping_after_the_controllers() {
    final var mapping = context.getBean("userInterfaceRoute", RouterFunctionMapping.class);

    assertThat(mapping.getOrder()).isGreaterThan(0);
    assertThat(context.getBeansOfType(org.springframework.web.servlet.function.RouterFunction.class))
        .doesNotContainKey("userInterfaceRoute");
  }

  @Test
  @DisplayName("PKG-024 the nginx answers every path the cockpit does not and both are behind the login")
  void PKG_024_the_nginx_answers_every_path_the_cockpit_does_not_and_both_are_behind_the_login()
      throws Exception {
    // the paths below /assets/ stay open for the login page, every other path needs the login
    final var anonymousPage = browser.get("/cases/4711");
    assertThat(anonymousPage.statusCode()).isIn(302, 401);
    assertThat(RECEIVED).isEmpty();

    browser.logIn();
    RECEIVED.clear();
    final var page = browser.get("/cases/4711");
    final var file = browser.get("/assets/index.js");
    final var cockpit = browser.get("/bpms/api/v1/anything");

    assertThat(page.body()).isEqualTo("nginx /cases/4711");
    assertThat(file.body()).isEqualTo("nginx /assets/index.js");
    assertThat(cockpit.body()).doesNotContain("nginx");
    assertThat(RECEIVED).containsExactly("/cases/4711", "/assets/index.js");
  }

  private static HttpServer nginx() {
    try {
      final var server = HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 0);
      server.createContext("/", exchange -> {
        final var path = exchange.getRequestURI().getPath();
        RECEIVED.add(path);
        final var body = ("nginx " + path).getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
      });
      server.start();
      return server;
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

}
