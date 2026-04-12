# Adversarial Reviews — PR 3 Implementation

## Codex Review

Verified all consumer imports for runs.ts (the highest-risk file with 48 consumers):
- All imported symbols confirmed present in shim: RunStatus, RunCategory, Run, Transcript, RunConfig, TranscriptDecisionModelV2, StartRunInput, and all query/mutation constants
- Zero gql templates remaining in runs.ts and definitions.ts
- All 3 .graphql files exist

## Gemini Review: 4 PASS, 1 FAIL

| # | Question | Verdict |
|---|----------|---------|
| 1 | RunStatus manual type (7 values vs schema's 5) | **PASS** — consumers use all 7 values; generated enum would break them |
| 2 | RunConfig manual type for JSON field | **PASS** — consumers access `run.config.models`, `run.config.temperature`; `unknown` would break them |
| 3 | DefinitionContent manual type for JSON field | **PASS** — consumers access `definition.content.dimensions[0].levels`; `unknown` would break them |
| 4 | domains.ts has 1 remaining gql template | **FAIL** — backfillDomainEvaluationModels mutation not in schema, can't be in .graphql. Known limitation. |
| 5 | Structural incompatibility | **PASS** — mismatches are intentional and necessary (JSON→rich types, missing schema fields, tighter nullability) |

### Resolution for Gemini FAIL #4
The `backfillDomainEvaluationModels` mutation is not yet in the GraphQL schema (it's added via Pothos builder but not exported to the SDL snapshot). The gql template must remain manual until the schema is refreshed. This is documented in the shim with a comment.
