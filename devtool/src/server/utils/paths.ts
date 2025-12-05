import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// utils/paths.ts -> .../devtool/src/server/utils
// Go up three directories to reach the devtool project root
export const DEVTOOL_ROOT = path.resolve(__dirname, '../../..');
export const PROJECT_ROOT = path.resolve(DEVTOOL_ROOT, '..');
export const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');
export const SCENARIOS_DIR = path.join(PROJECT_ROOT, 'scenarios');
export const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
export const SCRIPTS_DIR = path.join(DEVTOOL_ROOT, 'scripts');
