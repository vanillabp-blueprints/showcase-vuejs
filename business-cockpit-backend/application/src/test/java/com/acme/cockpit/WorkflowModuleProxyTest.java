package com.acme.cockpit;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mongodb.MongoDBContainer;

/**
 * EXT-058 and EXT-059: a workflow module registers itself at the BPMS API, and the files of its
 * user interface reach the browser through the cockpit below /wm/&lt;id&gt;/ with the caching
 * headers of the module. A small HTTP server stands in for the workflow module.
 */
@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "bpms-api.username=abc",
        "bpms-api.password={noop}123",
        "business-cockpit.application-uri=http://localhost",
        "business-cockpit.jwt.hmacSHA256-base64=4FTHgU8uHPy/ahy8IhXHj/K/BVlh7snSUtf3m1XWLkg=",
        "user-interface.uri=http://127.0.0.1:1",
    })
class WorkflowModuleProxyTest {

  private static final String ETAG = "\"build-7\"";

  private static final String LAST_MODIFIED = "Wed, 25 Nov 2026 10:00:00 GMT";

  private static final List<String> RECEIVED = new CopyOnWriteArrayList<>();

  private static final HttpServer MODULE = moduleServer();

  @Container
  @ServiceConnection
  static final MongoDBContainer MONGODB = new MongoDBContainer("mongo:8.0.4");

  @DynamicPropertySource
  static void keycloak(final DynamicPropertyRegistry registry) {
    TestKeycloak.register(registry);
  }

  @Value("${local.server.port}")
  private int port;

  private final HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

  @BeforeEach
  void theModuleRegistersItself() throws Exception {
    RECEIVED.clear();
    final var basic = Base64.getEncoder().encodeToString("abc:123".getBytes(StandardCharsets.UTF_8));
    final var registered = client.send(
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/bpms/api/v1_1/workflow-module/stub-module"))
            .header("Authorization", "Basic " + basic)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(
                "{\"uri\":\"http://127.0.0.1:" + MODULE.getAddress().getPort() + "/wm/stub-module\","
                    + "\"accessibleToGroups\":[\"template-group\"]}"))
            .build(),
        HttpResponse.BodyHandlers.ofString());
    assertThat(registered.statusCode()).isEqualTo(200);
  }

  @AfterAll
  static void stopTheModule() {
    MODULE.stop(0);
  }

  @Test
  @DisplayName("EXT-058 a file of a registered module reaches the browser through /wm/<id>/ with its caching headers")
  void EXT_058_a_file_of_a_registered_module_reaches_the_browser_with_its_caching_headers() throws Exception {
    final var manifest = get("/wm/stub-module/bc-manifest.json", null, "identity");
    final var entry = get("/wm/stub-module/entries/Form-1A2B.js", null, "identity");

    assertThat(manifest.statusCode()).isEqualTo(200);
    assertThat(manifest.body()).isEqualTo("{\"manifestVersion\":1}");
    assertThat(manifest.headers().firstValue("Cache-Control")).contains("no-cache");
    assertThat(entry.statusCode()).isEqualTo(200);
    assertThat(entry.body()).isEqualTo("export const form = 1;");
    assertThat(entry.headers().firstValue("Cache-Control")).contains("max-age=31536000, immutable");
    assertThat(entry.headers().firstValue("ETag")).contains(ETAG);
    assertThat(entry.headers().firstValue("Last-Modified")).contains(LAST_MODIFIED);
    assertThat(RECEIVED).contains("/wm/stub-module/bc-manifest.json", "/wm/stub-module/entries/Form-1A2B.js");
  }

  @Test
  @DisplayName("EXT-059 a conditional request is answered 304 by the module and a gzip answer stays gzip")
  void EXT_059_a_conditional_request_is_answered_304_and_gzip_stays_gzip() throws Exception {
    final var conditional = get("/wm/stub-module/entries/Form-1A2B.js", ETAG, "identity");
    final var compressed = client.send(
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/wm/stub-module/entries/Form-1A2B.js"))
            .header("Accept-Encoding", "gzip").build(),
        HttpResponse.BodyHandlers.ofByteArray());

    assertThat(conditional.statusCode()).isEqualTo(304);
    assertThat(conditional.body()).isEmpty();
    assertThat(compressed.statusCode()).isEqualTo(200);
    assertThat(compressed.headers().firstValue("Content-Encoding")).contains("gzip");
    assertThat(gunzip(compressed.body())).isEqualTo("export const form = 1;");
  }

  @Test
  @DisplayName("EXT-058 a module which did not register has no files below /wm/<id>/")
  void EXT_058_a_module_which_did_not_register_has_no_files() throws Exception {
    final var unknown = get("/wm/unknown-module/bc-manifest.json", null, "identity");

    assertThat(unknown.statusCode()).isNotEqualTo(200);
    assertThat(RECEIVED).isEmpty();
  }

  private HttpResponse<String> get(final String path, final String ifNoneMatch, final String encoding)
      throws Exception {
    final var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
        .header("Accept-Encoding", encoding);
    if (ifNoneMatch != null) {
      request.header("If-None-Match", ifNoneMatch);
    }
    return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  private static String gunzip(final byte[] body) throws IOException {
    try (var in = new GZIPInputStream(new java.io.ByteArrayInputStream(body))) {
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  private static HttpServer moduleServer() {
    try {
      final var server = HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 0);
      server.createContext("/", exchange -> {
        final var path = exchange.getRequestURI().getPath();
        RECEIVED.add(path);
        final var headers = exchange.getResponseHeaders();
        if (path.endsWith("bc-manifest.json")) {
          headers.add("Cache-Control", "no-cache");
          final var body = "{\"manifestVersion\":1}".getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(200, body.length);
          exchange.getResponseBody().write(body);
        } else if (path.endsWith(".js")) {
          headers.add("Cache-Control", "max-age=31536000, immutable");
          headers.add("ETag", ETAG);
          headers.add("Last-Modified", LAST_MODIFIED);
          if (ETAG.equals(exchange.getRequestHeaders().getFirst("If-None-Match"))) {
            exchange.sendResponseHeaders(304, -1);
          } else {
            var body = "export const form = 1;".getBytes(StandardCharsets.UTF_8);
            if ("gzip".equals(exchange.getRequestHeaders().getFirst("Accept-Encoding"))) {
              final var zipped = new ByteArrayOutputStream();
              try (var out = new GZIPOutputStream(zipped)) {
                out.write(body);
              }
              body = zipped.toByteArray();
              headers.add("Content-Encoding", "gzip");
            }
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
          }
        } else {
          exchange.sendResponseHeaders(404, -1);
        }
        exchange.close();
      });
      server.start();
      return server;
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

}
