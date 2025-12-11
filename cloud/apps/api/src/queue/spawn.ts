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
  /** Callback for progress updates from stderr (JSON lines with type="progress") */
  onProgress?: (progress: ProgressUpdate) => void | Promise<void>;
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
 * Progress update emitted by Python workers.
 */
export type ProgressUpdate = {
  type: 'progress';
  phase: string;
  expectedScenarios: number;
  generatedScenarios: number;
  inputTokens: number;
  outputTokens: number;
  message: string;
};

/**
 * Try to parse a line as a progress update JSON.
 * Returns null if the line is not a valid progress update.
 */
function tryParseProgress(line: string): ProgressUpdate | null {
  if (!line.trim().startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(line.trim());
    if (parsed.type === 'progress') {
      return parsed as ProgressUpdate;
    }
  } catch {
    // Not valid JSON, ignore
  }

  return null;
}

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
  const { timeout = 300000, cwd, env, onProgress } = options;

  log.debug({ script, timeout }, 'Spawning Python process');

  return new Promise((resolve) => {
    const pythonProcess = spawn('python3', [script], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stderrBuffer = ''; // Buffer for incomplete lines
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

    // Collect stderr and parse progress updates
    pythonProcess.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;

      // Only process if we have a progress callback
      if (onProgress) {
        stderrBuffer += chunk;

        // Process complete lines
        const lines = stderrBuffer.split('\n');
        // Keep the last incomplete line in the buffer
        stderrBuffer = lines.pop() || '';

        for (const line of lines) {
          const progress = tryParseProgress(line);
          if (progress) {
            // Call the progress callback (fire and forget, don't block)
            Promise.resolve(onProgress(progress)).catch((err) => {
              log.warn({ err }, 'Progress callback failed');
            });
          }
        }
      }
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

      // Process any remaining buffered stderr
      if (onProgress && stderrBuffer) {
        const progress = tryParseProgress(stderrBuffer);
        if (progress) {
          Promise.resolve(onProgress(progress)).catch((err) => {
            log.warn({ err }, 'Progress callback failed');
          });
        }
      }

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
