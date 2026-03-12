import type { Prisma } from '@valuerank/db';
import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 2;

export function ensureSchemaVersion(content: Record<string, unknown>): Prisma.InputJsonValue {
  if (!('schema_version' in content)) {
    return { schema_version: CURRENT_SCHEMA_VERSION, ...content };
  }

  return content as Prisma.InputJsonValue;
}

export const zContentObject = z.record(z.unknown());

function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }

  if (value !== null && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, normalizeJsonValue(child)] as const);
    return Object.fromEntries(sortedEntries);
  }

  return value;
}

export function jsonValuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeJsonValue(a)) === JSON.stringify(normalizeJsonValue(b));
}

export function stripRootSchemaVersion(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const { schema_version: _schemaVersion, ...rest } = value as Record<string, unknown>;
  return rest;
}
