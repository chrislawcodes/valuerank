---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ci-test-quality/spec.md"
artifact_sha256: "1cc61fd22c02c9a7b5294adfdb3c89c71d680ba371b2142f8fdd97e952a9e0bf"
repo_root: "."
git_head_sha: "2c5aac580a13a7d49fc70672b5d33f584cdc9c62"
git_base_ref: "origin/main"
git_base_sha: "6396d4f22128d811613f066211f9318ead37f425"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "All findings are UNVERIFIED. US-2 delete was verified by diff (21 lines vs 200+ line superset). US-7 TypeScript build passes with no floating-promise errors. US-5 split: all 1232 tests pass after split, fixtures extracted to shared *.fixtures.tsx files. US-6 scope is intentionally narrow per spec. US-1 --force is scoped to --filter=@valuerank/shared."
raw_output_path: "docs/workflow/feature-runs/ci-test-quality/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- [UNVERIFIED] MEDIUM: The spec treats `src/cli/create-user.test.ts` as safe to delete because `tests/cli/create-user.test.ts` is “a superset” and the file is short. That is not enough proof. If the `src/` stub covers a different setup path, mock, or edge case, this deletes coverage silently. The spec needs an explicit behavioral/diff check, not just a line-count argument.

- [UNVERIFIED] MEDIUM: US-7 assumes changing `void` middleware helpers to return `Promise<void>` is caller-safe. That is only true if the repo does not enforce `no-floating-promises` or similar linting. In a stricter setup, every ignored call site becomes a lint failure or needs `void`/`await` handling. The spec should say how call sites are expected to remain valid.

- [UNVERIFIED] MEDIUM: US-6 only targets `waitFor`/`findBy*` around assertions, but it misses a common flake source: `userEvent` calls that are not awaited. Wrapping the later `getBy*` in `waitFor` does not fix a race if the interaction itself is still pending. The spec should explicitly require auditing and awaiting async user interactions.

- [UNVERIFIED] MEDIUM: US-5 says to split large tests by describe group and keep each file under 600 lines, but it does not require preserving file-level hooks, shared module state, or snapshot layout. A split can satisfy the line-count rule and still change lifecycle behavior or break snapshots. The spec needs a guardrail that the split files remain behaviorally equivalent when run alone.

- [UNVERIFIED] MEDIUM: US-1 only requires `turbo build --force` before web tests. That bypasses Turbo’s cache, but it does not prove the suite is actually reading the freshly built artifact instead of a leftover `dist/` or a source import path. The spec should require an explicit clean/verification step for the artifact path, otherwise the stale-build bug can survive in a different form.

## Residual Risks

- I could not verify whether the API suite includes any test patterns outside `tests/**/*.test.ts` and `scripts/__tests__/**/*.test.ts`, so the duplicate-test cleanup may still miss or accidentally drop files.

- I could not verify whether the large web test files rely on snapshots or shared top-level fixtures, so the split work may need extra migration beyond what the spec names.

- I could not verify whether the CI cache fallback keys are isolated enough for your dependency graph, so the restore-key change may still reintroduce mixed or stale `node_modules` states.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: All findings are UNVERIFIED. US-2 delete was verified by diff (21 lines vs 200+ line superset). US-7 TypeScript build passes with no floating-promise errors. US-5 split: all 1232 tests pass after split, fixtures extracted to shared *.fixtures.tsx files. US-6 scope is intentionally narrow per spec. US-1 --force is scoped to --filter=@valuerank/shared.
