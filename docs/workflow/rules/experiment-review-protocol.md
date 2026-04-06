# Experiment Review Protocol

**Goal:** Determine whether adversarial reviews actually change the implementation, not whether AI agents agree on findings.

## The Measurement

At every adversarial review boundary in both paths:
1. Capture git SHA before the review
2. Run the review, apply any fixes
3. Capture git SHA after
4. Record: did the code change?

This is the ground truth proxy. A review that never changes code is overhead. A review that consistently changes code is earning its keep.

## Gemini Rate Limit

Run Gemini calls **serially** — never in parallel.
