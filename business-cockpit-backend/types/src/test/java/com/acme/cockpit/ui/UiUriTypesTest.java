package com.acme.cockpit.ui;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * PKG-036 and PKG-037: the types jar holds one constant per entry of ui-uri-types.json of the types
 * library, and it is the module types of this repository. The build writes the class from the file
 * that surefire names in the system property ui-uri-types.json.
 */
class UiUriTypesTest {

  private static final Pattern NAME = Pattern.compile("\"name\"\\s*:\\s*\"([^\"]+)\"");

  private static String read(final Path path) throws IOException {
    return Files.readString(path, StandardCharsets.UTF_8);
  }

  private static List<String> namesInTheTypesLibrary() throws IOException {
    final var file = Path.of(System.getProperty("ui-uri-types.json"));
    return NAME.matcher(read(file)).results().map(match -> match.group(1)).toList();
  }

  @Test
  @DisplayName("PKG-036 the class has one String constant per entry of ui-uri-types.json, EXTERNAL included")
  void PKG_036_the_class_has_one_string_constant_per_entry_of_ui_uri_types_json() throws Exception {
    final var names = namesInTheTypesLibrary();

    final var constants = Arrays.stream(UiUriTypes.class.getDeclaredFields())
        .filter(field -> Modifier.isPublic(field.getModifiers()))
        .collect(Collectors.toMap(java.lang.reflect.Field::getName, field -> {
          try {
            return field.get(null);
          } catch (IllegalAccessException e) {
            throw new IllegalStateException(e);
          }
        }));

    assertThat(names).contains("EXTERNAL", "ES_MODULES");
    assertThat(constants.keySet()).containsExactlyInAnyOrderElementsOf(names);
    names.forEach(name -> assertThat(constants.get(name)).isEqualTo(name));
  }

  @Test
  @DisplayName("PKG-036 the class is final with a private constructor, in the package of Q-TYPES-JAR")
  void PKG_036_the_class_is_final_with_a_private_constructor() {
    assertThat(UiUriTypes.class.getPackageName()).isEqualTo("com.acme.cockpit.ui");
    assertThat(Modifier.isFinal(UiUriTypes.class.getModifiers())).isTrue();
    assertThat(UiUriTypes.class.getDeclaredConstructors())
        .allMatch(constructor -> Modifier.isPrivate(constructor.getModifiers()));
  }

  @Test
  @DisplayName("PKG-036 no constant points to a constant of VanillaBP and the jar holds the one class")
  void PKG_036_no_constant_points_to_a_constant_of_vanillabp() throws Exception {
    final var source = read(Path.of("target/generated-sources/ui-uri-types/com/acme/cockpit/ui/UiUriTypes.java"));

    assertThat(source).doesNotContain("vanillabp", "io.vanillabp");
    assertThat(source).containsPattern("public static final String EXTERNAL = \"EXTERNAL\";");
  }

  @Test
  @DisplayName("PKG-037 the module types has the parent of the backend and reads the types library in ui.version")
  void PKG_037_the_module_types_reads_the_types_library_in_ui_version() throws Exception {
    final var parent = read(Path.of("../pom.xml"));
    final var types = read(Path.of("pom.xml"));

    assertThat(parent).containsPattern("<module>types</module>\\s*<module>application</module>");
    assertThat(parent).contains("<ui.version>");
    assertThat(types).contains("<artifactId>business-cockpit-backend</artifactId>");
    assertThat(types).contains("@acme/bc-types/-/bc-types-${ui.version}.tgz");
    assertThat(types).contains("bc-types.local");
  }

  @Test
  @DisplayName("PKG-037 the README names the order cockpit release, user interface, backend repository and why")
  void PKG_037_the_readme_names_the_order_and_why() throws Exception {
    final var readme = read(Path.of("../README.md"));

    assertThat(readme).containsPattern("(?s)cockpit release.*user interface.*backend repository");
    assertThat(readme).contains("OpenAPI");
    assertThat(readme).contains("circle");
    assertThat(readme).contains("-Dbc-types.local");
  }

}
