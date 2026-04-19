---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/finding-2-graphql-tightening/spec.md"
artifact_sha256: "02ae6b0a69f773e124d37970c57275156411083e421975e4d1250121144d7606"
repo_root: "."
git_head_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
git_base_ref: "origin/main"
git_base_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/finding-2-graphql-tightening/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | ID | Finding | Evidence |
| --- | --- | --- | --- |
| **HIGH** | F-01 | The goal to eliminate the hand-typed `SetDomainSettingsMutationVariables` (FR-010) directly conflicts with a documented schema limitation. The provided code in `domains.ts` contains a comment explicitly stating that the GraphQL schema for this mutation's arguments is missing required fields (`defaultModelIds`, `sentencePrefix`, etc.), forcing the use of a richer, manual type. The spec does not address this schema gap, making the requirement to eliminate the manual type infeasible without out-of-scope schema changes. | `[CODE-CONFIRMED]` |
| MEDIUM | F-02 | The spec defers the cleanup of `runs.ts` by allowlisting it (FR-013), but understates the complexity and scale of the technical debt within that file. The provided `runs.ts` context file reveals dozens of complex, hand-maintained types (e.g., `Run`, `Transcript`, `RunConfig`), many of which are required due to the use of JSON scalars. This represents a much larger and more entangled problem than the one being solved in `domains.ts`, and framing it as a simple, named follow-up (`finding-3-runs-operations-cleanup`) creates a risk that a significant architectural issue is being minimized and perpetually deferred. | `[CODE-CONFIRMED]` |
| MEDIUM | F-03 | The proposed design for the ESLint rule (FR-011) is highly complex, requiring semantic analysis that cross-references `generated/graphql.ts` to detect "meaningful overlap" in type definitions. This approach is significantly more complex than a simple AST pattern match, making the assumption of a "~150 lines" implementation optimistic. There is a risk of unforeseen implementation effort, maintenance burden, and performance issues for what should be a straightforward linting rule. | `[UNVERIFIED]` |
| LOW | F-04 | The plan to remove generic result wrappers like `DomainMutationResult` and various `...QueryResult` types (FR-010) may be an oversimplification. These generic types may be hiding subtle differences between the actual return shapes of various underlying mutations and queries. Replacing a single, shared hand-typed alias at multiple call sites may require more than a simple type replacement; each call site might need to be adapted to a unique, more specific generated type, increasing the refactoring effort. | `[UNVERIFIED]` |

## Residual Risks

| ID | Risk | Mitigation / Context |
| --- | --- | --- |
| RR-01 | **Pattern Proliferation**: The creation of `narrowings.ts` (FR-015) for the `estimateConfidence` field is a pragmatic workaround, but it establishes a sanctioned pattern for patching perceived schema gaps on the client. This creates a risk that this file becomes a new dumping ground for manual type manipulation, slowly re-introducing the original problem of schema/client drift in a new location. |
| RR-02 | **Allowlist Stagnation**: The ESLint rule allowlist is a necessary tool for scoping, but the `TODO` comments for `runs.ts` and `domainAnalysis.ts` are unenforceable. There is a high likelihood that these entries become permanent fixtures in the configuration, allowing significant technical debt to persist indefinitely without a formal mechanism to ensure the follow-up work is tracked and prioritized. |
| RR-03 | **Toolchain Fragility**: The workflow depends on developers manually running the `codegen` script after modifying `.graphql` files. While `npm run verify` may bundle this, it's a common failure point. A developer could commit changes to queries without the corresponding generated type updates, leading to a broken build or confusing type errors for others. The ESLint rule may not catch this specific failure mode. |

## Token Stats

- total_input=24526
- total_output=828
- total_tokens=28613
- `gemini-2.5-pro`: input=24526, output=828, total=28613

## Resolution
- status: open
- note: