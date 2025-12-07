import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// utils/paths.ts -> .../devtool/src/server/utils (dev mode)
// When compiled, file lives at .../devtool/dist/server/server/utils (prod mode)
const isDistBuild = __dirname.includes(`${path.sep}dist${path.sep}`);
const relativeLevels = isDistBuild ? '../../../..' : '../../..';
export const DEVTOOL_ROOT = path.resolve(__dirname, relativeLevels);
export const PROJECT_ROOT = path.resolve(DEVTOOL_ROOT, '..');
export const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');
export const SCENARIOS_DIR = path.join(PROJECT_ROOT, 'scenarios');
export const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
export const SCRIPTS_DIR = path.join(DEVTOOL_ROOT, 'scripts');
