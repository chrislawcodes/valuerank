/**
 * Validates a Definition for pressure-sensitivity aggregation by inspecting its
 * fully-resolved (inheritance-applied) content.
 *
 * Per spec FR-018 and plan Decision 11, this pass MUST run against `resolvedContent`
 * (via `resolveDefinitionContent`), NOT against the raw stored `content`. Forked
 * Definitions store partial overrides; reading raw `content` would misclassify forks
 * as missing-levels or legacy-values-only and drop their valid transcripts.
 */

import { resolveDefinitionContent, type DefinitionContent } from '@valuerank/db';
import { buildSafeLevelLookup, type DefinitionDimension } from '../../graphql/queries/scenarios-utils.js';

/**
 * Exclusion reason codes for the pressure-sensitivity report. Names match spec FR-018
 * categories (a-h). Descriptive strings are surfaced through the GraphQL API so clients
 * can render reasons without a reverse-mapping table.
 */
export type PressureSensitivityExclusionReason =
  | 'legacy-single-dimension'        // (a) values[] only, no dimensions[].levels[]
  | 'missing-or-empty-levels'        // (b) dimensions[] present but no usable levels[]
  | 'score-out-of-range'             // (c) non-integer or outside 1..5
  | 'normalization-collision'        // (e) buildSafeLevelLookup detected a collision
  | 'missing-or-self-pair-tokens';   // (g) value_first/second token missing/equal

export type ValidationResult =
  | { status: 'eligible'; resolvedContent: DefinitionContent }
  | { status: 'excluded'; reason: PressureSensitivityExclusionReason };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkValuePairTokens(content: DefinitionContent): boolean {
  const components = content.components;
  if (!components) return false;
  const first = components.value_first?.token;
  const second = components.value_second?.token;
  if (!isNonEmptyString(first) || !isNonEmptyString(second)) return false;
  if (first.trim() === second.trim()) return false;
  return true;
}

export async function validateDefinitionForPressureSensitivity(
  definitionId: string,
): Promise<ValidationResult> {
  const resolved = await resolveDefinitionContent(definitionId);
  const content = resolved.resolvedContent;

  // (g) — value-pair tokens missing or self-referential. Checked first so we don't
  // burn time on dimension validation for unusable Definitions.
  if (!checkValuePairTokens(content)) {
    return { status: 'excluded', reason: 'missing-or-self-pair-tokens' };
  }

  const dimensions = Array.isArray(content.dimensions) ? content.dimensions : [];

  // (a) — legacy single-dimension content. Resolved content guarantees `dimensions: []`,
  // but `dimensions[].levels[]` may be absent if every dimension carries only legacy `values[]`.
  // Treat the case where ALL dimensions lack `levels[]` AND at least one has `values[]` as legacy.
  const allMissingLevels = dimensions.every(
    (d) => !Array.isArray(d.levels) || d.levels.length === 0,
  );
  const anyHasLegacyValues = dimensions.some(
    (d) => Array.isArray(d.values) && d.values.length > 0,
  );
  if (allMissingLevels && anyHasLegacyValues) {
    return { status: 'excluded', reason: 'legacy-single-dimension' };
  }

  // (b) — missing or empty levels[] on any dimension that doesn't fall under (a).
  // We require every dimension to carry usable `levels[]` for two-pressure aggregation.
  if (dimensions.length === 0 || allMissingLevels) {
    return { status: 'excluded', reason: 'missing-or-empty-levels' };
  }
  for (const dim of dimensions) {
    if (!Array.isArray(dim.levels) || dim.levels.length === 0) {
      return { status: 'excluded', reason: 'missing-or-empty-levels' };
    }
  }

  // (c) — out-of-range / non-integer scores; (e) — collision.
  for (const dim of dimensions) {
    const lookup = buildSafeLevelLookup(dim as DefinitionDimension);
    if (lookup.exclusionReason === 'out-of-range') {
      return { status: 'excluded', reason: 'score-out-of-range' };
    }
    if (lookup.exclusionReason === 'collision') {
      return { status: 'excluded', reason: 'normalization-collision' };
    }
    if (lookup.exclusionReason === 'legacy-values-only') {
      // A single legacy-values-only dimension is enough to disqualify the Definition;
      // map to (a) since it indicates legacy content shape on that dimension.
      return { status: 'excluded', reason: 'legacy-single-dimension' };
    }
    if (lookup.exclusionReason === 'empty-levels') {
      return { status: 'excluded', reason: 'missing-or-empty-levels' };
    }
  }

  return { status: 'eligible', resolvedContent: content };
}
