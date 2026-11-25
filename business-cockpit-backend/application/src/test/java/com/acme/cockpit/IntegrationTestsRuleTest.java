package com.acme.cockpit;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** The integration tests of this repository use no mocks, write no data directly and need no browser. */
class IntegrationTestsRuleTest {

  private static final Path TESTS = Path.of("src/test/java");
  private static final Path REPOSITORY = Path.of("..");

  @Test
  @DisplayName("BE-020 the integration tests use no mocks, change no data directly, need no browser and the repository has no package.json")
  void BE_020_the_integration_tests_use_no_mocks_change_no_data_directly_need_no_browser_and_the_repository_has_no_package_json()
      throws Exception {
    final var forbidden = new String[] {
        "org.mockito", "@MockBean", "@MockitoBean", "@SpyBean", "MongoTemplate", "MongoRepository", "org.openqa.selenium", "com.microsoft.playwright" };
    try (Stream<Path> sources = Files.walk(TESTS)) {
      for (final var source : sources.filter(path -> path.toString().endsWith(".java")).filter(path -> !path.endsWith("IntegrationTestsRuleTest.java")).toList()) {
        final var content = Files.readString(source);
        for (final var word : forbidden) {
          assertThat(content).as(source + " must not use " + word).doesNotContain(word);
        }
      }
    }
    try (Stream<Path> files = Files.walk(REPOSITORY)) {
      assertThat(files.filter(path -> !path.toString().contains("node_modules") && !path.toString().contains("/target/"))
          .filter(path -> path.endsWith("package.json")).toList()).isEmpty();
    }
    // the login of Q-LOGIN-KIND and the lists of Q-LIST-CONTROLLERS are tested through the GUI API
    assertThat(Files.readString(TESTS.resolve("com/acme/cockpit/LoginTest.java"))).contains("TestKeycloak", "browser.logIn()");
    final var lists = Files.readString(TESTS.resolve("com/acme/cockpit/ListControllersTest.java"));
    assertThat(lists).contains("/gui/api/v1/usertask", "/gui/api/v1/current-user/usertask", "/gui/api/v1/workflow\"", "/gui/api/v1/workflow-module", "/bpms/api/v1_1/usertask/created");
  }

}
