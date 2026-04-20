---
reviewer: "claude-opus-4-5"
lens: "implementation-risk-judge"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/remove-decision-code/plan.md"
artifact_sha256: "15a9e6d05277f3252db61fa592482c5d7455749f9598d3b9f074a0bffa06707f"
repo_root: "."
git_head_sha: "fe2d375f349891708ea81efa9f6958fbcc592998"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "judge-panel"
resolution_status: "accepted"
resolution_note: "Four load-bearing ambiguities that would cause a competent implementer to pause or guess: (1) T5.3 explicitly invites adding scaleCodeFromCanonical to the CSV export, which directly contradicts FR-008's strict allowlist — an implementer ..."
raw_output_path: "docs/workflow/feature-runs/remove-decision-code/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-risk-judge

## Findings

Four load-bearing ambiguities that would cause a competent implementer to pause or guess: (1) T5.3 explicitly invites adding scaleCodeFromCanonical to the CSV export, which directly contradicts FR-008's strict allowlist — an implementer following the tasks mechanically would violate the invariant the feature was designed to enforce, with no warning at the task level. (2) T4.2 tells the implementer to grep for `resolveTranscriptDecisionModel` as the function to rewire, but every other artifact reference to the key function uses the name `resolveCanonicalDecision` in decision-model.ts — if these are different functions, the grep catches the wrong set of call sites and the rewire is incomplete. (3) W9 delegates importing from the API workspace to an 'existing cross-workspace tsx import pattern' but names no example script, forcing the implementer to spelunk before writing a single import. (4) The spec FR-007 specifies the mutation accepts {favoredValueKey, strength} as required fields, while plan W8 redesigns it to {decisionState, favoredValueKey?, strength?} — the plan supersedes the spec here but never says so explicitly, leaving an implementer who reads spec before plan uncertain which is authoritative. Risks (1) and (2) are the sharpest: (1) would produce a silent spec violation with no friction at the task level; (2) would produce missing rewires that survive the SC-001 grep because the grep pattern in T10.5 keys on the string 'decisionCode', not the function name.

## Residual Risks

- tasks :: Slice W5, T5.3 - If users need a scale number, add a `scaleCode` column derived via `scaleCodeFromCanonical` (optional; discuss with product if worth keeping).
- spec :: Functional Requirements FR-008 - It is ONLY callable from `cloud/scripts/job-choice-bridge-report-lib.ts` and its tests (documented in a JSDoc allowlist comment on the helper). Adding a new caller requires updating the allowlist, making future misuse visible in code review.
- tasks :: Slice W4, T4.2 - Update every call site that passes `decisionCode` into `resolveTranscriptDecisionModel` (grep `resolveTranscriptDecisionModel\(`).
- plan :: Architecture Decision A2 - the migration imports and calls the production `resolveCanonicalDecision` from `cloud/apps/api/src/graphql/queries/domain/decision-model.ts`
- plan :: Review Reconciliation (bottom) - LOW W9 workspace import path -> acknowledged; implementation will use the existing cross-workspace tsx import pattern used by other scripts (e.g. via @valuerank/api package alias or direct relative import).
- spec :: Functional Requirements FR-007 - The manual-override mutation MUST accept `{favoredValueKey, strength}` as required fields.
- plan :: Wave W8 - Change the mutation's GraphQL input type from `{decisionCode}` to `{decisionState, favoredValueKey?, strength?}`

## Verdict (structured)

```json
{
  "confidence": 3,
  "evidence": [
    {
      "artifact": "tasks",
      "quote": "If users need a scale number, add a `scaleCode` column derived via `scaleCodeFromCanonical` (optional; discuss with product if worth keeping).",
      "section": "Slice W5, T5.3"
    },
    {
      "artifact": "spec",
      "quote": "It is ONLY callable from `cloud/scripts/job-choice-bridge-report-lib.ts` and its tests (documented in a JSDoc allowlist comment on the helper). Adding a new caller requires updating the allowlist, making future misuse visible in code review.",
      "section": "Functional Requirements FR-008"
    },
    {
      "artifact": "tasks",
      "quote": "Update every call site that passes `decisionCode` into `resolveTranscriptDecisionModel` (grep `resolveTranscriptDecisionModel\\(`).",
      "section": "Slice W4, T4.2"
    },
    {
      "artifact": "plan",
      "quote": "the migration imports and calls the production `resolveCanonicalDecision` from `cloud/apps/api/src/graphql/queries/domain/decision-model.ts`",
      "section": "Architecture Decision A2"
    },
    {
      "artifact": "plan",
      "quote": "LOW W9 workspace import path -> acknowledged; implementation will use the existing cross-workspace tsx import pattern used by other scripts (e.g. via @valuerank/api package alias or direct relative import).",
      "section": "Review Reconciliation (bottom)"
    },
    {
      "artifact": "spec",
      "quote": "The manual-override mutation MUST accept `{favoredValueKey, strength}` as required fields.",
      "section": "Functional Requirements FR-007"
    },
    {
      "artifact": "plan",
      "quote": "Change the mutation's GraphQL input type from `{decisionCode}` to `{decisionState, favoredValueKey?, strength?}`",
      "section": "Wave W8"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-opus-4-5",
  "reasoning": "Four load-bearing ambiguities that would cause a competent implementer to pause or guess: (1) T5.3 explicitly invites adding scaleCodeFromCanonical to the CSV export, which directly contradicts FR-008's strict allowlist \u2014 an implementer following the tasks mechanically would violate the invariant the feature was designed to enforce, with no warning at the task level. (2) T4.2 tells the implementer to grep for `resolveTranscriptDecisionModel` as the function to rewire, but every other artifact reference to the key function uses the name `resolveCanonicalDecision` in decision-model.ts \u2014 if these are different functions, the grep catches the wrong set of call sites and the rewire is incomplete. (3) W9 delegates importing from the API workspace to an 'existing cross-workspace tsx import pattern' but names no example script, forcing the implementer to spelunk before writing a single import. (4) The spec FR-007 specifies the mutation accepts {favoredValueKey, strength} as required fields, while plan W8 redesigns it to {decisionState, favoredValueKey?, strength?} \u2014 the plan supersedes the spec here but never says so explicitly, leaving an implementer who reads spec before plan uncertain which is authoritative. Risks (1) and (2) are the sharpest: (1) would produce a silent spec violation with no friction at the task level; (2) would produce missing rewires that survive the SC-001 grep because the grep pattern in T10.5 keys on the string 'decisionCode', not the function name.",
  "timestamp": "2026-04-19T00:00:00Z",
  "verdict": "proceed-with-annotation"
}
```

## Resolution
- status: accepted
- note: Four load-bearing ambiguities that would cause a competent implementer to pause or guess: (1) T5.3 explicitly invites adding scaleCodeFromCanonical to the CSV export, which directly contradicts FR-008's strict allowlist — an implementer ...
