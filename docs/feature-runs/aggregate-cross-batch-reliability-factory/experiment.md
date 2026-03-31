# Experiment: Cross-Batch Reliability — Factory Adversarial Review

## Method
factory (spec + checkpoint adversarial review only; no implementation)

## Spec
Written by factory agent based on the bug prompt. Filed at `docs/feature-runs/aggregate-cross-batch-reliability/spec.md`.

## Adversarial Review Findings (from checkpoint)

### Gemini — requirements-adversarial
1. **(HIGH — actionable)** Flawed fallback: `if not reliability_samples` only fires when ALL batches are single-trial. Mixed aggregates (some within-run repeats, some not) silently ignore cross-batch signal from single-trial batches. Logic should always use pooled analysis.
2. **(MEDIUM — actionable)** Inefficient upfront compute: pooled variance computed before per-model loop even if never used. Should be deferred or eliminated.
3. **(MEDIUM — partially actionable)** Test plan contradictory: simultaneous "update" and "keep" instructions for the same test create ambiguity. Mixed-mode test case missing.
4. **(LOW — not actioned)** Spec focuses on 3-batch scenario; actual boundary is n=2. Tests should probe the true minimum.

### Gemini — edge-cases-adversarial
1. **(HIGH — same as above)** Hybrid scenarios silently under-report reliability. All-or-nothing fallback misses the common mixed case.
2. **(MEDIUM — same as above)** Inefficient upfront pooled compute.
3. **(MEDIUM — actionable)** Wrong trigger: `if not reliability_samples` is ambiguous — empty for "no repeats" OR for "repeats existed but yielded None". Should trigger on absence of repeated conditions, not absence of a result.
4. **(LOW — not actioned)** n=2 statistical validity: reliability from 2 data points is brittle; spec doesn't address minimum threshold.

### Codex — feasibility-adversarial
1. **(HIGH — same as finding 1 above)** Fallback only patches "no within-run repeats" case; mixed aggregates still broken.
2. **(HIGH — partially actioned)** `total_repeat_coverage_count` corrected but `repeat_coverage_share` computation not explicitly addressed. (Resolved: pooled approach makes this consistent automatically.)
3. **(MEDIUM — addressed in implementation)** Test plan internally inconsistent; easy to accidentally drop 2-batch regression coverage.
4. **(MEDIUM — not actioned as separate item)** Spec doesn't justify statistical equivalence of within-run vs cross-batch reliability signal.

## Actionable findings summary
- 3 high-severity findings (all pointing to same root issue: mixed-mode gap)
- 2 medium-severity findings acted on (trigger condition, efficiency)
- 2 medium-severity findings resolved as side-effects of the fix
- 2 low-severity findings not actioned

## Human Interruptions
1 (user approved actioning all findings after comparison table was presented)
