// CI note: this workspace commits generated GraphQL output, so verify freshness
// against the checked-in schema snapshot instead of depending on a live API.
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './schema.graphql',
  documents: 'src/**/*.graphql',
  generates: {
    './src/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-operations', 'typescript-urql'],
      config: {
        withHooks: true,
        urqlImportFrom: 'urql',
      },
    },
  },
};

export default config;
