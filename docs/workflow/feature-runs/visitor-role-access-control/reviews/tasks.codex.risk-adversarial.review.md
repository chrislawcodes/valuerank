---
reviewer: "codex"
lens: "risk-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/visitor-role-access-control/tasks.md"
artifact_sha256: "76c9c099eb2346d8263f1d0272961cf8897a42df4bffeaa1edee267048b9ff60"
repo_root: "."
git_head_sha: "be22efc5778f22ae8cd4797417cc3d125c999529"
git_base_ref: "origin/main"
git_base_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM CLI bootstrap mustChangePassword: CLI is the first-admin bootstrap path only (FR-009c) — admins who create their own account via CLI know their password; mustChangePassword is for admin-created accounts via the UI/API. MEDIUM requireAdminRest null check: plan specifies !req.user check before role check — implementer must include both conditions. MEDIUM manual per-file rollout brittle: acknowledged; mitigated by schema-aware introspection test (Slice 4 verification) which is the durable CI gate — any missed mutations will be caught by the test."
raw_output_path: "docs/workflow/feature-runs/visitor-role-access-control/reviews/tasks.codex.risk-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks risk-adversarial

## Findings

- Medium: Slice 3 leaves the `cloud/apps/api/src/cli/create-user.ts` bootstrap path without setting `mustChangePassword`. That means a newly created admin can keep a permanent password, which is inconsistent with the forced-reset flow added for other account creation paths and weakens the initial credential policy.
- Medium [UNVERIFIED]: Slice 2 says `requireAdminRest(req, res, next)` should return 403 when `req.user.role !== 'ADMIN'`, but it does not say what happens when `req.user` is missing. If implemented literally, an unauthenticated request can throw before returning 403 and become a 500 instead.
- Medium [UNVERIFIED]: Slice 4’s file-by-file `requireAdmin` rollout is brittle. It only covers the listed files and relies on a manual scan for “actual mutation resolver definitions.” That can miss write entry points exposed through other files, generated resolver maps, or wrapper functions, and it can also over-block files that mix read and write resolvers. Both bypass and regression risk remain unless enforcement is centralized or exhaustively tested.

## Residual Risks

- I could not verify that every write path in GraphQL, REST, and MCP is covered. Any unlisted route or tool can still remain visitor-writable.
- The plan depends on client and server agreeing on the new auth payload shape. During rollout, mixed old/new tokens can produce stale role or password-reset state.
- The password-change JWT reissue depends on timestamp comparison behavior in the auth layer. If the verifier uses a different time resolution than the issuer, freshly rotated tokens could be rejected.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM CLI bootstrap mustChangePassword: CLI is the first-admin bootstrap path only (FR-009c) — admins who create their own account via CLI know their password; mustChangePassword is for admin-created accounts via the UI/API. MEDIUM requireAdminRest null check: plan specifies !req.user check before role check — implementer must include both conditions. MEDIUM manual per-file rollout brittle: acknowledged; mitigated by schema-aware introspection test (Slice 4 verification) which is the durable CI gate — any missed mutations will be caught by the test.
