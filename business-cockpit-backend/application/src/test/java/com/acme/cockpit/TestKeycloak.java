package com.acme.cockpit;

import java.time.Duration;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.MountableFile;

/**
 * One Keycloak for all tests of a run. It imports keycloak/realm.json, the file docker compose
 * mounts as well, so the tests prove that file. The container ends with the test run.
 */
final class TestKeycloak {

  static final String IMAGE = "quay.io/keycloak/keycloak:26.4.7";

  private static final GenericContainer<?> KEYCLOAK = new GenericContainer<>(IMAGE)
      .withCopyFileToContainer(
          MountableFile.forHostPath("../keycloak/realm.json"),
          "/opt/keycloak/data/import/realm.json")
      .withCommand("start-dev", "--import-realm")
      .withExposedPorts(8080)
      .waitingFor(Wait.forHttp("/realms/business-cockpit")
          .forPort(8080)
          .withStartupTimeout(Duration.ofMinutes(3)));

  static {
    KEYCLOAK.start();
  }

  private TestKeycloak() {
  }

  static String url() {
    return "http://" + KEYCLOAK.getHost() + ":" + KEYCLOAK.getMappedPort(8080);
  }

  /** The secrets are the ones of the local realm, for a developer's machine and tests only. */
  static void register(final DynamicPropertyRegistry registry) {
    registry.add("KEYCLOAK_URL", TestKeycloak::url);
    registry.add("KEYCLOAK_CLIENT_SECRET", () -> "local-client-secret");
    registry.add("KEYCLOAK_DIRECTORY_SECRET", () -> "local-directory-secret");
  }

}
