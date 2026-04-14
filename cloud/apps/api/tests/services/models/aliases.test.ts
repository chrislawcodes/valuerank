/**
 * Unit tests for services/models/aliases.ts
 *
 * Exercises `resolveModelIdFromAvailable` and `getEquivalentModelIds` as pure
 * functions. This file replaces the alias-resolution coverage that was
 * previously embedded in plan-final-trial.test.ts — that test is deleted in
 * Slice B of the remove-final-trial-sampler feature run.
 *
 * Spec: docs/workflow/feature-runs/remove-final-trial-sampler/spec.md §3.7
 * Plan: docs/workflow/feature-runs/remove-final-trial-sampler/plan.md §2
 */

import { describe, it, expect } from 'vitest';
import {
  getEquivalentModelIds,
  resolveModelIdFromAvailable,
} from '../../../src/services/models/aliases.js';

/**
 * Hardcoded expected value for the gemini-2.5-flash alias group.
 *
 * This is a DELIBERATE DUPLICATION of the group in
 * cloud/apps/api/src/services/models/aliases.ts. Deriving the expected value
 * from aliases.ts at test time would be circular — a bad edit to the alias
 * table would update both sides and the test would still pass.
 *
 * If a legitimate alias update changes this group, update the constant below
 * in the same commit. The coupling is the feature, not a bug: it forces the
 * alias table edit to be intentional rather than accidental.
 */
const EXPECTED_GEMINI_FLASH_GROUP = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-preview-09-2025',
  'gemini-2.5-flash-preview-05-20',
];

describe('resolveModelIdFromAvailable', () => {
  it('returns the exact match when requested model is directly available', () => {
    const available = new Set(['gemini-2.5-flash', 'gpt-4.1']);
    expect(resolveModelIdFromAvailable('gemini-2.5-flash', available)).toBe(
      'gemini-2.5-flash'
    );
  });

  it('returns the first available equivalent when the exact model is not available but an alias is', () => {
    // The production adapter treats all three gemini-2.5-flash variants as
    // equivalent. If only the preview variant is available, a request for the
    // canonical id must resolve to the preview variant.
    const available = new Set(['gemini-2.5-flash-preview-09-2025']);
    expect(resolveModelIdFromAvailable('gemini-2.5-flash', available)).toBe(
      'gemini-2.5-flash-preview-09-2025'
    );
  });

  it('returns null when neither exact nor alias match exists in the available set', () => {
    const available = new Set(['gpt-4.1']);
    expect(resolveModelIdFromAvailable('unknown-model', available)).toBeNull();
  });
});

describe('getEquivalentModelIds', () => {
  it('returns the exact gemini-2.5-flash alias group (no extras, no missing members)', () => {
    const result = getEquivalentModelIds('gemini-2.5-flash');

    // Set equality catches both regressions that a "contains all" check would
    // miss: (a) an unexpected extra alias, and (b) a dropped expected alias.
    expect(new Set(result)).toEqual(new Set(EXPECTED_GEMINI_FLASH_GROUP));
    // Explicit length assertion catches duplicates in the alias table.
    expect(result.length).toBe(EXPECTED_GEMINI_FLASH_GROUP.length);
  });

  it('returns the singleton [input] for a model with no known aliases', () => {
    expect(getEquivalentModelIds('unknown-model')).toEqual(['unknown-model']);
  });
});
