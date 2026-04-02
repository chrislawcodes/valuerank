import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { autoImportDir } from '../../src/utils/auto-import.js';

describe('autoImportDir', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir !== null) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    delete (globalThis as { __autoImportOrder?: string[] }).__autoImportOrder;
  });

  it('skips declaration files while importing regular modules and subdirectory barrels', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'auto-import-test-'));
    mkdirSync(join(tempDir, 'domain'));

    writeFileSync(
      join(tempDir, 'alpha.js'),
      'globalThis.__autoImportOrder = [...(globalThis.__autoImportOrder ?? []), "alpha"];'
    );
    writeFileSync(
      join(tempDir, 'skip.d.ts'),
      'export type ShouldNotLoad = never;'
    );
    writeFileSync(
      join(tempDir, 'domain', 'index.js'),
      'globalThis.__autoImportOrder = [...(globalThis.__autoImportOrder ?? []), "domain"];'
    );

    await autoImportDir(pathToFileURL(join(tempDir, 'caller.js')).href, 'test import');

    expect((globalThis as { __autoImportOrder?: string[] }).__autoImportOrder).toEqual([
      'alpha',
      'domain',
    ]);
  });
});
