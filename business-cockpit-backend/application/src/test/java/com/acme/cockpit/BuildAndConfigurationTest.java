package com.acme.cockpit;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.core.io.ClassPathResource;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * Proves the build files and the configuration the backend starts with. The tests read the
 * pom.xml files and application.yaml as the build tool and Spring Boot read them.
 */
class BuildAndConfigurationTest {

  private static final String SPRING_BOOT_BOM = "spring-boot-dependencies";
  private static final String COCKPIT_BOM = "business-cockpit-bom";

  private final Element parentPom = rootOf("../pom.xml");
  private final Element applicationPom = rootOf("pom.xml");

  @Test
  @DisplayName("BE-001 parent pom has the coordinates the modules and the java version")
  void BE_001_parent_pom_has_the_coordinates_the_modules_and_the_java_version() {
    assertThat(textOf(parentPom, "groupId")).isEqualTo("com.acme");
    assertThat(textOf(parentPom, "artifactId")).isEqualTo("business-cockpit-backend");
    assertThat(textOf(propertiesOf(parentPom), "java.version")).isEqualTo("25");
    assertThat(textsOf(childOf(parentPom, "modules"), "module"))
        .containsExactly("types", "application");
  }

  @Test
  @DisplayName("BE-001 parent pom imports both boms once and no spring cloud bom")
  void BE_001_parent_pom_imports_both_boms_once_and_no_spring_cloud_bom() {
    final var importedBoms = importedBomsOf(parentPom);

    assertThat(importedBoms)
        .containsOnlyOnce(SPRING_BOOT_BOM, COCKPIT_BOM)
        .doesNotContain("spring-cloud-dependencies");
  }

  @Test
  @DisplayName("BE-024 spring boot plugin has the version of the imported spring boot bom")
  void BE_024_spring_boot_plugin_has_the_version_of_the_imported_spring_boot_bom() {
    final var springBootPlugin = pluginOf(parentPom, "spring-boot-maven-plugin");

    assertThat(textOf(springBootPlugin, "version")).isEqualTo("${spring-boot.version}");
    assertThat(textOf(importedBomElementOf(parentPom, SPRING_BOOT_BOM), "version"))
        .isEqualTo("${spring-boot.version}");
  }

  @Test
  @DisplayName("BE-024 snapshot repository is named only while the cockpit is a snapshot")
  void BE_024_snapshot_repository_is_named_only_while_the_cockpit_is_a_snapshot() {
    final var cockpitIsSnapshot =
        textOf(propertiesOf(parentPom), "business-cockpit.version").endsWith("-SNAPSHOT");
    final var repositories = childOf(parentPom, "repositories");

    assertThat(repositories != null).isEqualTo(cockpitIsSnapshot);
    if (cockpitIsSnapshot) {
      final var urls = childrenOf(repositories).stream()
          .map(repository -> textOf(repository, "url"))
          .toList();
      assertThat(urls)
          .containsExactly("https://central.sonatype.com/repository/maven-snapshots/");
    }
  }

  @Test
  @DisplayName("BE-025 application adds only the starters the interview asks for without a version")
  void BE_025_application_adds_only_the_starters_the_interview_asks_for_without_a_version() {
    final var dependencies = dependenciesOf(applicationPom);

    assertThat(dependencies.keySet())
        .contains("spring-boot-starter-oauth2-client", "spring-boot-starter-mail")
        .doesNotContain("spring-kafka", "bpms-protobuf-api", "spring-ldap-core");
    assertThat(dependencies.get("spring-boot-starter-oauth2-client")).isNull();
    assertThat(dependencies.get("spring-boot-starter-mail")).isNull();
  }

  @Test
  @DisplayName("BE-002 application depends on the cockpit library and ships no ui jar")
  void BE_002_application_depends_on_the_cockpit_library_and_ships_no_ui_jar() {
    final var dependencies = dependenciesOf(applicationPom);

    assertThat(dependencies).containsKey("business-cockpit");
    assertThat(dependencies.get("business-cockpit")).isNull();
    // The interview says the user interface runs behind its own nginx, so the runnable jar
    // embeds no UI jar. The UI jar is a test dependency only, see PKG-005.
    assertThat(scopesOf(applicationPom).get("business-cockpit-ui")).isEqualTo("test");
  }

