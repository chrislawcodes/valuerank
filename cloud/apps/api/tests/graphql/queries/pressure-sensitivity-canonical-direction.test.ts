/**
 * Regression test for the canonical-token bug in the pressure-sensitivity resolver.
 *
 * Pre-fix bug:
 *   The resolver called assignOwnOpponent with authored tokens
 *   (meta.valueFirstToken / meta.valueSecondToken). But the canonical direction
 *   produced by resolveTranscriptDecisionModel is always relative to the
 *   ALPHABETICAL (canonical) pair order — because extractValuePair sorts the
 *   dimension names before returning pair.valueA / pair.valueB.
 *
 *   So for a B-first authored definition (e.g., Universalism authored first,
 *   Achievement authored second), extractValuePair returns:
 *     pair.valueA = "Achievement"   (alphabetical first)
 *     pair.valueB = "Universalism"
 *
 *   When the model picks Achievement, the decision model emits direction = "favor_first"
 *   (because favoredValueKey === pair.valueA = Achievement).
 *
 *   Then the resolver called assignOwnOpponent(universalism, achievement, favor_first):
 *     - canonicalOwnOpponent(universalism, achievement)[0] = "achievement"
 *     - valueFirstIsFirst = ("universalism" === "achievement") → false
 *     - favor_first + !valueFirstIsFirst → opponent_picked  ← WRONG
 *
 *   With canonical tokens (the fix), assignOwnOpponent(achievement, universalism, favor_first):
 *     - canonicalOwnOpponent(achievement, universalism)[0] = "achievement"
 *     - valueFirstIsFirst = ("achievement" === "achievement") → true
 *     - favor_first + valueFirstIsFirst=true → own_picked  ← CORRECT
 *
 * Result of the bug:
 *   B-first definitions always had their wins mis-tagged (own↔opponent swapped).
 *   computeDirectionBalancedPairWinRates averages the A-first rate and B-first rate.
 *   If A-first showed 100% for Achievement and B-first showed 0% (due to the swap),
 *   the result was avg(1.0, 0.0) = 0.5 — even when the model always picked Achievement.
 *   Every value pair appeared clustered at ~50%.
 */

import { describe, expect, it } from 'vitest';
import {
  type Observation,
  buildCellMetrics,
  computeDirectionBalancedPairWinRates,
} from '../../../src/services/pressure-sensitivity/aggregation.js';
import {
  assignOwnOpponent,
  type CanonicalDirection,
} from '../../../src/services/pressure-sensitivity/value-pair.js';

// Pair: Achievement (canonical/alphabetical first) vs Universalism (canonical second).
const ACHIEVEMENT = 'Achievement';
const UNIVERSALISM = 'Universalism';

// ─── Low-level: assignOwnOpponent with canonical vs authored tokens ────────────

describe('assignOwnOpponent — canonical-token argument order (post-fix behavior)', () => {
  // The canonical direction from resolveTranscriptDecisionModel is always relative
  // to pair.valueA = alphabetical first = Achievement. So favor_first always means
  // "Achievement was picked" regardless of authored order.

  it('A-first authored def: model picks Achievement (favor_first) → own_picked with canonical tokens', () => {
    // Canonical tokens = authored tokens for A-first defs — both cases agree.
    const outcome = assignOwnOpponent(ACHIEVEMENT, UNIVERSALISM, 'favor_first' as CanonicalDirection);
    expect(outcome).toBe('own_picked');
  });

  it('B-first authored def: model picks Achievement (favor_first from canonical pair) → own_picked with canonical tokens', () => {
    // The resolver now passes canonical tokens regardless of authored order.
    // favor_first means Achievement (pair.valueA) was picked.
    // With canonical tokens: achievement IS valueFirstToken → valueFirstIsFirst=true → own_picked.
    const outcome = assignOwnOpponent(ACHIEVEMENT, UNIVERSALISM, 'favor_first' as CanonicalDirection);
    expect(outcome).toBe('own_picked');
  });

  it('B-first authored def: model picks Achievement (favor_first) → opponent_picked with authored tokens (pre-fix bug)', () => {
    // This demonstrates the pre-fix bug.
    // With authored tokens for a B-first def: universalism is valueFirstToken.
    // valueFirstIsFirst = ("Universalism" === sort([Universalism,Achievement])[0]="Achievement") → false
    // favor_first + !valueFirstIsFirst → opponent_picked  ← wrong!
    const outcome = assignOwnOpponent(UNIVERSALISM, ACHIEVEMENT, 'favor_first' as CanonicalDirection);
    expect(outcome).toBe('opponent_picked'); // This is what the bug produced
  });

  it('model picks Universalism (favor_second with canonical pair) → opponent_picked', () => {
    // favor_second means Universalism (pair.valueB) was picked = Achievement loses.
    const outcome = assignOwnOpponent(ACHIEVEMENT, UNIVERSALISM, 'favor_second' as CanonicalDirection);
    expect(outcome).toBe('opponent_picked');
  });
});

// ─── End-to-end: full pipeline from outcomes to direction-balanced win rate ────

