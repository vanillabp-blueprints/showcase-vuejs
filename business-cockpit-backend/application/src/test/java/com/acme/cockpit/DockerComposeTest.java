package com.acme.cockpit;

import io.vanillabp.integration.test.utils.SuppressOutputExtension;
import org.junit.jupiter.api.extension.ExtendWith;
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
@ExtendWith(SuppressOutputExtension.class)
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

  @Test
  @DisplayName("BE-013 compose starts keycloak with start-dev and the realm import")
  void BE_013_compose_starts_keycloak_with_start_dev_and_the_realm_import() {
    final var keycloak = services.get("keycloak");

    assertThat(keycloak).isNotNull();
    assertThat(String.valueOf(keycloak.get("command"))).contains("start-dev").contains("--import-realm");
    assertThat(String.valueOf(keycloak.get("volumes"))).contains("keycloak/realm.json").contains("/opt/keycloak/data/import");
  }

  @Test
  @SuppressWarnings("unchecked")
  @DisplayName("BE-013 realm has both clients, the redirect for free ports, the scope of the admin api and one user in one group")
  void BE_013_realm_has_both_clients_the_redirect_for_free_ports_the_scope_of_the_admin_api_and_one_user_in_one_group()
      throws Exception {
    final var realm = new com.fasterxml.jackson.databind.ObjectMapper()
        .readValue(new File("../keycloak/realm.json"), Map.class);
    final var clients = ((java.util.List<Map<String, Object>>) realm.get("clients")).stream()
        .collect(java.util.stream.Collectors.toMap(client -> (String) client.get("clientId"), client -> client));

    assertThat(realm.get("realm")).isEqualTo("business-cockpit");
    assertThat(clients).containsKeys("business-cockpit", "business-cockpit-directory");
    final var login = clients.get("business-cockpit");
    assertThat((java.util.List<String>) login.get("redirectUris"))
        .contains("http://localhost:8080/login/oauth2/code/keycloak", "http://localhost:*");
    final var attributes = (Map<String, String>) login.get("attributes");
    assertThat(attributes.get("post.logout.redirect.uris")).contains("http://localhost:8080/").contains("http://localhost:*");
    final var directory = clients.get("business-cockpit-directory");
    assertThat(directory.get("serviceAccountsEnabled")).isEqualTo(true);
    assertThat((java.util.List<String>) directory.get("defaultClientScopes")).contains("kc-admin-api");

    final var users = (java.util.List<Map<String, Object>>) realm.get("users");
    final var people = users.stream().filter(user -> !String.valueOf(user.get("username")).startsWith("service-account-")).toList();
    assertThat(people).hasSize(1);
    assertThat(people.get(0).get("groups")).isEqualTo(java.util.List.of("template-group"));
    assertThat((java.util.List<?>) realm.get("groups")).hasSize(1);
    final var serviceAccount = users.stream()
        .filter(user -> "service-account-business-cockpit-directory".equals(user.get("username"))).findFirst().orElseThrow();
    assertThat(String.valueOf(serviceAccount.get("clientRoles"))).contains("view-users");
    assertThat(String.valueOf(serviceAccount.get("clientRoles"))).doesNotContain("manage-users");
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