  @Test
  @DisplayName("PKG-005 backend builds with maven and takes the ui jar as an ordinary dependency")
  void PKG_005_backend_builds_with_maven_and_takes_the_ui_jar_as_an_ordinary_dependency() {
    final var uiJar = dependenciesOf(applicationPom);

    assertThat(uiJar).containsKey("business-cockpit-ui");
    assertThat(uiJar.get("business-cockpit-ui")).isEqualTo("${ui.version}");
    final var uiJarElement = childrenOf(childOf(applicationPom, "dependencies")).stream()
        .filter(dependency -> "business-cockpit-ui".equals(textOf(dependency, "artifactId")))
        .findFirst()
        .orElseThrow();
    assertThat(textOf(uiJarElement, "groupId")).isEqualTo("com.acme");
    assertThat(textOf(uiJarElement, "systemPath")).isNull();
    assertThat(new File("../pom.xml")).exists();
    assertThat(new File("../build.gradle.kts")).doesNotExist();
    assertThat(new File("../settings.gradle.kts")).doesNotExist();
  }

  @Test
  @DisplayName("BE-028 application yaml names mongodb, the languages, the default locale and the mail")
  void BE_028_application_yaml_names_mongodb_the_languages_the_default_locale_and_the_mail() {
    final var yaml = new YamlPropertiesFactoryBean();
    yaml.setResources(new ClassPathResource("config/application.yaml"));
    final Properties configuration = yaml.getObject();

    assertThat(configuration.getProperty("spring.mongodb.uri")).isNotBlank();
    assertThat(configuration).doesNotContainKey("spring.data.mongodb.uri");
    assertThat(configuration.getProperty("business-cockpit.additional-properties.languages"))
        .isEqualTo("en,de,fr,es");
    assertThat(configuration.getProperty("business-cockpit.default-locale")).isEqualTo("en");
    assertThat(configuration.getProperty("spring.mail.host")).isNotBlank();
    assertThat(configuration.getProperty("spring.mail.port")).isNotBlank();
    assertThat(configuration.get("business-cockpit.notification.smtp.enabled")).isEqualTo(true);
    assertThat(configuration.getProperty("business-cockpit.notification.smtp.from"))
        .contains("@");
    assertThat(configuration.getProperty("business-cockpit.notification.interval")).isNotBlank();
  }

  @Test
  @DisplayName("BE-003 main class is a plain spring boot application outside the cockpit package")
  void BE_003_main_class_is_a_plain_spring_boot_application_outside_the_cockpit_package() {
    assertThat(CockpitApplication.class).hasAnnotation(SpringBootApplication.class);
    assertThat(CockpitApplication.class.getPackageName())
        .doesNotStartWith("io.vanillabp.cockpit");
    assertThat(CockpitApplication.class.getSuperclass()).isEqualTo(Object.class);
  }

  @Test
  @DisplayName("BE-014 application yaml sets the shared values and leaves secrets to the environment")
  void BE_014_application_yaml_sets_the_shared_values_and_leaves_secrets_to_the_environment() {
    final var yaml = new YamlPropertiesFactoryBean();
    yaml.setResources(new ClassPathResource("config/application.yaml"));
    final Properties configuration = yaml.getObject();

    assertThat(configuration)
        .containsEntry("mongodb.write-concern", "majority")
        .containsEntry("mongodb.write-concern-journal", true)
        .containsEntry("spring.threads.virtual.enabled", true);
    assertThat(configuration.getProperty("business-cockpit.jwt.hmacSHA256-base64"))
        .isEqualTo("${COCKPIT_JWT_KEY}");
    assertThat(configuration.getProperty("bpms-api.password")).isEqualTo("${BPMS_API_PASSWORD}");
    assertThat(configuration.getProperty("spring.mongodb.uri")).startsWith("${MONGODB_URI");
    // The user interface runs behind its own nginx, so nothing serves a classpath UI.
    assertThat(configuration).doesNotContainKeys(
        "spring.web.resources.static-locations", "application.spa-default-file");
  }

