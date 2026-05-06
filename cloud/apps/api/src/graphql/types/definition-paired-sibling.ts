/**
 * Resolver helper for `Definition.pairedSibling`.
 *
 * Extracted out of `definition.ts` to keep that file under the prod-warn
 * file-size threshold. Reuses `findPairedCompanion` from `utils/auto-pair`
 * so callers do not duplicate the canonical companion-resolution logic.
 */

import { db } from '@valuerank/db';
import { findPairedCompanion } from '../../utils/auto-pair.js';

type DefinitionInput = {
  id: string;
  domainId: string | null;
  content: unknown;
};

type DefinitionRow = Awaited<ReturnType<typeof db.definition.findFirst>>;

export async function resolveDefinitionPairedSibling(
  definition: DefinitionInput,
): Promise<DefinitionRow> {
  const contentRecord =
    definition.content !== null && typeof definition.content === 'object' && !Array.isArray(definition.content)
      ? (definition.content as Record<string, unknown>)
      : null;
  const methodology =
    contentRecord?.methodology !== null && typeof contentRecord?.methodology === 'object' && !Array.isArray(contentRecord?.methodology)
      ? (contentRecord.methodology as Record<string, unknown>)
      : null;
  const pairKey = typeof methodology?.pair_key === 'string' ? methodology.pair_key : null;
  if (pairKey === null || pairKey.trim() === '') return null;

  const candidates = await db.definition.findMany({
    where: {
      id: { not: definition.id },
      domainId: definition.domainId,
      deletedAt: null,
      content: {
        path: ['methodology', 'pair_key'],
        equals: pairKey,
      },
    },
  });

  if (candidates.length === 0) return null;

  const companion = findPairedCompanion(
    { id: definition.id, content: definition.content },
    candidates.map((row) => ({ id: row.id, content: row.content })),
  );
  if (companion === null || companion === undefined) return null;

  return candidates.find((row) => row.id === companion.id) ?? null;
}
