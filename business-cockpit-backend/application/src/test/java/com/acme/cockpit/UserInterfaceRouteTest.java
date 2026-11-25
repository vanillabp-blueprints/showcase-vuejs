package com.acme.cockpit;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mongodb.MongoDBContainer;

/**
 * BE-031: with the profile ui-dev-server a route GET /** hands every path the backend does not
 * answer itself to the dev server of the user interface. A small HTTP server stands in for it.
 */
@Testcontainers
@ActiveProfiles("ui-dev-server")
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "bpms-api.username=abc",
        "bpms-api.password={noop}123",
        "business-cockpit.application-uri=http://localhost",
        "business-cockpit.jwt.hmacSHA256-base64=4FTHgU8uHPy/ahy8IhXHj/K/BVlh7snSUtf3m1XWLkg=",
    })
class UserInterfaceRouteTest {

  record Received(String path, String upgrade, String host) { }

  private static final List<Received> RECEIVED = new CopyOnWriteArrayList<>();

  private static final HttpServer DEV_SERVER = devServer();

  @Container
  @ServiceConnection
  static final MongoDBContainer MONGODB = new MongoDBContainer("mongo:8.0.4");

  @DynamicPropertySource
  static void theDevServerIsTheStub(final DynamicPropertyRegistry registry) {
    TestKeycloak.register(registry);
    registry.add("user-interface.uri", () -> "http://127.0.0.1:" + DEV_SERVER.getAddress().getPort());
  }

  @Value("${local.server.port}")
  private int port;

  @Autowired
  private ApplicationContext context;

  private TestBrowser browser;

  /** The route is behind the security chain, so the browser logs in first. */
  @org.junit.jupiter.api.BeforeEach
  void logIn() throws Exception {
    browser = new TestBrowser(port);
    browser.logIn();
    RECEIVED.clear();
  }

  @AfterAll
  static void stopTheDevServer() {
    DEV_SERVER.stop(0);
  }

  @Test
  @DisplayName("BE-031 an unknown path and a path below /assets/ reach the dev server over HTTP/1.1")
  void BE_031_an_unknown_path_and_a_path_below_assets_reach_the_dev_server_over_http_1_1()
      throws Exception {
    final var unknown = get("/cases/4711");
    final var asset = get("/assets/index.js");

    assertThat(unknown.statusCode()).isEqualTo(200);
    assertThat(unknown.body()).isEqualTo("dev server /cases/4711");
    assertThat(asset.body()).isEqualTo("dev server /assets/index.js");
    assertThat(RECEIVED).extracting(Received::path).containsExactly("/cases/4711", "/assets/index.js");
    assertThat(RECEIVED).extracting(Received::upgrade).containsOnlyNulls();
    assertThat(RECEIVED).extracting(Received::host).containsOnly("127.0.0.1:" + DEV_SERVER.getAddress().getPort());
  }

  @Test
  @DisplayName("BE-031 a path the backend answers itself does not reach the dev server")
  void BE_031_a_path_the_backend_answers_itself_does_not_reach_the_dev_server() throws Exception {
    final var before = RECEIVED.size();

    final var bpmsApi = get("/bpms/api/v1/anything");

    assertThat(bpmsApi.statusCode()).isEqualTo(401);
    assertThat(bpmsApi.body()).doesNotContain("dev server");
    assertThat(RECEIVED).hasSize(before);
  }

  @Test
  @DisplayName("BE-031 the route has its own handler mapping, asked after the controllers")
  void BE_031_the_route_has_its_own_handler_mapping_asked_after_the_controllers() {
    final var mapping = context.getBean("userInterfaceRoute",
        org.springframework.web.servlet.function.support.RouterFunctionMapping.class);

    assertThat(mapping.getOrder()).isGreaterThan(0);
    assertThat(context.getBeansOfType(org.springframework.web.servlet.function.RouterFunction.class))
        .doesNotContainKey("userInterfaceRoute");
  }

  @Test
  @DisplayName("BE-031 application-ui-dev-server.yaml names the dev server as http://127.0.0.1:<port>")
  void BE_031_application_ui_dev_server_yaml_names_the_dev_server() throws IOException {
    final var yaml = Files.readString(
        Path.of("src/main/resources/config/application-ui-dev-server.yaml"), StandardCharsets.UTF_8);

    assertThat(yaml).containsPattern("(?m)^user-interface:\\s*\\n\\s+uri: http://127\\.0\\.0\\.1:\\d+\\s*$");
  }

  private HttpResponse<String> get(final String path) throws Exception {
    return browser.get(path);
  }

  private static HttpServer devServer() {
    try {
      final var server = HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 0);
      server.createContext("/", exchange -> {
        final var path = exchange.getRequestURI().getPath();
        RECEIVED.add(new Received(path,
            exchange.getRequestHeaders().getFirst("Upgrade"),
            exchange.getRequestHeaders().getFirst("Host")));
        final var body = ("dev server " + path).getBytes(StandardCharsets.UTF_8);
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
