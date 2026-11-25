import { defineConfig } from '@hey-api/openapi-ts';

const client = (name) => ({
  input: `../../build/openapi/${name}.yaml`,
  output: `src/generated/${name}`,
  plugins: [
    // An answer which is not a success throws. The index also exports the client.
    { name: '@hey-api/client-fetch', throwOnError: true, exportFromIndex: true },
    '@hey-api/typescript',
    {
      name: '@hey-api/sdk',
      // One class per tag: the tag `officialTasklist` becomes OfficialTasklistApi.
      operations: { strategy: 'byTags', containerName: '{{name}}Api', methods: 'instance' },
      // A method takes one object with all parameters, the body under the name of its schema.
      paramsStructure: 'flat',
      // A method returns the data of the answer, not the answer.
      responseStyle: 'data',
    },
  ],
});

export default defineConfig([client('official-gui-api'), client('cockpit-gui-api')]);
