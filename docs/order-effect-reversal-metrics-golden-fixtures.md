# Order Effect Reversal Metrics Golden Fixtures

This document contains small hand-worked examples that should remain true during implementation.

These are not a replacement for automated tests.
They are the human-readable truth set for debugging and review.

Use these examples when:

- a metric output looks surprising
- cache behavior seems correct but numbers look wrong
- raw vs normalized interpretation is in doubt

---

## 1. Stable-Side Classification

### Example A: Clear lean_high

`consideredTrials = [4, 3, 4]`

- `> 3` count = 2
- `< 3` count = 0
- denominator = 3
- `2/3 > 50%`

Expected:

- stable side = `lean_high`
- eligible

### Example B: Unstable

`consideredTrials = [4, 3, 3, 4]`

- `> 3` count = 2
- `< 3` count = 0
- denominator = 4
- `2/4` is not greater than `50%`

Expected:

- stable side = `unstable`
- excluded

### Example C: Resolved disputed case

`consideredTrials = [4, 2, 4]`

- `> 3` count = 2
- `< 3` count = 1
- denominator = 3
- `2/3 > 50%`

Expected:

- stable side = `lean_high`
- eligible

### Example D: Polarized / excluded

`consideredTrials = [5, 5, 1, 1, 3]`

- `> 3` count = 2
- `< 3` count = 2
- midpoint count = 1

Expected:

- stable side = `unstable`
- excluded

### Example D2: Neutral-heavy but non-midpoint score does not rescue eligibility

`consideredTrials = [1, 3, 3, 3, 2]`

- `< 3` count = 2
- `> 3` count = 0
- midpoint count = 3
- stable-side denominator = 5
- `2/5` is not greater than `50%`

Expected:

- stable side = `unstable`
- excluded from reversal denominators even if another scoring rule might produce a non-midpoint canonical score

---

## 2. Trimming Alignment

### Example E: Trimmed inner slice

Selected trials: `[1, 5, 3, 4, 4]`

Sorted: `[1, 3, 4, 4, 5]`

With `trimOutliers=true`, inner slice:

- `consideredTrials = [3, 4, 4]`

Expected:

- canonical score computed from `[3,4,4]`
- stability computed from `[3,4,4]`
- disagreement computed from `[3,4,4]`
- margins computed from `[3,4,4]`
- stable side = `lean_high`

---

## 3. Reversal Logic

### Example F: Reversal from stable-side change

Baseline `consideredTrials = [2, 2, 3]`

- baseline stable side = `lean_low`
- baseline canonical score = `2`

Variant `consideredTrials = [4, 4, 3]`

- variant stable side = `lean_high`
- variant canonical score = `4`

Expected:

- reversal = `true`

### Example G: Not a reversal

Baseline `consideredTrials = [4, 3, 4]`

- baseline stable side = `lean_high`
- baseline canonical score = `4`

Variant `consideredTrials = [4, 4, 4]`

- variant stable side = `lean_high`
- variant canonical score = `4`

Expected:

- reversal = `false`

### Example H: Excluded

Baseline `consideredTrials = [3, 3, 4]`

- baseline stable side = `unstable`
- baseline canonical score = `3`

Variant `consideredTrials = [5, 5, 5]`

- variant stable side = `lean_high`
- variant canonical score = `5`

Expected:

- excluded
- not counted in reversal denominator

---

## 4. Value-Order Pull

### Example I: Toward second-listed

Eligible pair drifts: `+1, +2, -1`

- non-zero eligible pairs = 3
- positive share = `2/3`

Expected:

- `valueOrderPull = toward second-listed`

Reason:

- baseline presents Attribute A first
- `presentation_flipped` presents Attribute B first
- positive normalized `pairDrift = variant - baseline` means the score moved toward the option that became first-listed in the flipped prompt, which is the second-listed option from the baseline prompt

### Example J: No clear pull (below minimum)

Eligible pair drifts: `+1, +1`

Expected:

- `valueOrderPull = no clear pull`

Reason:

- fewer than 3 non-zero eligible pairs

### Example K: No clear pull (all zero)

Eligible pair drifts: `0, 0, 0`

Expected:

- `valueOrderPull = no clear pull`

---

## 5. Scale-Order Pull: Raw vs Normalized Divergence

### Example L: No reversal, but toward lower numbers

Baseline raw decisions on `S_A`: `[4, 4, 4]`

- raw baseline score = `4`
- normalized baseline score = `4`
- stable side = `lean_high`

Scale-flipped raw decisions on `S_B`: `[2, 2, 2]`

- raw variant score = `2`
- normalized variant score = `4` after inversion
- stable side = `lean_high`

Therefore:

- no reversal
- raw pair drift = `2 - 4 = -2`

Expected:

- `scaleOrderPull = toward lower numbers`

This is the key example proving that:

- normalized preference direction can stay the same
- while raw visible-number attraction still has a direction

---

## 6. Match-Rate Direction Modes

### Example M: Both modes say non-match

Baseline canonical score = `4`
Fully-flipped canonical score = `2`

Expected:

- `directionOnly=true` => non-match
- `directionOnly=false` => non-match

### Example N: Direction-only match, exact-score non-match

Baseline canonical score = `4`
Fully-flipped canonical score = `5`

Expected:

- `directionOnly=true` => match because both canonical scores are `> 3`
- `directionOnly=false` => non-match because `4 !== 5`

---

## 7. Within-Cell Disagreement

### Example O: Midpoints count as disagreement

`consideredTrials = [4, 4, 3, 3, 2]`

- `> 3` count = 2
- `< 3` count = 1
- midpoint count = 2
- majority side bucket = `> 3`
- disagreement count = midpoint `2` + opposite-side `1` = `3`

Expected:

- cell disagreement rate = `3/5 = 0.6`

### Example P: Tied side buckets means full disagreement

`consideredTrials = [2, 2, 4, 4]`

- `> 3` count = 2
- `< 3` count = 2
- side buckets are tied

Expected:

- cell disagreement rate = `1.0`

### Example Q: Model-level disagreement is a simple mean

Cell rates:

- cell 1 = `0.6`
- cell 2 = `1.0`

Expected:

- `withinCellDisagreementRate = (0.6 + 1.0) / 2 = 0.8`

---

## 8. Pair-Level Margin Summary

### Example R: Limiting margin summary

Eligible pairs with canonical scores:

- pair 1: baseline `4`, variant `5` => margins `1` and `2` => limiting margin `1`
- pair 2: baseline `5`, variant `4` => margins `2` and `1` => limiting margin `1`
- pair 3: baseline `5`, variant `5` => margins `2` and `2` => limiting margin `2`

Expected limiting margins:

- `[1, 1, 2]`

Expected summary:

- mean = `4/3`
- median = `1`
- p25 = `1`
- p75 = `2`

---

## 9. All-Pairs-Excluded Model

### Example S: No eligible value-order pairs

If every value-order pair is excluded, expected model metrics are:

- `valueOrderReversalRate = null`
- `valueOrderEligibleCount = 0`
- `valueOrderPull = no clear pull`

Same logic applies to scale-order metrics when all scale-order pairs are excluded.

---

## 10. Match-Rate Regression Anchor

### Example T: Capture current fully-flipped legacy output before refactor

Before replacing resolver-local match aggregation, record one concrete seeded fixture from the existing implementation and preserve it as a regression anchor in tests.

Expected:

- do not rely on the phrase "same as before" without a concrete seeded fixture
- use that fixture to prove the refactored backend `matchRate` stays backward-compatible
