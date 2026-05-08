import { autoImportDir } from '../../utils/auto-import.js';

import './model-agreement-on-tradeoffs.js';

export const queriesReady = autoImportDir(import.meta.url, 'GraphQL queries');
