import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;

/**
 * Writes UiUriTypes.java from ui-uri-types.json of the types library, one constant per entry with
 * its description as Javadoc. Run by the build: java GenerateUiUriTypes.java json folder package
 */
public class GenerateUiUriTypes {

  private static final Pattern ENTRY = Pattern.compile(
      "\\{\\s*\"name\"\\s*:\\s*\"([^\"]+)\"\\s*,\\s*\"description\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"\\s*}");

  public static void main(final String... arguments) throws IOException {
    final var json = Files.readString(Path.of(arguments[0]), StandardCharsets.UTF_8);
    final var source = new StringBuilder()
        .append("package ").append(arguments[2]).append(";\n\n")
        .append("/** The values of ui-uri-type this cockpit user interface understands. */\n")
        .append("public final class UiUriTypes {\n");
    final var entries = ENTRY.matcher(json).results().toList();
    if (entries.isEmpty()) {
      throw new IllegalStateException("no entry found in " + arguments[0]);
    }
    for (final var entry : entries) {
      final var description = entry.group(2).replace("\\\"", "\"").replace("\\\\", "\\")
          .replace("*/", "*&#47;");
      source.append("\n  /** ").append(description).append(" */\n")
          .append("  public static final String ").append(entry.group(1))
          .append(" = \"").append(entry.group(1)).append("\";\n");
    }
    source.append("\n  private UiUriTypes() {\n  }\n\n}\n");
    final var target = Path.of(arguments[1], arguments[2].replace('.', '/'), "UiUriTypes.java");
    Files.createDirectories(target.getParent());
    Files.writeString(target, source, StandardCharsets.UTF_8);
  }

}
