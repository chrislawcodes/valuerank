import { readdirSync, existsSync } from 'node:fs';
import { basename, dirname, join, parse } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLogger } from '@valuerank/shared';

const log = createLogger('auto-import');
let importGeneration = 0;
const importedModuleUrlsByGeneration = new Map<number, Set<string>>();

export function beginAutoImportGeneration(): number {
  importGeneration += 1;
  importedModuleUrlsByGeneration.set(importGeneration, new Set());
  return importGeneration;
}

function normalizeExcludeList(exclude: string[]): Set<string> {
  const normalized = new Set<string>();

  for (const entry of exclude) {
    normalized.add(entry);
    normalized.add(parse(entry).name);
  }

  return normalized;
}

function isExcluded(
  normalizedExclude: Set<string>,
  relativePath: string,
  fileName: string
): boolean {
  return (
    normalizedExclude.has(relativePath) ||
    normalizedExclude.has(fileName) ||
    normalizedExclude.has(parse(relativePath).name)
  );
}

function isDeclarationFile(fileName: string): boolean {
  return /\.d\.(ts|mts|cts)$/.test(fileName);
}

function pickExistingModulePath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function hasSiblingBarrel(dirPath: string, fileName: string): boolean {
  return (
    existsSync(join(dirPath, fileName, 'index.js')) ||
    existsSync(join(dirPath, fileName, 'index.ts'))
  );
}

/**
 * Synchronously discovers modules in a directory and imports them in sorted order.
 * Root files are imported directly, and barrel subdirectories import their index file.
 */
export async function autoImportDir(
  dirUrl: string,
  description: string,
  exclude: string[] = []
): Promise<void> {
  const generation = importGeneration > 0 ? importGeneration : beginAutoImportGeneration();
  const importedModuleUrls = importedModuleUrlsByGeneration.get(generation) ?? new Set<string>();
  const dirPath = dirname(fileURLToPath(dirUrl));
  const normalizedExclude = normalizeExcludeList(exclude);
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const rootModulePaths: string[] = [];
  const subdirectoryModulePaths: string[] = [];

  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name);

    if (entry.isFile()) {
      const relativePath = entry.name;
      const fileName = parse(entry.name).name;

      if (
        (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) &&
        !isDeclarationFile(entry.name) &&
        !entry.name.startsWith('_') &&
        !entry.name.startsWith('index.') &&
        !hasSiblingBarrel(dirPath, fileName) &&
        !isExcluded(normalizedExclude, relativePath, fileName)
      ) {
        rootModulePaths.push(entryPath);
      }

      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const relativeIndexJs = join(entry.name, 'index.js');
    const relativeIndexTs = join(entry.name, 'index.ts');
    if (
      isExcluded(normalizedExclude, relativeIndexJs, basename(entry.name)) ||
      isExcluded(normalizedExclude, relativeIndexTs, basename(entry.name))
    ) {
      continue;
    }

    const indexPath = pickExistingModulePath([
      join(entryPath, 'index.js'),
      join(entryPath, 'index.ts'),
    ]);

    if (indexPath !== null) {
      subdirectoryModulePaths.push(indexPath);
    }
  }

  rootModulePaths.sort((left, right) => left.localeCompare(right));
  subdirectoryModulePaths.sort((left, right) => left.localeCompare(right));

  let importedCount = 0;
  for (const modulePath of [...rootModulePaths, ...subdirectoryModulePaths]) {
    const moduleUrl = pathToFileURL(modulePath).href;
    if (importedModuleUrls.has(moduleUrl)) {
      continue;
    }
    await import(moduleUrl);
    importedModuleUrls.add(moduleUrl);
    importedCount += 1;
  }

  importedModuleUrlsByGeneration.set(generation, importedModuleUrls);

  log.info(
    {
      description,
      directory: basename(dirPath),
      fileCount: importedCount,
    },
    'Auto-imported modules'
  );
}
