import { printSchema, lexicographicSortSchema } from 'graphql';
import { builder } from '../graphql/builder.js';
import { beginAutoImportGeneration } from '../utils/auto-import.js';
import '../graphql/types/index.js';

beginAutoImportGeneration();

const [{ queriesReady }, { mutationsReady }] = await Promise.all([
  import('../graphql/queries/index.js'),
  import('../graphql/mutations/index.js'),
]);

await Promise.all([queriesReady, mutationsReady]);

process.stdout.write(printSchema(lexicographicSortSchema(builder.toSchema())) + '\n');
