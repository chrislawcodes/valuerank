# Slice 1 — Backend Math Utilities

## Context
Implementing Wave 1 of `forest-plot-pairwise-drawer`. This slice ONLY adds backend math utilities and unit tests. NO resolver, schema, or frontend changes in this slice.

Read these files for context before editing:
- `/Users/chrislaw/valuerank/.claude/worktrees/unruffled-thompson-930258/docs/workflow/feature-runs/forest-plot-pairwise-drawer/spec.md` (FR-010, FR-011, SC-005, SC-006)
- `/Users/chrislaw/valuerank/.claude/worktrees/unruffled-thompson-930258/docs/workflow/feature-runs/forest-plot-pairwise-drawer/plan.md` (Slice 1 section)
- `/Users/chrislaw/valuerank/.claude/worktrees/unruffled-thompson-930258/cloud/apps/api/src/utils/pairwise-math.ts` (existing utility file you will extend)

## Files to create or edit

### NEW: `cloud/apps/api/src/utils/binomial-ci.ts`

Export exactly one function:

```ts
/**
 * Wilson score interval for a binomial proportion at 95% confidence (z = 1.96).
 * Returns [low, high] both clamped to [0, 1], or null if n === 0.
 *
 * Standard formula:
 *   p_hat = successes / n
 *   denom = 1 + z^2 / n
 *   center = (p_hat + z^2 / (2n)) / denom
 *   margin = (z / denom) * sqrt(p_hat * (1 - p_hat) / n + z^2 / (4 * n^2))
 *   low = center - margin
 *   high = center + margin
 */
export function wilsonCI95(successes: number, n: number): [number, number] | null;
```

Constants: `Z = 1.959963984540054` (standard 95% z; you may also use `1.96` for simplicity — match whichever makes the test below pass).

Edge cases:
- `n === 0` → `null`
- `successes === 0` → low = 0; compute high normally
- `successes === n` → high = 1; compute low normally
- Otherwise → standard formula
- Always clamp final bounds to `[0, 1]`

### NEW: `cloud/apps/api/tests/utils/binomial-ci.test.ts`

Use the existing test runner (vitest, based on the workspace setup). Cover these cases:

- `wilsonCI95(0, 0)` returns `null`
- `wilsonCI95(0, 100)` returns `[0, x]` where `x` is small (e.g. < 0.05)
- `wilsonCI95(100, 100)` returns `[x, 1]` where `x` is high (e.g. > 0.95)
- `wilsonCI95(50, 100)` returns `[low, high]` straddling 0.5 with `low ≈ 0.402`, `high ≈ 0.598` (within ±0.01 of standard reference)
- **Reference test**: `wilsonCI95(80, 125)` returns `[low, high]` with `low ≈ 0.553` and `high ≈ 0.716` (within ±0.005). This is SC-002 / spec acceptance criterion.

### EXTEND: `cloud/apps/api/src/utils/pairwise-math.ts`

Add ONE new exported function. Do NOT change existing functions or their signatures. The existing file already has `computePairwiseWinRate`; place `computeISquared` after it.

```ts
/**
 * I² heterogeneity index for a set of per-vignette win-rate estimates.
 * Returns a number in [0, 100], or null when fewer than 2 valid estimates remain after filtering.
 *
 * Algorithm (per spec FR-011):
 *   1. Filter out any input where totalTrials === 0 OR winRate === null
 *   2. If fewer than 2 valid estimates remain, return null
 *   3. For each estimate i:
 *        vi = max(p_i * (1 - p_i) / n_i, EPSILON)  with EPSILON = 1e-6
 *        wi = 1 / vi
 *   4. ybar_w = sum(wi * p_i) / sum(wi)
 *   5. Q = sum(wi * (p_i - ybar_w)^2)
 *   6. df = k - 1  where k = number of valid estimates
 *   7. If Q === 0 return 0
 *   8. Return max(0, (Q - df) / Q) * 100
 */
export function computeISquared(
  estimates: Array<{ winRate: number | null; totalTrials: number }>,
): number | null;
```

EPSILON constant should be defined as a module-local `const EPSILON = 1e-6;`.

### EXTEND: `cloud/apps/api/tests/utils/pairwise-math.test.ts`

If this file does not yet exist, create it. Add tests for `computeISquared`:

- `computeISquared([])` → `null`
- `computeISquared([{ winRate: 0.5, totalTrials: 100 }])` → `null` (k=1)
- `computeISquared([{ winRate: null, totalTrials: 100 }, { winRate: null, totalTrials: 100 }])` → `null` (all filtered out)
- `computeISquared([{ winRate: 0.5, totalTrials: 100 }, { winRate: 0.5, totalTrials: 100 }])` → `0` (identical)
- `computeISquared([{ winRate: 0.1, totalTrials: 100 }, { winRate: 0.9, totalTrials: 100 }])` → some value > 50 (high heterogeneity)
- `computeISquared([{ winRate: 0.0, totalTrials: 100 }, { winRate: 1.0, totalTrials: 100 }])` should NOT throw (epsilon-clamp protects against p*(1-p) = 0)

If `pairwise-math.test.ts` already has tests, ADD to the existing file rather than overwriting it.

## DO NOT MODIFY

- `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `.gitignore`
- Any file outside the four files listed above
- Any GraphQL schema, resolver, frontend file
- The existing `computePairwiseWinRate` function — leave its signature and behavior untouched
- If you think another file needs updating, note it in your output but do not write it.

## Verification

Run all of these from `cloud/` and report results:

1. `npx turbo lint --filter=@valuerank/api`
2. `npx turbo test --filter=@valuerank/api`
3. `npx turbo build --filter=@valuerank/api`

All three MUST pass with no errors and no `@ts-ignore` directives.

## Output

After implementation, print a one-line summary of what changed and confirm the verification commands all pass. Do not commit — Sonnet will do that after reviewing the diff.
