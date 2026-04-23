import { Prisma } from '@prisma/client';

export const PROBE_QUEUE_PREFIX = 'probe_' as const;
export const LEGACY_PROBE_QUEUE_NAME = 'probe_scenario' as const;
export const PROBE_DEAD_LETTER_QUEUE_NAME = 'probe_dead_letter' as const;

/**
 * Matches all active probe queues.
 *
 * This includes the legacy `probe_scenario` queue and provider-specific
 * queues such as `probe_openai` and `probe_mistral`.
 *
 * Dead-letter queues are excluded so they do not count as active probe work.
 */
export const ACTIVE_PROBE_QUEUE_SQL = Prisma.sql`(
  name LIKE 'probe\\_%' ESCAPE '\\'
  AND name <> ${PROBE_DEAD_LETTER_QUEUE_NAME}
)`;

/**
 * Returns true for active probe work queues.
 */
export function isActiveProbeQueueName(name: string): boolean {
  return name.startsWith(PROBE_QUEUE_PREFIX) && name !== PROBE_DEAD_LETTER_QUEUE_NAME;
}

/**
 * Normalizes provider-specific probe queue names back to the legacy probe type.
 */
export function normalizeProbeQueueName(name: string): string {
  return isActiveProbeQueueName(name) ? LEGACY_PROBE_QUEUE_NAME : name;
}
