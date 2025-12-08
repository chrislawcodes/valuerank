/**
 * Spawn Utility Tests
 *
 * Tests the Python process spawning utility.
 * Uses actual Python processes to verify JSON communication works.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawnPython } from '../../src/queue/spawn.js';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = join(tmpdir(), 'valuerank-spawn-tests');
const echoScript = join(testDir, 'echo.py');
const errorScript = join(testDir, 'error.py');
const slowScript = join(testDir, 'slow.py');
const invalidJsonScript = join(testDir, 'invalid_json.py');
const stderrScript = join(testDir, 'stderr.py');

describe('spawnPython', () => {
  beforeAll(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Create echo script - reads JSON from stdin, echoes it back
    writeFileSync(
      echoScript,
      `
import sys
import json

data = json.load(sys.stdin)
data['echoed'] = True
print(json.dumps(data))
`.trim()
    );

    // Create error script - exits with non-zero code
    writeFileSync(
      errorScript,
      `
import sys
sys.stderr.write("Error message\\n")
sys.exit(1)
`.trim()
    );

    // Create slow script - takes a while to complete
    writeFileSync(
      slowScript,
      `
import sys
import json
import time

data = json.load(sys.stdin)
time.sleep(2)  # Sleep for 2 seconds
print(json.dumps({"slow": True}))
`.trim()
    );

    // Create invalid JSON script - outputs non-JSON
    writeFileSync(
      invalidJsonScript,
      `
import sys
import json

data = json.load(sys.stdin)
print("This is not valid JSON")
`.trim()
    );

    // Create stderr script - writes to stderr but succeeds
    writeFileSync(
      stderrScript,
      `
import sys
import json

data = json.load(sys.stdin)
sys.stderr.write("Warning: something happened\\n")
print(json.dumps({"success": True}))
`.trim()
    );
  });

  describe('successful execution', () => {
    it('sends input and receives output', async () => {
      const result = await spawnPython<{ message: string }, { message: string; echoed: boolean }>(
        echoScript,
        { message: 'hello' }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe('hello');
        expect(result.data.echoed).toBe(true);
      }
    });

    it('handles complex input data', async () => {
      const complexInput = {
        array: [1, 2, 3],
        nested: { key: 'value' },
        number: 42,
        boolean: true,
        nullable: null,
      };

      const result = await spawnPython(echoScript, complexInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject(complexInput);
      }
    });

    it('handles stderr output but still succeeds', async () => {
      const result = await spawnPython(stderrScript, { test: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ success: true });
      }
    });
  });

  describe('error handling', () => {
    it('returns error for non-zero exit code', async () => {
      const result = await spawnPython(errorScript, { test: true });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('exited with code');
        expect(result.stderr).toContain('Error message');
      }
    });

    it('returns error for invalid JSON output', async () => {
      const result = await spawnPython(invalidJsonScript, { test: true });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to parse');
      }
    });

    it('returns error for non-existent script', async () => {
      const result = await spawnPython('/nonexistent/script.py', { test: true });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('handles timeout', async () => {
      const result = await spawnPython(slowScript, { test: true }, { timeout: 100 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('timed out');
      }
    });
  });

  describe('options', () => {
    it('respects custom timeout', async () => {
      const start = Date.now();
      const result = await spawnPython(slowScript, { test: true }, { timeout: 200 });
      const duration = Date.now() - start;

      expect(result.success).toBe(false);
      // Should timeout around 200ms, not wait the full 2 seconds
      expect(duration).toBeLessThan(1000);
    });

    it('accepts custom working directory', async () => {
      const result = await spawnPython(echoScript, { cwd: 'test' }, { cwd: testDir });

      expect(result.success).toBe(true);
    });

    it('accepts custom environment variables', async () => {
      // Create script that reads env var
      const envScript = join(testDir, 'env.py');
      writeFileSync(
        envScript,
        `
import sys
import json
import os

data = json.load(sys.stdin)
data['custom_var'] = os.environ.get('CUSTOM_VAR', 'not set')
print(json.dumps(data))
`.trim()
      );

      const result = await spawnPython(
        envScript,
        { test: true },
        { env: { CUSTOM_VAR: 'custom_value' } }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject({ custom_var: 'custom_value' });
      }
    });
  });
});
