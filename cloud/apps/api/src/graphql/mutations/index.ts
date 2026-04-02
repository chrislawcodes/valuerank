import './domain/index.js';
import { autoImportDir } from '../../utils/auto-import.js';

export const mutationsReady = autoImportDir(import.meta.url, 'GraphQL mutations');
