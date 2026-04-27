import type { DomainAnalysisValuePair } from '../domain-analysis-values.js';
import type { CachedWinnerFirstDecision } from './decision-model-types.js';

export type ScaleCode = '1' | '2' | '3' | '4' | '5' | 'refusal' | 'unknown';

/**
 * Derive the legacy 1–5 scale position from a canonical decision.
 *
 * `canonicalDecision` is the single source of truth for decisions; the 1–5
 * number is a probe-format artifact that only a few legacy consumers still
 * need. This helper is the ONLY place in the codebase that bridges back to
 * that format.
 *
 * ⚠️ CALLERS ALLOWLIST ⚠️
 * This function is intentionally restricted. Approved callers:
 *   - cloud/scripts/job-choice-bridge-report-lib.ts
 *   - cloud/scripts/job-choice-bridge-report.ts
 *   - their __tests__ / test files
 *
 * **Adding a new caller requires updating this allowlist AND justifying the
 * use case in the PR.** Do NOT call this from:
 *   - External API emitters (MCP tools, CSV / OData / XLSX exports)
 *   - GraphQL resolvers serving the public schema
 *   - Web components
 *   - Analysis aggregation code
 *
 * Those callers should read `canonicalDecision.favoredValueKey` /
 * `.strength` / `.decisionState` directly, not the 1–5 number. The 1–5
 * number encodes probe scale layout, not a semantic fact — if you find
 * yourself reaching for it, reconsider whether the caller really needs
 * "scale position" or just "which value was favored."
 *
 * Mapping (derives scale position from canonical + pair + orientationFlipped):
 *
 *   decisionState === 'refusal'                 → 'refusal'
 *   decisionState === 'unknown'                 → 'unknown'
 *   decisionState === 'parse_failed'            → 'unknown'
 *   decisionState === 'neutral'                 → '3'
 *   favoredValueKey = valueA, strong, !flipped  → '5'
 *   favoredValueKey = valueA, strong, flipped   → '1'
 *   favoredValueKey = valueA, lean, !flipped    → '4'
 *   favoredValueKey = valueA, lean, flipped     → '2'
 *   favoredValueKey = valueB, strong, !flipped  → '1'
 *   favoredValueKey = valueB, strong, flipped   → '5'
 *   favoredValueKey = valueB, lean, !flipped    → '2'
 *   favoredValueKey = valueB, lean, flipped     → '4'
 *   everything else (malformed canonical)       → 'unknown'
 */
export function scaleCodeFromCanonical(
  canonical: CachedWinnerFirstDecision,
  pair: DomainAnalysisValuePair,
  orientationFlipped: boolean,
): ScaleCode {
  if (canonical.decisionState === 'refusal') return 'refusal';
  if (canonical.decisionState === 'unknown') return 'unknown';
  if (canonical.decisionState === 'parse_failed') return 'unknown';
  if (canonical.decisionState === 'neutral') return '3';

  // decisionState === 'resolved' — need favored key + strength
  const { favoredValueKey, strength } = canonical;
  if (favoredValueKey == null) return 'unknown';
  if (strength !== 'strong' && strength !== 'lean') return 'unknown';

  const isValueA = favoredValueKey === pair.valueA;
  const isValueB = favoredValueKey === pair.valueB;
  if (!isValueA && !isValueB) return 'unknown';

  // Un-flipped layout: 5 = valueA strong, 4 = valueA lean, 2 = valueB lean, 1 = valueB strong.
  // Flipped layout:    5 = valueB strong, 4 = valueB lean, 2 = valueA lean, 1 = valueA strong.
  if (isValueA && strength === 'strong') return orientationFlipped ? '1' : '5';
  if (isValueA && strength === 'lean') return orientationFlipped ? '2' : '4';
  if (isValueB && strength === 'strong') return orientationFlipped ? '5' : '1';
  if (isValueB && strength === 'lean') return orientationFlipped ? '4' : '2';

  // Unreachable under the type system, but satisfies exhaustiveness.
  return 'unknown';
}
