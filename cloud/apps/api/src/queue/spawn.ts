/**
 * Python Process Spawning Utility
 *
 * Provides typed interface for spawning Python processes with JSON communication.
 */

import { spawn } from 'child_process';
import { createLogger } from '@valuerank/shared';

const log = createLogger('queue:spawn');

export type SpawnPythonOptions = {
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Working directory for Python script */
  cwd?: string;
  /** Additional environment variables */
  env?: Record<string, string>;
};

export type SpawnPythonResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  stderr?: string;
};

/**
 * Spawns a Python process and communicates via JSON stdin/stdout.
 *
 * @param script - Path to Python script
 * @param input - Data to send to script via stdin (will be JSON serialized)
 * @param options - Spawn options
 * @returns Promise resolving to parsed JSON output or error
 */
export async function spawnPython<TInput, TOutput>(
  script: string,
  input: TInput,
  options: SpawnPythonOptions = {}
): Promise<SpawnPythonResult<TOutput>> {
  const { timeout = 300000, cwd, env } = options;

  log.debug({ script, timeout }, 'Spawning Python process');

  return new Promise((resolve) => {
    const pythonProcess = spawn('python3', [script], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const finish = (result: SpawnPythonResult<TOutput>) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    // Timeout handling
    timeoutId = setTimeout(() => {
      log.warn({ script, timeout }, 'Python process timed out');
      pythonProcess.kill('SIGTERM');
      finish({
        success: false,
        error: `Process timed out after ${timeout}ms`,
        stderr,
      });
    }, timeout);

    // Collect stdout
    pythonProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    // Collect stderr
    pythonProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Handle process errors
    pythonProcess.on('error', (err) => {
      log.error({ err, script }, 'Failed to spawn Python process');
      finish({
        success: false,
        error: `Failed to spawn process: ${err.message}`,
        stderr,
      });
    });

    // Handle process exit
    pythonProcess.on('close', (code) => {
      if (resolved) return;

      if (code !== 0) {
        log.warn({ script, code, stderr }, 'Python process exited with error');
        finish({
          success: false,
          error: `Process exited with code ${code}`,
          stderr,
        });
        return;
      }

      // Parse JSON output
      try {
        const data = JSON.parse(stdout) as TOutput;
        log.debug({ script }, 'Python process completed successfully');
        finish({ success: true, data });
      } catch (parseError) {
        log.error({ script, stdout, parseError }, 'Failed to parse Python output');
        finish({
          success: false,
          error: `Failed to parse output: ${stdout.slice(0, 200)}`,
          stderr,
        });
      }
    });

    // Send input to stdin
    try {
      const inputJson = JSON.stringify(input);
      pythonProcess.stdin.write(inputJson);
      pythonProcess.stdin.end();
    } catch (writeError) {
      log.error({ script, writeError }, 'Failed to write to Python stdin');
      finish({
        success: false,
        error: `Failed to write input: ${writeError}`,
      });
    }
  });
}
