# Plan: Domain-Agnostic Decision Model

## Architecture Decisions

### D1: Extract config from definition snapshot, not family lookup tables

The current `VALUE_STATEMENTS_BY_FAMILY` approach requires code changes for each new domain. Instead:

- **Value statements:** Build from `definitionSnapshot.components.value_first` and `value_second` — the two value bodies are right there.
- **Label prefix:** Parse from the scale labels in the definition snapshot's template. The template contains lines like `"- Strongly support choosing the approach relating to ..."` — extract the prefix by stripping the strength phrase and the value body portion.

This means zero code changes when a new domain is added.

### D2: Make labelPrefix required on labelFromBody

Remove `DEFAULT_LABEL_PREFIX` constant. Change `labelFromBody(body, labelPrefix?)` to `labelFromBody(body, labelPrefix)` (required string). All callers must be explicit. TypeScript enforces this at compile time.

`DEFAULT_SENTENCE_PREFIX` stays but is renamed to make it clear it's not universal.

### D3: TranscriptRow uses scale labels directly

Instead of hardcoding `' taking the job with '`, extract the label prefix from the actual `scaleLabels` in `decisionMetadata`. The scale labels already contain the domain-correct text. Parse the prefix from the first non-neutral label.

---

## Wave Breakdown

### Wave 1: Shared foundation (assemble-template.ts)

Remove `DEFAULT_LABEL_PREFIX`. Make `labelPrefix` required. Rename `DEFAULT_SENTENCE_PREFIX` → keep for backward compat but add comment.

Update all callers:
- `assembleTemplate` internal call — already receives `config?.labelPrefix`, just needs to pass it through (will need a fallback for when config isn't provided, since assembleTemplate is called without config in some places).
- `DomainSettingsPanel.tsx` — already passes prefix explicitly.
- `job-choice-transform.ts` script — pass explicit prefix.

**Risk:** Breaking callers that rely on the default. Mitigated by TypeScript catching missing args at build time.

### Wave 2: Decision model (decision-model.ts)

Replace `VALUE_STATEMENTS_BY_FAMILY` with snapshot-based extraction:
1. Extract `components.value_first` and `components.value_second` from definition snapshot → build `ValueStatementEntry[]`.
2. Extract label prefix from template's scale labels.
3. Pass both to `resolveDecisionModel`.

**Risk:** Edge cases where snapshot doesn't have components (old non-paired transcripts). Mitigated by falling back to existing behavior when components are absent.

### Wave 3: Template normalization (paired-definition.ts)

Add `TEMPLATE_CONFIG_BY_FAMILY` lookup for `sentencePrefix` and `labelPrefix`. Pass to `assembleTemplate` call at line 74.

Note: this is the one place where a per-family lookup is acceptable — normalization runs without a DB connection, so it can't query the domain table. The lookup table stays small (just prefix strings) and is easy to extend.

### Wave 4: TranscriptRow display (TranscriptRow.tsx)

Replace hardcoded `' taking the job with '` and `' taking '` with dynamic extraction:
1. From the `scaleLabels` in `decisionMetadata`, find a non-neutral label.
2. Extract the prefix between the strength word ("Strongly support" / "Somewhat support") and the value body text.
3. Use that prefix for subject extraction.

Fallback: if prefix can't be determined, show `"${score} - ${shortDirection} ${primaryDimKey}"` (current fallback behavior).

### Wave 5: Tests and verification

- Add software-approach-choice test cases to `decision-model.test.ts`.
- Add test case to `assemble-template.test.ts` verifying required labelPrefix.
- Test against real transcript data from both domains.

---

## Files Touched

| Wave | File | What |
|------|------|------|
| 1 | `cloud/packages/shared/src/assemble-template.ts` | Remove DEFAULT_LABEL_PREFIX, make labelPrefix required |
| 1 | `cloud/apps/web/src/components/domains/DomainSettingsPanel.tsx` | Update labelFromBody call |
| 1 | `cloud/scripts/job-choice-transform.ts` | Update labelFromBody call |
| 2 | `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` | Snapshot-based config extraction |
| 3 | `cloud/apps/api/src/utils/paired-definition.ts` | Add TEMPLATE_CONFIG_BY_FAMILY, pass to assembleTemplate |
| 4 | `cloud/apps/web/src/components/runs/TranscriptRow.tsx` | Dynamic label prefix extraction |
| 5 | `cloud/apps/api/tests/graphql/queries/decision-model.test.ts` | Software-approach-choice test cases |
| 5 | `cloud/packages/shared/tests/assemble-template.test.ts` | Required labelPrefix test |

## Risks

- **Backward compat:** Old transcripts without `components` in snapshot → fall back gracefully to existing behavior.
- **Edge case in label prefix extraction:** If scale labels use an unexpected format → fall back to unknown decision (same as today).
- **paired-definition.ts lookup table:** Still per-family, but only for prefix strings (not value statement arrays). Acceptable since normalization has no DB access.
