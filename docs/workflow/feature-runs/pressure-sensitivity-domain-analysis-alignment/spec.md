# Spec: Pressure Sensitivity Domain Analysis Alignment

**Feature slug:** pressure-sensitivity-domain-analysis-alignment  
**Created:** 2026-05-01  
**Status:** draft  
**Path:** Feature Factory (`docs/workflow/feature-runs/pressure-sensitivity-domain-analysis-alignment/`)

---

## Background

The Pressure Sensitivity page is useful only if it measures pressure in a way that a researcher can compare to Domain Analysis. After review, the product rule is now clear:

- trials add evidence
- conditions are pooled first
- a condition result should not count more just because it has more trials

The current pressure report still mixes in trial-count weight in a few places. That makes the values hard to compare with Domain Analysis and can hide the real condition-level pattern.

This feature aligns the Pressure Sensitivity reports with the same weighting rule used by Domain Analysis, while keeping the pressure-specific views and wording.

---

## Discovery: Assumptions Carried In

Discovery is complete. The following decisions are carried into this spec:

1. **Domain Analysis is the reference rule.** Pressure Sensitivity should largely follow the same pooling logic and weighting style.
2. **Trials are evidence only.** More trials should make a condition estimate more stable, but should not give that condition extra weight in the final roll-up.
3. **Pooled conditions count once.** After trials are pooled into a condition result, that condition contributes once to the next summary level.
4. **Pressure Sensitivity stays pressure-specific.** We are not replacing the report with Domain Analysis. We are aligning the math and coverage rules so the reports are comparable.
5. **Direct rates are preferred over shortcuts.** When a value needs its own number, use the direct number from the API rather than inferring it from the other side.
6. **Existing pressure report sections remain.** The page still has the summary, pressure-by-value table, per-pair detail, cross-value map, directional breakdown, sanity check, and limitations panel. The math beneath them changes to match the intended rule.

---

## Product Goal

The Pressure Sensitivity page should answer one simple question:

**How does pressure change a condition, when each condition is counted once and trials only add evidence?**

The report should:

- keep the current pressure views
- use pooled condition results instead of trial-weighted roll-ups
- produce values that are broadly comparable to Domain Analysis
- make missing coverage obvious instead of guessing

---

## User Stories

### US-1 - Compare values on the same footing

As a researcher, I want the pressure tables to treat each pooled condition equally, so one condition does not outweigh another just because it has more trials.

**Acceptance scenarios:**

1. Given two conditions with different trial counts, when they are already pooled into condition results, then each condition counts once in the final roll-up.
2. Given a condition has many repeated trials, when I read the final report, then I do not see that condition treated as more important just because it has more repeated trials.
3. Given the same value appears in multiple pairings, when I compare the pressure report to Domain Analysis, then the numbers are directionally comparable because the weighting rule is the same.

### US-2 - Keep the pressure-by-value table honest

As a researcher, I want the Pressure Response by Value table to reflect pooled condition results, so the row values are not distorted by trial count.

**Acceptance scenarios:**

1. Given a value row in the table, when the row is computed, then the contributing pair summaries are averaged equally after pooling.
2. Given a pair has sparse data in some cells, when the row is computed, then those cells contribute through the pooled condition estimate, not by silently changing the pair weight.
3. Given a value row has no usable pooled condition data, when the table renders, then it shows `—` instead of a guessed number.

### US-3 - Keep direct pair numbers direct

As a researcher, I want each pair to use direct side-specific numbers, so the report does not guess the second side from the first.

**Acceptance scenarios:**

1. Given a pair is shown from the first value's perspective, when the table renders, then it uses the first value's direct pooled rates.
2. Given the same pair is shown from the second value's perspective, when the table renders, then it uses the second value's direct pooled rates.
3. Given a direct rate is missing, when the table renders, then the missing cell shows `—` with a clear reason.

### US-4 - Keep the rest of the report consistent

As a researcher, I want the other pressure report views to follow the same pooling rule, so the whole page tells one story.

**Acceptance scenarios:**

