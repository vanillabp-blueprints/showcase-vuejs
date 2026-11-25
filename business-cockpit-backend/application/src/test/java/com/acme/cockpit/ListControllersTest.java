package com.acme.cockpit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.regex.Pattern;
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
 * Reports user tasks through the BPMS API the way a workflow module does, then reads the lists as
 * the template user, who belongs to the group {@code template-group}.
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
class ListControllersTest {

  private static final String USER = TestBrowser.USER;
  private static final String LIST_REQUEST = "{\"pageSize\":50,\"mode\":\"All\"}";

  @Container
  @ServiceConnection
  static final MongoDBContainer MONGODB = new MongoDBContainer("mongo:8.0.4");

  @DynamicPropertySource
  static void keycloak(final DynamicPropertyRegistry registry) {
    TestKeycloak.register(registry);
  }

  @Value("${local.server.port}")
  private int port;

  @Test
  @DisplayName("BE-004 every list answers and shows the template user only the user tasks the user may see, and no other list path is answered")
  void BE_004_every_list_answers_and_shows_the_template_user_only_the_user_tasks_the_user_may_see_and_no_other_list_path_is_answered()
      throws Exception {
    report("assigned-to-user", "\"assignee\":\"" + USER + "\"");
    report("assigned-to-other", "\"assignee\":\"somebody-else\"");
    report("for-the-group", "\"candidateGroups\":[\"template-group\"]");
    report("for-another-group", "\"candidateGroups\":[\"another-group\"]");

    final var browser = new TestBrowser(port);
    browser.logIn();

    var all = browser.postJson("/gui/api/v1/usertask", LIST_REQUEST);
    // the cockpit stores a reported event asynchronously
    for (int attempt = 0; attempt < 20 && idsIn(all.body()).size() < 2; attempt++) {
      Thread.sleep(500);
      all = browser.postJson("/gui/api/v1/usertask", LIST_REQUEST);
    }
    assertThat(all.statusCode()).isEqualTo(200);
    assertThat(idsIn(all.body())).containsExactlyInAnyOrder("assigned-to-user", "for-the-group");

    final var own = browser.postJson("/gui/api/v1/current-user/usertask", LIST_REQUEST);
    assertThat(own.statusCode()).isEqualTo(200);
    assertThat(idsIn(own.body())).containsExactly("assigned-to-user");

    assertThat(browser.postJson("/gui/api/v1/workflow", "{\"pageSize\":50}").statusCode()).isEqualTo(200);
    assertThat(browser.getJson("/gui/api/v1/workflow-module").statusCode()).isEqualTo(200);

    // Q-SUB-LISTS is none, so the list of the roles is not answered
    assertThat(browser.postJson("/gui/api/v1/user-roles/usertask", LIST_REQUEST).statusCode()).isEqualTo(404);
  }

  private static List<String> idsIn(final String body) {
    final var ids = new ArrayList<String>();
    final var id = Pattern.compile("^    \"id\"\\s*:\\s*\"([^\"]+)\"", Pattern.MULTILINE).matcher(body.substring(body.indexOf("\"userTasks\"")));
    while (id.find()) {
      ids.add(id.group(1));
    }
    return ids;
  }

  private void report(final String id, final String who) throws Exception {
    final var body = "{\"id\":\"" + id + "\",\"userTaskId\":\"" + id + "\",\"timestamp\":\"2026-11-25T10:00:00Z\","
        + "\"workflowModuleId\":\"module\",\"bpmnProcessId\":\"process\",\"workflowId\":\"w-" + id + "\","
        + "\"title\":{\"en\":\"Title " + id + "\"},\"taskDefinition\":\"task\",\"bpmnTaskId\":\"task\","
        + "\"uiUriPath\":\"/task\",\"uiUriType\":\"ES_MODULES\"," + who + "}";
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
