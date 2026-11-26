package com.acme.cockpit;

import io.vanillabp.integration.test.utils.SuppressOutputExtension;
import org.junit.jupiter.api.extension.ExtendWith;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mongodb.MongoDBContainer;

/**
 * The user logs in, tells the cockpit where mails reach them, and a user task is reported for
 * their group. The mail arrives at a real Mailpit, the image of docker-compose.yaml.
 */
@ExtendWith(SuppressOutputExtension.class)
@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "bpms-api.username=abc",
        "bpms-api.password={noop}123",
        "business-cockpit.application-uri=http://localhost",
        "business-cockpit.jwt.hmacSHA256-base64=4FTHgU8uHPy/ahy8IhXHj/K/BVlh7snSUtf3m1XWLkg=",
        // a test which waits for a mail does not wait a minute
        "business-cockpit.notification.interval=1s",
    })
class NotificationMailTest {

  private static final String ADDRESS = "template-user@example.org";

  @Container
  @ServiceConnection
  static final MongoDBContainer MONGODB = new MongoDBContainer("mongo:8.0.4");

  @Container
  static final GenericContainer<?> MAILPIT = new GenericContainer<>("axllent/mailpit:v1.27.8")
      .withExposedPorts(1025, 8025)
      .waitingFor(Wait.forHttp("/readyz").forPort(8025).withStartupTimeout(Duration.ofMinutes(1)));

  @DynamicPropertySource
  static void keycloakAndMailpit(final DynamicPropertyRegistry registry) {
    TestKeycloak.register(registry);
    registry.add("spring.mail.host", MAILPIT::getHost);
    registry.add("spring.mail.port", () -> MAILPIT.getMappedPort(1025));
  }

  @Value("${local.server.port}")
  private int port;

  @Test
  @DisplayName("BE-016 a notification e-mail reaches Mailpit and links the task with the path of the language")
  void BE_016_a_notification_e_mail_reaches_mailpit_and_links_the_task_with_the_path_of_the_language() throws Exception {
    final var browser = new TestBrowser(port);
    browser.logIn();
    // the library knows a user to notify once the user has logged in
    assertThat(browser.getJson("/gui/api/v1/app/current-user").statusCode()).isEqualTo(200);

    final var channel = browser.putJson("/gui/api/v1/notifications/recipient-config/email", "{\"emailAddress\":\"" + ADDRESS + "\"}");
    assertThat(channel.statusCode()).as(channel.body()).isIn(200, 204);
    final var config = browser.putJson("/gui/api/v1/notifications/config",
        "{\"globalAllViaMedium\":{\"email\":true},\"perWorkflow\":{}}");
    assertThat(config.statusCode()).as(config.body()).isIn(200, 204);

    report("mail-task");

    final var http = HttpClient.newHttpClient();
    String messages = "";
    for (int attempt = 0; attempt < 60 && !messages.contains(ADDRESS); attempt++) {
      Thread.sleep(500);
      messages = http.send(
          HttpRequest.newBuilder(URI.create("http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025) + "/api/v1/messages")).build(),
          HttpResponse.BodyHandlers.ofString()).body();
    }
    assertThat(messages).contains(ADDRESS);
    final var id = messages.replaceAll("(?s).*\"ID\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    final var mail = http.send(
        HttpRequest.newBuilder(URI.create("http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025) + "/api/v1/message/" + id)).build(),
        HttpResponse.BodyHandlers.ofString()).body();
    assertThat(mail).contains("/task/");
  }

  private void report(final String id) throws Exception {
    final var body = "{\"id\":\"" + id + "\",\"userTaskId\":\"" + id + "\",\"timestamp\":\"" + java.time.Instant.now() + "\","
        + "\"workflowModuleId\":\"module\",\"bpmnProcessId\":\"process\",\"workflowId\":\"w-" + id + "\","
        + "\"title\":{\"en\":\"Title " + id + "\"},\"taskDefinition\":\"task\",\"bpmnTaskId\":\"task\","
        + "\"uiUriPath\":\"/task\",\"uiUriType\":\"ES_MODULES\",\"candidateGroups\":[\"template-group\"]}";
    final var basic = Base64.getEncoder().encodeToString("abc:123".getBytes());
    final var response = HttpClient.newHttpClient().send(
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/bpms/api/v1_1/usertask/created"))
            .header("Authorization", "Basic " + basic)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build(),
        HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).as(response.body()).isIn(200, 201, 204);
  }

}
