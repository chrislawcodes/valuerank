import { isValidPair } from '../../../../utils/auto-pair.js';
import type { DefinitionRow, PairedMethodology, LaunchGroup } from './types.js';

export function extractPairedMethodology(content: unknown): PairedMethodology | null {
  if (content == null || typeof content !== 'object' || Array.isArray(content)) return null;
  const m = (content as Record<string, unknown>).methodology;
  if (m == null || typeof m !== 'object' || Array.isArray(m)) return null;
  const rec = m as Record<string, unknown>;
  if (
    typeof rec.family !== 'string' ||
    rec.family === '' ||
    typeof rec.pair_key !== 'string' ||
    rec.pair_key === ''
  ) {
    return null;
  }
  return {
    family: rec.family,
    pair_key: rec.pair_key,
  };
}

export function groupDefinitionsByPairKey(definitions: DefinitionRow[]): {
  groups: LaunchGroup[];
  incompletePairKeys: string[];
} {
  const byPairKey = new Map<string, DefinitionRow[]>();
  const singles: DefinitionRow[] = [];

  for (const def of definitions) {
    const methodology = extractPairedMethodology(def.content);
    if (methodology) {
      const bucket = byPairKey.get(methodology.pair_key) ?? [];
      bucket.push(def);
      byPairKey.set(methodology.pair_key, bucket);
    } else {
      singles.push(def);
    }
  }

  const groups: LaunchGroup[] = [];
  const incompletePairKeys: string[] = [];

  for (const [pairKey, defs] of byPairKey) {
    if (isValidPair(defs)) {
      groups.push({ pairKey, definitions: defs });
    } else {
      incompletePairKeys.push(pairKey);
      for (const def of defs) {
        singles.push(def);
      }
    }
  }

  for (const def of singles) {
    groups.push({ pairKey: null, definitions: [def] });
  }

  return { groups, incompletePairKeys };
}
