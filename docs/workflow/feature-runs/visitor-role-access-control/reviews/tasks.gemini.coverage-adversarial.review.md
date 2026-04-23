---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/visitor-role-access-control/tasks.md"
artifact_sha256: "76c9c099eb2346d8263f1d0272961cf8897a42df4bffeaa1edee267048b9ff60"
repo_root: "."
git_head_sha: "be22efc5778f22ae8cd4797417cc3d125c999529"
git_base_ref: "origin/main"
git_base_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "CRITICAL default ADMIN for old JWTs: intentional and safe per spec FR-005b — FR-002 backfills ALL existing users to ADMIN before deploy; no existing user is a Visitor, so treating pre-migration tokens as ADMIN is correct and temporary (expires with the JWT TTL). CRITICAL old JWT not invalidated after password change: the existing middleware already validates iat against passwordChangedAt — this check is in place today and the plan preserves it. The fresh JWT iat is set to passwordChangedAt+1s to pass the check. Additional per-request DB lookups are rejected by Decision 1 (role in JWT). HIGH per-mutation enforcement brittle: mitigated by schema-aware introspection test in Slice 4 — all mutations are enumerated via introspection and tested against VISITOR role on every CI pass; this is the durable gate. MEDIUM last-admin SERIALIZABLE race: SERIALIZABLE isolation with Prisma  is the correct mechanism — the transaction fails atomically if another concurrent transaction modified the admin count; no SELECT-then-UPDATE race condition exists at SERIALIZABLE level."
raw_output_path: "docs/workflow/feature-runs/visitor-role-access-control/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

| Severity | Finding | Location | Recommendation |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | Defaulting old JWTs to ADMIN grants maximum privilege. | Slice 2 | Pre-migration tokens lacking a `role` claim must be treated with the *least* privilege. They should default to `VISITOR` or be rejected entirely, forcing re-authentication. Defaulting to `ADMIN` is a severe security vulnerability. |
| **CRITICAL** | Forced password change does not invalidate the old JWT. | Slice 3 | Issuing a new JWT with an updated `iat` claim is insufficient. The auth middleware (Slice 2) must be updated to fetch the user's `passwordChangedAt` timestamp from the database on each request and verify that the JWT's `iat` is not older than that timestamp. Without this check, the old token remains valid until its natural expiry. |
| **HIGH** | Authorization enforcement is manual and error-prone. | Slice 4 | The strategy of manually adding `requireAdmin` to every mutation and scanning MCP tools for writes is not robust. It guarantees that future additions will miss the check. Implement a "default-deny" authorization layer at the GraphQL server and MCP tool router level. All resolvers/tools should be considered admin-only unless explicitly added to a public allow-list. |
| **MEDIUM** | [UNVERIFIED] The "last admin" check is susceptible to race conditions. | Slice 4 | While `SERIALIZABLE` transaction isolation helps, the application logic must be robust. A simple `SELECT COUNT` followed by an `UPDATE` is not safe. The update logic should try to demote the user and atomically check that at least one other admin still exists within the same transaction, or use pessimistic locking (`SELECT ... FOR UPDATE`). |
| **MEDIUM** | [UNVERIFIED] The role and behavior for API Keys are undefined. | Slice 2 | The plan assumes API keys can be resolved to a user with a role. It does not specify what happens if a key is generic, what its role should be, or if it should be affected by `mustChangePassword`. This logic path is an implicit assumption about the existing codebase. |
| **LOW** | The Prisma schema contains non-standard annotations. | Slice 1 | The fields `role` and `mustChangePassword` have annotations like `@cloud/apps/api/src/mcp/tools/set-default-llm-model.ts(ADMIN)`. This is not valid Prisma syntax. It implies a hidden, custom parsing or codegen step. This dependency is not documented and makes the schema and build process brittle. |
| **LOW** | Verification relies heavily on manual UI checks. | Slice 5 | The verification plan for the web UI is a manual checklist. This is time-consuming and prone to human error, creating a high risk of regressions in role-based access control with future changes. Key access control flows should be covered by automated end-to-end tests (e.g., Playwright, Cypress). |

## Residual Risks

- **Stale Client-Side Roles**: The plan correctly notes that role changes take effect on the next login because the role is stored in the JWT. However, this means a long-lived session for a demoted admin will retain admin privileges until logout. For critical de-provisioning, a mechanism to forcefully expire sessions (e.g., via a server-side revocation list) is missing.
- **Inconsistent Validation**: The task to update `MIN_PASSWORD_LENGTH` in both `routes/auth.ts` and `cli/create-user.ts` suggests that validation logic may not be centralized. This creates a risk of inconsistent security policies across different user management entry points.
- **Information Leakage in `listUsers`**: The verification for `listUsers` confirms `passwordHash` is not sent, which is good. However, it does not specify what other fields are returned. Returning user emails or other PII to all admins might be an unintended information disclosure, depending on the system's privacy requirements.

## Token Stats

- total_input=19702
- total_output=870
- total_tokens=22395
- `gemini-2.5-pro`: input=19702, output=870, total=22395

## Resolution
- status: accepted
- note: CRITICAL default ADMIN for old JWTs: intentional and safe per spec FR-005b — FR-002 backfills ALL existing users to ADMIN before deploy; no existing user is a Visitor, so treating pre-migration tokens as ADMIN is correct and temporary (expires with the JWT TTL). CRITICAL old JWT not invalidated after password change: the existing middleware already validates iat against passwordChangedAt — this check is in place today and the plan preserves it. The fresh JWT iat is set to passwordChangedAt+1s to pass the check. Additional per-request DB lookups are rejected by Decision 1 (role in JWT). HIGH per-mutation enforcement brittle: mitigated by schema-aware introspection test in Slice 4 — all mutations are enumerated via introspection and tested against VISITOR role on every CI pass; this is the durable gate. MEDIUM last-admin SERIALIZABLE race: SERIALIZABLE isolation with Prisma  is the correct mechanism — the transaction fails atomically if another concurrent transaction modified the admin count; no SELECT-then-UPDATE race condition exists at SERIALIZABLE level.
