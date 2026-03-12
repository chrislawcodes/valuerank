import { pino } from 'pino';

type RuntimeEnv = Record<string, string | undefined>;

function getRuntimeEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: RuntimeEnv };
  };

  return maybeProcess.process?.env ?? {};
}

const runtimeEnv = getRuntimeEnv();
const isBrowser = typeof (
  globalThis as typeof globalThis & { window?: unknown }
).window !== 'undefined';
const isDevelopment = runtimeEnv.NODE_ENV !== 'production';

export const logger = pino({
  level: runtimeEnv.LOG_LEVEL ?? 'info',
  transport: !isBrowser && isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export function createLogger(context: string) {
  return logger.child({ context });
}
