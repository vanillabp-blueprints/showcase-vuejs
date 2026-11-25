package com.acme.cockpit;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.FileReader;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * Proves the shape of docker-compose.yaml. That the services really start is proven by the check
 * of the story, which runs {@code docker compose up}.
 */
class DockerComposeTest {

  private static final Pattern PINNED_IMAGE = Pattern.compile(".+:[0-9v][^:]*");

  private final Map<String, Map<String, Object>> services = servicesOf("../docker-compose.yaml");

  @Test
  @DisplayName("BE-012 compose starts mongodb as a replica set, and mailpit, with no kafka")
  void BE_012_compose_starts_mongodb_as_a_replica_set_and_mailpit_with_no_kafka() {
    assertThat(services.keySet()).contains("mongodb", "mailpit").doesNotContain("kafka");
    assertThat(String.valueOf(services.get("mongodb").get("command"))).contains("--replSet");
  }

  @Test
  @DisplayName("BE-012 compose pins every image to a version")
  void BE_012_compose_pins_every_image_to_a_version() {
    assertThat(services).isNotEmpty();
    services.forEach((name, service) ->
        assertThat((String) service.get("image"))
            .as("image of %s", name)
            .matches(PINNED_IMAGE)
            .doesNotEndWith(":latest"));
  }

  @Test
  @DisplayName("BE-012 compose creates the database and the user business-cockpit without typing")
  void BE_012_compose_creates_the_database_and_the_user_business_cockpit_without_typing() {
    final var setup = String.valueOf(services.get("mongodb-setup"));

    assertThat(setup).contains("rs.initiate").contains("createUser");
    assertThat(setup).contains("business-cockpit");
  }

  @Test
  @DisplayName("BE-012 local profile connects with direct connection and the mailpit port")
  void BE_012_local_profile_connects_with_direct_connection_and_the_mailpit_port() {
    final var local = new org.springframework.beans.factory.config.YamlPropertiesFactoryBean();
    local.setResources(new org.springframework.core.io.ClassPathResource("config/application-local.yaml"));
    final var configuration = local.getObject();

    assertThat(configuration.getProperty("spring.mongodb.uri"))
        .contains("business-cockpit:business-cockpit@localhost:27017/business-cockpit")
        .contains("directConnection=true");
    assertThat(configuration.getProperty("bpms-api.username")).isNotBlank();
    assertThat(configuration.getProperty("business-cockpit.jwt.hmacSHA256-base64")).isNotBlank();
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Map<String, Object>> servicesOf(final String path) {
    try (var reader = new FileReader(new File(path))) {
      final Map<String, Object> compose = new Yaml().load(reader);
      return (Map<String, Map<String, Object>>) compose.get("services");
    } catch (Exception cannotRead) {
      throw new IllegalStateException("Cannot read " + path, cannotRead);
    }
  }

}
