/**
 * Simple logging utility for the DevTool server.
 * Provides structured logging with timestamps and log levels.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',  // gray
  info: '\x1b[36m',   // cyan
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
};

const RESET = '\x1b[0m';

function formatLog(entry: LogEntry): string {
  const color = LOG_COLORS[entry.level];
  const levelStr = entry.level.toUpperCase().padEnd(5);
  const time = entry.timestamp.split('T')[1].slice(0, 8);

  let output = `${color}[${time}] ${levelStr}${RESET} [${entry.context}] ${entry.message}`;

  if (entry.data !== undefined) {
    if (typeof entry.data === 'object') {
      try {
        const dataStr = JSON.stringify(entry.data, null, 2);
        // Truncate long data
        if (dataStr.length > 500) {
          output += `\n${dataStr.slice(0, 500)}...`;
        } else {
          output += `\n${dataStr}`;
        }
      } catch {
        output += ` [data: ${typeof entry.data}]`;
      }
    } else {
      output += ` ${entry.data}`;
    }
  }

  return output;
}

class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private log(level: LogLevel, message: string, data?: unknown) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      data,
    };

    const formatted = formatLog(entry);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  debug(message: string, data?: unknown) {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown) {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown) {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown) {
    this.log('error', message, data);
  }

  /**
   * Create a child logger with a sub-context
   */
  child(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`);
  }

  /**
   * Time an async operation
   */
  async time<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    this.debug(`Starting: ${operation}`);
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(`Completed: ${operation} (${duration}ms)`);
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      this.error(`Failed: ${operation} (${duration}ms)`, err);
      throw err;
    }
  }
}

/**
 * Create a logger for a specific context (e.g., route name)
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}

export type { Logger };
