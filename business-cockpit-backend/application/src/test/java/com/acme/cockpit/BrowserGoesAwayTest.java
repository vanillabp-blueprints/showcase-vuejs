package com.acme.cockpit;

import io.vanillabp.integration.test.utils.SuppressOutputExtension;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.test.context.TestConfiguration;
import io.vanillabp.integration.test.utils.CapturedOutput;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mongodb.MongoDBContainer;

/**
 * A browser which closes a tab with an open update stream must leave nothing in the log: the
 * next event of the stream fails on a connection that is gone, and that is no error.
 */
@Testcontainers
@ExtendWith(SuppressOutputExtension.class)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        // no nginx here: the UI jar on the class path answers, see UserInterfaceBehindTest for the route
        "user-interface.uri=false",
        "bpms-api.username=abc",
        "bpms-api.password={noop}123",
        "business-cockpit.application-uri=http://localhost",
        "business-cockpit.jwt.hmacSHA256-base64=4FTHgU8uHPy/ahy8IhXHj/K/BVlh7snSUtf3m1XWLkg=",
        "business-cockpit.gui.sse.update-interval=100",
        "logging.level.com.acme.cockpit=DEBUG",
    })
class BrowserGoesAwayTest {

  @Container
  @ServiceConnection
  static final MongoDBContainer MONGODB = new MongoDBContainer("mongo:8.0.4");

  @DynamicPropertySource
  static void keycloak(final DynamicPropertyRegistry registry) {
    TestKeycloak.register(registry);
  }

  @Value("${local.server.port}")
  private int port;

  /** A controller whose write fails the way the write to a closed browser fails. */
  @TestConfiguration
  static class AControllerWhoseClientIsGone {

    @RestController
    static class GoneController {

      @GetMapping("/gui/api/v1/client-gone")
      String write() throws AsyncRequestNotUsableException {
        throw new AsyncRequestNotUsableException("ServletOutputStream failed to write: Broken pipe");
      }

    }

  }

  @Test
  @DisplayName("BE-034 an AsyncRequestNotUsableException writes no error and no warning into the log, only a DEBUG line")
  void BE_034_a_client_that_went_away_writes_no_error_and_no_warning(final CapturedOutput log) throws Exception {
    final var browser = new TestBrowser(port);
    browser.logIn();

    browser.getJson("/gui/api/v1/client-gone");


    assertThat(log.getOut() + log.getErr())
        .doesNotContain("Unexpected exception")
        .doesNotContain("Unexpected exeception")
        .doesNotContain("AsyncRequestNotUsableException")
        // handled, and a developer who looks for it still finds it at DEBUG
        .containsPattern("DEBUG .*The client went away");
  }

  @Test
  @DisplayName("BE-033 BE-034 a closed tab with an open update stream writes no AuthenticationCredentialsNotFoundException, no error and no warning into the log")
  void BE_033_BE_034_a_closed_tab_with_an_open_update_stream_writes_nothing_into_the_log(
      final CapturedOutput log) throws Exception {
    final var browser = new TestBrowser(port);
    browser.logIn();
    final var token = browser.cookie("bc").orElseThrow().getValue();

    final var logBefore = (log.getOut() + log.getErr()).length();
    try (var socket = new Socket("localhost", port)) {
      socket.getOutputStream().write((
          "GET /gui/api/v1/updates HTTP/1.1\r\nHost: localhost:" + port + "\r\n"
              + "Accept: text/event-stream\r\nCookie: bc=" + token + "\r\n\r\n")
          .getBytes(StandardCharsets.US_ASCII));
      socket.getOutputStream().flush();
      final var answer = new String(socket.getInputStream().readNBytes(15), StandardCharsets.US_ASCII);
      assertThat(answer).startsWith("HTTP/1.1 200");
      // closing the socket now is the browser closing its tab
      socket.setSoLinger(true, 0);
    }
    // the server writes the next events into the closed connection
    Thread.sleep(Duration.ofSeconds(3));

    final var afterTheClose = (log.getOut() + log.getErr()).substring(logBefore);
    assertThat(afterTheClose)
        .doesNotContain("AuthenticationCredentialsNotFoundException")
        .doesNotContain("Broken pipe")
        .doesNotContain("AsyncRequestNotUsableException")
        .doesNotContain("disconnected client")
        .doesNotContainPattern("(?m)^\\S+\\s+(ERROR|WARN)\\s.*(Async|Servlet|Tomcat|Dispatcher)");
  }

}
