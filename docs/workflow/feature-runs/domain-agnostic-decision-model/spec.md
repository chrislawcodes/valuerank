# Domain-Agnostic Decision Model

## Problem

The decision model pipeline (parsing, normalization, display) is hardcoded to job-choice domain assumptions in three places. This causes software-approach-choice transcripts to produce `favoredValueKey: null` and all-zero scores in analysis. Adding any future domain would require finding and updating scattered hardcoded lookup tables.

## Goals

1. Decision model resolves canonical decisions correctly for **any** paired domain using data already in the definition snapshot — no per-family lookup tables.
2. Template normalization in `paired-definition.ts` uses the domain's stored config instead of hardcoded defaults.
3. `TranscriptRow.tsx` displays label subjects correctly for any domain.
4. `assemble-template.ts` has no job-choice-specific defaults — callers must be explicit about `labelPrefix` and `sentencePrefix`.
5. Existing job-choice behavior is unchanged.

## Scope

### In scope

| File | Change |
|------|--------|
| `cloud/packages/shared/src/assemble-template.ts` | Remove `DEFAULT_LABEL_PREFIX`. Make `labelPrefix` a required param on `labelFromBody`. Keep `DEFAULT_SENTENCE_PREFIX` as a named constant but rename it. |
| `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` | Extract value statements + label prefix from definition snapshot instead of `VALUE_STATEMENTS_BY_FAMILY`. |
| `cloud/apps/api/src/utils/paired-definition.ts` | Pass `TemplateConfig` to `assembleTemplate` call, derived from `TEMPLATE_CONFIG_BY_FAMILY` or domain data. |
| `cloud/apps/web/src/components/runs/TranscriptRow.tsx` | Replace hardcoded `' taking the job with '` with dynamic label prefix extraction from scale labels. |
| `cloud/apps/web/src/components/domains/DomainSettingsPanel.tsx` | Update `labelFromBody` call for new signature. |
| `cloud/scripts/job-choice-transform.ts` | Update `labelFromBody` call for new signature. |
| Test files for decision-model, assemble-template | Add software-approach-choice test cases. |

### Out of scope

- Changing stored transcript data (caches self-heal via the unknown-cache-bypass already committed).
- Changing the Python workers (already domain-agnostic).
- Renaming `resolveJobChoiceValueKeyFromText` — the function is domain-agnostic now; rename is cosmetic churn.
- Exposing `sentencePrefix`/`labelPrefix` in GraphQL (separate plan).

## Acceptance Criteria

1. `resolveCanonicalDecision` produces correct `favoredValueKey`, `direction`, and `strength` for both job-choice and software-approach-choice transcripts using real prod transcript data.
2. `labelFromBody` requires an explicit `labelPrefix` parameter — no implicit job-choice default.
3. `TranscriptRow` extracts the value subject from any paired label format, not just "taking the job with".
4. `normalizePairedDefinitionContent` produces correct template text for software-approach-choice definitions.
5. All existing decision-model, assemble-template, and web tests pass.
6. New tests cover software-approach-choice cases for decision resolution and template assembly.

## Verification

- Test with real transcript data from both domains (job-choice and software-approach-choice) captured from prod.
- Preflight: lint + test + build for shared, api, web.