1. Given the cross-value map is shown, when I compare its colors to the detail table, then they come from the same pooled condition data.
2. Given the directional sanity check is shown, when I read its percentages, then they are based on pooled condition results and not extra trial weight.
3. Given the limitations panel is shown, when I read it, then it explains that condition-level pooling is the rule and that trial count only adds evidence.

---

## Edge Cases

- A condition with many trials does not get extra weight in the final roll-up.
- A condition with only one or two trials can help the pooled estimate, but it should not dominate the next summary level.
- A value row with only thin coverage shows `—` or an insufficient-coverage message instead of a guessed value.
- If the first-side and second-side direct rates disagree because the row is sparse, the report keeps the direct number for each side instead of mirroring one side from the other.
- If a pair has no usable pooled data, it stays visible only when the UI can explain why the number is missing.
- Existing empty-state and coverage warnings still apply when no rows or no models can be measured.

---

## Functional Requirements

- **FR-001:** The Pressure Sensitivity page MUST use the same condition-level pooling rule as Domain Analysis for final roll-ups.
- **FR-002:** Trials MUST contribute evidence to a condition result, but a condition result MUST count once in the next summary level regardless of how many trials it used.
- **FR-003:** The Pressure Response by Value table MUST compute each pair summary from pooled condition results, then average pair summaries equally for each value row. No final roll-up on the page may multiply a pooled condition result by its trial count.
- **FR-004:** The report MUST not infer a value's second-side number from the first-side number when a direct rate is available. If a direct side-specific rate exists, the UI MUST use it as-is.
- **FR-005:** The per-pair detail table MUST keep its direct rates and coverage counts readable, and missing values MUST render as `—` with a clear reason.
- **FR-006:** The cross-value map, directional breakdown, and sanity check MUST consume the same pooled condition data as the detail table.
- **FR-006a:** Any pressure view that shows missing or insufficient data MUST surface the same reason code or coverage note as the detail table when that reason is known. Generic “no data” copy is not enough when the backend already knows whether the issue is thin data, transcript cap, or a condition exclusion.
- **FR-007:** The pressure report MUST keep the current sections and route, but the math beneath those sections MUST follow the pooled-condition rule.
- **FR-008:** The UI copy for the page MUST say that trials add evidence and conditions are pooled first.
- **FR-009:** The limitations panel MUST explain that more trials improve stability, but do not make a condition more important in the final roll-up.
- **FR-010:** Coverage warnings and `—` states MUST appear when pooled condition data is too thin to support a number.
- **FR-010a:** The coverage area MUST distinguish `transcriptCapHit` from ordinary thin data and from pressure-condition exclusions. If a cap or exclusion count exists, the page MUST name it instead of burying it in a generic warning.

---

## Success Criteria

- **SC-001:** A researcher can explain the pressure report in one sentence: it pools conditions first, then compares pooled condition results.
- **SC-002:** The Pressure Response by Value table no longer looks trial-weighted.
- **SC-003:** Pressure values are broadly comparable to Domain Analysis because the weighting rule matches.
- **SC-004:** Direct first-side and second-side rates are shown without mirrored shortcuts.
- **SC-005:** The page still passes build and focused tests after the math changes.

---

## Non-Goals

- Changing the pressure page route.
- Removing the pressure report sections.
- Rewriting Domain Analysis.
- Adding new statistical tests or confidence machinery.
- Reworking the broader model picker or page layout unless a pressure section needs a small copy fix.
- Changing unrelated model groups work on this branch.

---

## Open Questions

None. The requested rule is clear enough to implement.

---

## Dependencies

- `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`
- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`
- `cloud/apps/api/src/graphql/types/pressure-sensitivity.ts`
- `cloud/apps/web/src/components/models/PressureResponseByValueTable.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityLimitations.tsx`
- `cloud/apps/web/src/components/models/pressureSensitivityFormatting.ts`
- `cloud/apps/web/src/pages/PressureSensitivity.tsx`

---

## Glossary

| Term | Meaning |
|---|---|
| Trial | One model answer to one condition. |
| Condition | One exact pressure cell inside a vignette. |
| Pooled condition result | The condition-level number after all trials in that condition are combined. |
| Roll-up | A summary that averages pooled condition results instead of raw trial counts. |
| Direct rate | The rate computed for the side being shown, not inferred from the other side. |