describe('computeDirectionBalancedPairWinRates — direction-balanced rate with canonical tagging', () => {
  /**
   * Scenario:
   *   The model ALWAYS picks Achievement (canonical first) regardless of authored direction.
   *
   *   def-a-first: authored Achievement-first. direction=favor_first. → own_picked (correct).
   *   def-b-first: authored Universalism-first. direction=favor_first (canonical pair sorts same).
   *                With canonical tokens → own_picked (correct, post-fix).
   *                With authored tokens → opponent_picked (the bug).
   *
   *   Expected direction-balanced win rate: ~1.0
   *   Buggy direction-balanced win rate:    ~0.5 (A-first = 1.0, B-first = 0.0, avg = 0.5)
   */

  function makeCell(
    key: string,
    obsMap: Record<string, Observation[]>,
  ): [string, { observationsByDefinition: Map<string, Observation[]> }] {
    return [key, { observationsByDefinition: new Map(Object.entries(obsMap)) }];
  }

  it('MUST FAIL before fix: model always picks canonical-first; both directions → rate ≈ 1.0', () => {
    // Post-fix: both A-first and B-first defs have their wins tagged as own_picked.
    const cells = new Map([
      makeCell('3::3', {
        // A-first authored def: model picks Achievement → canonical dir favor_first → own_picked
        'def-a-first': [
          { outcome: 'own_picked', strength: 'strong' },
          { outcome: 'own_picked', strength: 'strong' },
          { outcome: 'own_picked', strength: 'strong' },
        ],
        // B-first authored def: model picks Achievement → canonical dir favor_first → own_picked
        // (post-fix; pre-fix this was opponent_picked, which caused the ~50% symptom)
        'def-b-first': [
          { outcome: 'own_picked', strength: 'strong' },
          { outcome: 'own_picked', strength: 'strong' },
          { outcome: 'own_picked', strength: 'strong' },
        ],
      }),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def-a-first', 'def-b-first']),
      canonicalFirstValueToken: ACHIEVEMENT,
      authoredFirstTokenByDef: new Map([
        ['def-a-first', ACHIEVEMENT],   // A-first authored
        ['def-b-first', UNIVERSALISM],  // B-first authored
      ]),
      domainByDef: new Map([
        ['def-a-first', 'test-domain'],
        ['def-b-first', 'test-domain'],
      ]),
    });

    // Direction A (A-first defs): winRate = 3/3 = 1.0
    // Direction B (B-first defs): winRate = 3/3 = 1.0
    // direction-balanced rate = avg(1.0, 1.0) = 1.0
    expect(result.ownRate).toBeCloseTo(1.0, 10);
    expect(result.opponentRate).toBeCloseTo(0.0, 10);
  });

  it('demonstrates the pre-fix symptom: mislabeled B-first wins cancel to 0.5', () => {
    // Simulates what happened when authored tokens caused B-first wins to be tagged opponent_picked.
    // A-first defs: own_picked → winRate = 1.0 (correct)
    // B-first defs: opponent_picked (mis-tagged) → winRate = 0.0
    // direction-balanced = avg(1.0, 0.0) = 0.5  ← the clustered-at-50% symptom
    const cells = new Map([
      makeCell('3::3', {
        'def-a-first': [
          { outcome: 'own_picked', strength: 'strong' },
          { outcome: 'own_picked', strength: 'strong' },
          { outcome: 'own_picked', strength: 'strong' },
        ],
        // Mislabeled: model picked Achievement but tagged as opponent_picked (pre-fix bug)
        'def-b-first': [
          { outcome: 'opponent_picked', strength: 'strong' },
          { outcome: 'opponent_picked', strength: 'strong' },
          { outcome: 'opponent_picked', strength: 'strong' },
        ],
      }),
    ]);

    const result = computeDirectionBalancedPairWinRates({
      cells,
      definitionsMeasured: new Set(['def-a-first', 'def-b-first']),
      canonicalFirstValueToken: ACHIEVEMENT,
      authoredFirstTokenByDef: new Map([
        ['def-a-first', ACHIEVEMENT],
        ['def-b-first', UNIVERSALISM],
      ]),
      domainByDef: new Map([
        ['def-a-first', 'test-domain'],
        ['def-b-first', 'test-domain'],
      ]),
    });

    // Direction A: winRate = 1.0, Direction B: winRate = 0.0, avg = 0.5
    expect(result.ownRate).toBeCloseTo(0.5, 10);
  });
});

// ─── Unit: verify assignOwnOpponent produces own_picked consistently ──────────

describe('assignOwnOpponent — canonical direction is always canonical-pair-relative', () => {
  it('buildCellMetrics with all own_picked gives winRate = 1.0', () => {
    const observations: Observation[] = [
      { outcome: 'own_picked', strength: 'strong' },
      { outcome: 'own_picked', strength: 'strong' },
      { outcome: 'own_picked', strength: 'strong' },
    ];
    const metrics = buildCellMetrics(observations);
    expect(metrics.winRate).toBeCloseTo(1.0, 10);
  });

  it('favor_first always maps to own_picked when canonical tokens are passed', () => {
    // This is the core invariant: the resolver passes canonical tokens,
    // and direction=favor_first means canonical first was picked.
    expect(assignOwnOpponent(ACHIEVEMENT, UNIVERSALISM, 'favor_first' as CanonicalDirection)).toBe('own_picked');
    expect(assignOwnOpponent(ACHIEVEMENT, UNIVERSALISM, 'favor_second' as CanonicalDirection)).toBe('opponent_picked');
  });

  it('favor_first maps to opponent_picked when authored-B-first tokens are passed (the pre-fix bug)', () => {
    // With authored tokens for a B-first def, favor_first incorrectly means "canonical second picked".
    // This is what caused the ~50% clustering before the fix.
    expect(assignOwnOpponent(UNIVERSALISM, ACHIEVEMENT, 'favor_first' as CanonicalDirection)).toBe('opponent_picked');
  });
});
