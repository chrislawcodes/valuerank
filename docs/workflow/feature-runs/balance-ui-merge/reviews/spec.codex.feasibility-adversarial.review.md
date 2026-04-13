---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/balance-ui-merge/spec.md"
artifact_sha256: "e0ee625d3615608b854ad5892b61dbd44652ba4241c3c5106458c66eb90ebe9e"
repo_root: "."
git_head_sha: "489849cbced674725c5f8ada21de706c3bc0f223"
git_base_ref: "origin/main"
git_base_sha: "489849cbced674725c5f8ada21de706c3bc0f223"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH: valid — codegen step added to tasks.md Slice 2 (run npm run codegen after fragment change, commit graphql.ts). MEDIUM: valid — null balance case added to tasks.md Slice 1 (no sync log when setting balance to null). Residual risks noted and deferred per spec."
raw_output_path: "docs/workflow/feature-runs/balance-ui-merge/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- HIGH [CODE-CONFIRMED] The spec omits the generated web GraphQL artifact, but the web workspace verifies that file in CI. `cloud/apps/web/package.json` runs `codegen` and then fails if `src/generated/graphql.ts` differs, and that generated file still includes `lastSyncedAt`. Removing the field from the hand-written fragment in [cloud/apps/web/src/api/operations/llm.ts](/Users/chrislaw/valuerank/.claude/worktrees/adoring-wilbur/cloud/apps/web/src/api/operations/llm.ts) without updating [cloud/apps/web/src/generated/graphql.ts](/Users/chrislaw/valuerank/.claude/worktrees/adoring-wilbur/cloud/apps/web/src/generated/graphql.ts) will break the repo’s own `verify` gate. Evidence: [cloud/apps/web/package.json](/Users/chrislaw/valuerank/.claude/worktrees/adoring-wilbur/cloud/apps/web/package.json), [cloud/apps/web/src/generated/graphql.ts](/Users/chrislaw/valuerank/.claude/worktrees/adoring-wilbur/cloud/apps/web/src/generated/graphql.ts), [cloud/apps/web/src/api/operations/llm.ts](/Users/chrislaw/valuerank/.claude/worktrees/adoring-wilbur/cloud/apps/web/src/api/operations/llm.ts).

- MEDIUM [CODE-CONFIRMED] The spec does not define how to log a balance clear to `null`, even though the current UI and mutation both allow it. [cloud/apps/web/src/components/settings/models/ProviderSettingsModal.tsx](/Users/chrislaw/valuerank/.claude/worktrees/adoring-wilbur/cloud/apps/web/src/components/settings/models/ProviderSettingsModal.tsx) lets the user submit an empty balance, and [cloud/apps/api/src/graphql/mutations/llm.ts](/Users/chrislaw/valuerank/.claude/worktrees/adoring-wilbur/cloud/apps/api/src/graphql/mutations/llm.ts) accepts `balance: null`, but [cloud/apps/api/src/graphql/types/llm-provider.ts](/Users/chrislaw/valuerank/.claude/worktrees/adoring-wilbur/cloud/apps/api/src/graphql/types/llm-provider.ts) shows `ProviderBalanceSyncLog` only stores numeric `systemBalanceAtSync`, `enteredBalance`, and `delta`. If the new rule is “log every balance change,” the null path has no valid delta payload and will either need a special case or will produce a bad record.

## Residual Risks

- The backend keeps `syncProviderBalance` for backward compatibility, so any older client or script can still create sync logs with the old flow. That is intentional, but it means the API semantics are not fully unified.

- The provider settings save path still uses two separate mutations in the UI. If `updateLlmProvider` succeeds and `setProviderBalance` fails, the provider ends up partially updated. The spec calls this out as a deferred limitation, but the consistency risk remains.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH: valid — codegen step added to tasks.md Slice 2 (run npm run codegen after fragment change, commit graphql.ts). MEDIUM: valid — null balance case added to tasks.md Slice 1 (no sync log when setting balance to null). Residual risks noted and deferred per spec.
