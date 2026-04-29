# Pressure Response Cell-Selection Sensitivity Check

**Feature slug:** sensitivity-table-redesign-v2
**Validated:** 2026-04-29

## Purpose

The v2 Pressure Sensitivity headline uses a directional pool rather than the v1 high-band pool. This check compares three plausible cell-selection rules to confirm the default rule is stable enough for the report headline.

## Rules Tested

| Rule | Selection |
|---|---|
| Strict | own = full, opponent in {negligible, low}; 2 cells per side |
| Default | own in {heavy, full}, opponent in {negligible, low, moderate}; 6 cells per side |
| Loose | own > opponent AND own >= moderate AND opponent <= moderate; up to 10 cells per side |

## Findings

- Most pairs with substantial response (|response| > 15 pp under default) agreed on direction across the plausible rules, but the strict rule can collapse some default-substantial pairs to 0 pp. Magnitude varied within about 20 pp for most sampled pairs.
- 2 of 10 pairs (`power_dominance -> stimulation`, `security_personal -> stimulation` for Gemini 2.5 Pro) flipped sign across rules. Both had |response| < 10 pp under default, so they sit at the noise floor.
- Default is the middle ground; strict tends most extreme; loose pulls toward the center but not consistently.

## Conclusion

Default is defensible as a middle-ground headline rule, but the sensitivity check is not proof of corpus-wide stability. Pairs near zero and pairs whose sign or magnitude changes sharply across plausible rules should be treated as uncertain.

## Raw Data

| Model | Pair | Strict | Default | Loose |
|---|---|---:|---:|---:|
| Mistral Small | conformity_interpersonal -> hedonism | -20.0 pp | -13.3 pp | -11.2 pp |
| Mistral Small | self_direction_action -> universalism_nature | +0.0 pp | -20.4 pp | -15.3 pp |
| Mistral Small | achievement -> stimulation | +20.0 pp | +6.7 pp | +17.5 pp |
| Grok 4 | benevolence_dependability -> stimulation | +20.0 pp | +16.7 pp | +5.0 pp |
| Grok 4 | achievement -> stimulation | +15.0 pp | +21.7 pp | +17.5 pp |
| Grok 4 | hedonism -> stimulation | +25.0 pp | +35.0 pp | +35.0 pp |
| Gemini 2.5 Pro | power_dominance -> stimulation | +20.0 pp | +0.0 pp | -1.3 pp |
| Gemini 2.5 Pro | security_personal -> stimulation | -25.0 pp | -6.7 pp | +7.5 pp |
| Mistral Large (Dec 2025) | achievement -> hedonism | -66.7 pp | -61.1 pp | -45.8 pp |
| Mistral Large (Dec 2025) | security_personal -> self_direction_action | +10.0 pp | +21.3 pp | +28.0 pp |