  private static Element rootOf(final String pomPath) {
    try {
      final Document pom = DocumentBuilderFactory.newInstance().newDocumentBuilder()
          .parse(new File(pomPath));
      return pom.getDocumentElement();
    } catch (Exception cannotRead) {
      throw new IllegalStateException("Cannot read " + pomPath, cannotRead);
    }
  }

  private static List<Element> childrenOf(final Element parent) {
    final var children = new ArrayList<Element>();
    final NodeList nodes = parent.getChildNodes();
    for (int i = 0; i < nodes.getLength(); i++) {
      if (nodes.item(i).getNodeType() == Node.ELEMENT_NODE) {
        children.add((Element) nodes.item(i));
      }
    }
    return children;
  }

  private static Element childOf(final Element parent, final String name) {
    return childrenOf(parent).stream()
        .filter(child -> child.getTagName().equals(name))
        .findFirst()
        .orElse(null);
  }

  private static String textOf(final Element parent, final String name) {
    final var child = childOf(parent, name);
    return child == null ? null : child.getTextContent().trim();
  }

  private static List<String> textsOf(final Element parent, final String name) {
    return childrenOf(parent).stream()
        .filter(child -> child.getTagName().equals(name))
        .map(child -> child.getTextContent().trim())
        .toList();
  }

  private static Element propertiesOf(final Element pom) {
    return childOf(pom, "properties");
  }

  private static Element importedBomElementOf(final Element pom, final String artifactId) {
    return childrenOf(childOf(childOf(pom, "dependencyManagement"), "dependencies")).stream()
        .filter(dependency -> artifactId.equals(textOf(dependency, "artifactId")))
        .findFirst()
        .orElseThrow();
  }

  private static List<String> importedBomsOf(final Element pom) {
    return childrenOf(childOf(childOf(pom, "dependencyManagement"), "dependencies")).stream()
        .filter(dependency -> "import".equals(textOf(dependency, "scope")))
        .map(dependency -> textOf(dependency, "artifactId"))
        .toList();
  }

  private static Element pluginOf(final Element pom, final String artifactId) {
    final var plugins = childOf(childOf(childOf(pom, "build"), "pluginManagement"), "plugins");
    return childrenOf(plugins).stream()
        .filter(plugin -> artifactId.equals(textOf(plugin, "artifactId")))
        .findFirst()
        .orElseThrow();
  }

  /** The artifact id of each dependency with the scope it names, or null for the default. */
  private static java.util.Map<String, String> scopesOf(final Element pom) {
    final var scopeByArtifact = new java.util.HashMap<String, String>();
    for (final var dependency : childrenOf(childOf(pom, "dependencies"))) {
      scopeByArtifact.put(textOf(dependency, "artifactId"), textOf(dependency, "scope"));
    }
    return scopeByArtifact;
  }

  /** The artifact id of each dependency, with its version or null when the BOM gives it. */
  private static java.util.Map<String, String> dependenciesOf(final Element pom) {
    final var versionByArtifact = new java.util.HashMap<String, String>();
    for (final var dependency : childrenOf(childOf(pom, "dependencies"))) {
      versionByArtifact.put(textOf(dependency, "artifactId"), textOf(dependency, "version"));
    }
    return versionByArtifact;
  }

  @Test
  @DisplayName("BE-027 application.yaml configures the keycloak directory with its type, the secret from the environment and the user id the login names")
  void BE_027_application_yaml_configures_the_keycloak_directory_with_its_type_the_secret_from_the_environment_and_the_user_id_the_login_names() {
    final var yaml = new YamlPropertiesFactoryBean();
    yaml.setResources(new ClassPathResource("config/application.yaml"));
    final var properties = yaml.getObject();
    final var directory = "business-cockpit.user-directory.";

    assertThat(properties.getProperty(directory + "type")).isEqualTo("keycloak");
    assertThat(properties.getProperty(directory + "keycloak.client-secret"))
        .isEqualTo("${KEYCLOAK_DIRECTORY_SECRET}");
    // the login names the user by this claim, and the directory finds the user by the same
    assertThat(properties.getProperty("spring.security.oauth2.client.provider.keycloak.user-name-attribute"))
        .isEqualTo("preferred_username");
    assertThat(properties.getProperty(directory + "keycloak.user-id")).isEqualTo("username");
  }

}
