---
reviewer: "codex"
lens: "execution-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/visitor-role-access-control/tasks.md"
artifact_sha256: "76c9c099eb2346d8263f1d0272961cf8897a42df4bffeaa1edee267048b9ff60"
repo_root: "."
git_head_sha: "be22efc5778f22ae8cd4797417cc3d125c999529"
git_base_ref: "origin/main"
git_base_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM JWT revocation on role/password change: accepted V1 limitation — explicitly documented in spec Edge Cases and Non-Goals; stale JWT role is the accepted design. MEDIUM default role=ADMIN for pre-migration tokens: intentional and safe per FR-005b — FR-002 backfills all existing users to ADMIN before any token is issued. MEDIUM requireAdmin null user handling: already addressed — spec and plan specify requireAdmin throws ForbiddenError for null/undefined user; requireAdminRest checks !req.user before role."
raw_output_path: "docs/workflow/feature-runs/visitor-role-access-control/reviews/tasks.codex.execution-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks execution-adversarial

## Findings

- [MEDIUM][UNVERIFIED] Slice 2 and Slice 3 do not define a real server-side session revocation path. Role changes and password changes only update new tokens, but the plan never says to reject older JWTs using `passwordChangedAt`, a token version, or a DB lookup. That means a demoted admin or a user who just changed passwords can keep using an already-issued token until it expires.

- [MEDIUM][UNVERIFIED] Slice 2 defaults any JWT missing `role` to `ADMIN`. That is a broad trust fallback. If any token is minted outside the updated login flow, or if a partially migrated token slips through, it will be treated as privileged instead of being rejected or reloaded.

- [MEDIUM][UNVERIFIED] `requireAdmin(ctx)` and `requireAdminRest(req, res, next)` are specified only as role checks. The task does not say what happens when `ctx.user` or `req.user` is missing, or what middleware order is required. If they run before authentication, the result could be a 500 or inconsistent 401/403 behavior instead of a clean denial.

- [MEDIUM][UNVERIFIED] Slice 4 applies admin gating at the file level for a long list of mutation modules, but it does not prove that every resolver in those files is actually admin-only. If even one module contains a legitimate non-admin or visitor-facing resolver, this plan will break it. The spec should name the exact resolvers to protect, not just the files.

- [MEDIUM][UNVERIFIED] The user-creation flows are inconsistent. Slice 4 expects `createUser` to set `mustChangePassword: true`, but Slice 3’s CLI `create-user` task never says to force a password reset. That leaves one provisioning path bypassing the first-login password-change rule.

## Residual Risks

- I could not verify whether other write paths exist outside the listed GraphQL mutations, REST routes, and MCP tools. Any unlisted DB write surface would still need role enforcement.

- I could not verify whether the existing auth layer already checks token age or password-change time. If it does not, the `iat = passwordChangedAt + 1` instruction will not actually invalidate old sessions.

- I could not verify whether any of the listed mutation files contain mixed-use resolvers. The file-level admin rule may still be too coarse even if the individual names look right.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM JWT revocation on role/password change: accepted V1 limitation — explicitly documented in spec Edge Cases and Non-Goals; stale JWT role is the accepted design. MEDIUM default role=ADMIN for pre-migration tokens: intentional and safe per FR-005b — FR-002 backfills all existing users to ADMIN before any token is issued. MEDIUM requireAdmin null user handling: already addressed — spec and plan specify requireAdmin throws ForbiddenError for null/undefined user; requireAdminRest checks !req.user before role.
