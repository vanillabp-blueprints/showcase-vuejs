// Builds the UI jar from packages/ui/dist. A jar is a zip file, so no Maven and no JDK is needed.
// Spring Boot serves static files from static/ on the class path.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const UI_JAR = { group: 'com.acme', artifact: 'business-cockpit-ui' };

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const builtFiles = join(repositoryRoot, 'packages', 'ui', 'dist');
const outputFolder = join(repositoryRoot, 'build', 'jars');
const { version } = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));

function filesBelow(folder) {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

const text = (content) => new TextEncoder().encode(content);

const jarContent = {
  // The manifest must be the first entry of a jar.
  'META-INF/MANIFEST.MF': text('Manifest-Version: 1.0\r\nCreated-By: business-cockpit-ui build\r\n\r\n'),
};
for (const file of filesBelow(builtFiles)) {
  jarContent[`static/${relative(builtFiles, file).split('\\').join('/')}`] = readFileSync(file);
}

const pom = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>${UI_JAR.group}</groupId>
  <artifactId>${UI_JAR.artifact}</artifactId>
  <version>${version}</version>
  <packaging>jar</packaging>
</project>
`;

mkdirSync(outputFolder, { recursive: true });
const jarFile = join(outputFolder, `${UI_JAR.artifact}-${version}.jar`);
writeFileSync(jarFile, zipSync(jarContent));
writeFileSync(join(outputFolder, `${UI_JAR.artifact}-${version}.pom`), pom);
console.log(`UI jar written to ${jarFile}`);
