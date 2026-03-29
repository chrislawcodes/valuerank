import { createLogger } from '@valuerank/shared';

const log = createLogger('auto-pair');

type ComponentTokens = {
  value_first: { token: string };
  value_second: { token: string };
};

type WithIdAndContent = { id: string; content: unknown };

/**
 * Extracts value_first and value_second tokens from a definition's JSONB content.
 * Returns null if the content does not have the expected shape.
 */
export function getComponentTokens(content: unknown): ComponentTokens | null {
  if (content == null || typeof content !== 'object' || Array.isArray(content)) {
    return null;
  }
  const record = content as Record<string, unknown>;
  const components = record.components;
  if (components == null || typeof components !== 'object' || Array.isArray(components)) {
    return null;
  }
  const comp = components as Record<string, unknown>;
  const vf = comp.value_first;
  const vs = comp.value_second;
  if (
    vf == null || typeof vf !== 'object' || Array.isArray(vf) ||
    vs == null || typeof vs !== 'object' || Array.isArray(vs)
  ) {
    return null;
  }
  const vfRecord = vf as Record<string, unknown>;
  const vsRecord = vs as Record<string, unknown>;
  if (typeof vfRecord.token !== 'string' || typeof vsRecord.token !== 'string') {
    return null;
  }
  return {
    value_first: { token: vfRecord.token },
    value_second: { token: vsRecord.token },
  };
}

/**
 * Returns true if two sets of component tokens are mirrors of each other:
 * a.value_first.token === b.value_second.token AND a.value_second.token === b.value_first.token
 */
export function areMirroredPair(a: ComponentTokens, b: ComponentTokens): boolean {
  return (
    a.value_first.token === b.value_second.token &&
    a.value_second.token === b.value_first.token
  );
}

/**
 * Given a target definition, finds its paired companion from a list of candidates.
 *
 * Returns the companion whose value tokens mirror the target's.
 * Returns null (no error) if no companion is found.
 * Returns null and logs a warning if more than one candidate matches (ambiguous).
 * Excludes the target itself from the search.
 */
export function findPairedCompanion(
  target: WithIdAndContent,
  candidates: WithIdAndContent[],
): WithIdAndContent | null {
  const targetTokens = getComponentTokens(target.content);
  if (targetTokens == null) {
    return null;
  }

  const matches = candidates.filter((candidate) => {
    if (candidate.id === target.id) {
      return false;
    }
    const candidateTokens = getComponentTokens(candidate.content);
    if (candidateTokens == null) {
      return false;
    }
    return areMirroredPair(targetTokens, candidateTokens);
  });

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    log.warn(
      { targetId: target.id, matchCount: matches.length },
      'Auto-pair: ambiguous — multiple definitions mirror the target tokens. Treating as unpaired.',
    );
    return null;
  }

  return matches[0] ?? null;
}

/**
 * Returns true if a list of definitions forms a valid pair:
 * exactly 2 definitions with mirrored value tokens.
 */
export function isValidPair(defs: WithIdAndContent[]): boolean {
  if (defs.length !== 2) {
    return false;
  }
  const [a, b] = defs;
  if (a == null || b == null) {
    return false;
  }
  const tokensA = getComponentTokens(a.content);
  const tokensB = getComponentTokens(b.content);
  if (tokensA == null || tokensB == null) {
    return false;
  }
  return areMirroredPair(tokensA, tokensB);
}
