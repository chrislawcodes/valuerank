import { autoImportDir } from '../../utils/auto-import.js';

export const queriesReady = autoImportDir(import.meta.url, 'GraphQL queries');
