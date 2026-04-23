---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/visitor-role-access-control/plan.md"
artifact_sha256: "b5d7886689ab9b229a9239aee69236e8c6208e9b9bf6846df8928c75363b667e"
repo_root: "."
git_head_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
git_base_ref: "origin/main"
git_base_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH Wave 5 manual testing: deferred — full E2E framework (Playwright/Cypress) is out of scope for V1; manual verification documented. Flagged as post-ship tech debt. HIGH grep mutation audit: upgraded to a schema-aware integration test in Risk 1 — enumerates all mutations via introspection and asserts FORBIDDEN for Visitor on each; provides durable CI gate. MEDIUM last-admin race test: accepted; added controlled parallel integration test approach using Promise.all + note on test-mode delay. MEDIUM password change JWT race: handled naturally — JWT is signed from fresh DB read at signing time so current role is always in the new token. MEDIUM read endpoint snapshot: deferred as out of scope for V1; the one-time manual verification before ship is sufficient given this is configuration metadata not credentials. MEDIUM JWT test helpers: added Risk 2b to plan — check for existing helper, create if absent. LOW migration test: handled by existing integration test suite via test DB setup. LOW listUsers passwordHash: added explicit integration test to Wave 4 verification."
raw_output_path: "docs/workflow/feature-runs/visitor-role-access-control/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Recommendation |
| --- | --- | --- |
| **HIGH** | **Wave 5 (Web UI) relies exclusively on manual verification.** | Implement an E2E test suite (e.g., using Cypress or Playwright) to replace all manual checks. Automated tests should cover every point in the verification list: Visitor logins, Admin logins, redirects for protected routes, conditional UI element rendering, and the forced password change flow. This is critical for preventing regressions in the client-side security UX. |
| **HIGH** | **GraphQL mutation coverage is verified by a fragile `grep` command.** | Instead of a text-based search, which can easily miss cases or become outdated, create a programmatic, schema-aware integration test. This test should fetch the GraphQL schema, iterate through all defined mutations, and attempt to execute each one as a `VISITOR`. Assert that all mutations fail with a `FORBIDDEN` error, except for an explicit, small allowlist (`changePassword` if it were GraphQL, etc.). This provides durable, automated assurance that new mutations are secure by default. |
| **MEDIUM** | **The test for the "last admin" race condition is not well-defined.** | The plan states "Unit test: `updateUserRole` SERIALIZABLE transaction — concurrent downgrade of last Admin is rejected". Testing concurrency in a unit test is difficult and often unreliable. An integration test that spawns two parallel requests attempting to demote the last admin is required to truly verify the `SERIALIZABLE` isolation level prevents this critical race condition. |
| **MEDIUM** | **[UNVERIFIED] Password change JWT issuance has an untested race condition.** | The `PUT /api/auth/password` endpoint issues a new JWT after a forced password change. A test case is needed for the scenario where a user's role is changed by an admin *during* the user's password change session. The newly issued JWT must reflect the most current role from the database at the moment of issuance, not the role present when the flow began. |
| **MEDIUM** | **[UNVERIFIED] Accepted risk of read-only endpoint access is not continuously verified.** | The plan accepts that Visitors can access read-only Admin configuration endpoints (e.g., `llmModels`). The verification is a one-time manual check for secrets. This is insufficient. An automated integration test should run as a `VISITOR`, call these endpoints, and use snapshot testing to ensure the data structure and content do not leak sensitive information. This protects against future changes accidentally exposing secrets in these objects. |
| **MEDIUM** | **[UNVERIFIED] The plan assumes the existence of test helpers for creating JWTs.** | Wave 2 verification relies on creating test JWTs with specific payloads (no role, visitor role, etc.). The plan does not account for the effort to create a secure, reliable test helper for signing arbitrary JWT payloads if one does not already exist. The test plan should explicitly include the creation of this helper. |
| **LOW** | **Database migration verification is manual.** | Wave 1 verification requires a human to run `prisma migrate` and visually inspect the database. This should be an automated integration test that: 1. Seeds data with the old schema. 2. Runs the migration. 3. Asserts that the migrated data is correct (e.g., existing users now have `role: 'ADMIN'`). |
| **LOW** | **No explicit test for data leakage in the new `listUsers` query.** | The plan for Wave 4 verifies that `listUsers` is admin-only, but does not verify the contents of the response. A test should be added to call `listUsers` as an `ADMIN` and assert that the response objects contain *only* the specified safe fields and do not leak sensitive data like the `passwordHash`. |

## Residual Risks

The review of the plan identified the following risks which are not fully mitigated by the proposed testing strategy.

| Risk | Analysis |
| --- | --- |
| **Stale Role via JWT** | The plan correctly identifies that a demoted admin retains their privileges until their JWT expires (up to 24h). This is accepted as a V1 limitation. However, the proposed verification is manual. **This should be an automated integration test** that confirms a user with a recently-demoted role (but a valid, old JWT) can still access an admin-only mutation. This codifies the accepted behavior and prevents it from being flagged as a bug in the future. |
| **API Key Role Resolution** | The plan states that for API keys, the user's role is fetched from the DB on every request. This is a different code path from the JWT role. While Wave 2 includes a unit test, it introduces a potential performance bottleneck (DB call per API request) and a consistency challenge (API key auth is real-time, JWT is delayed). The test plan should include a specific integration test that confirms a role change is reflected *immediately* for an API key user, contrasting with the delayed update for a JWT user. |
| **PgBouncer Configuration Mismatch** | The plan correctly identifies that `SERIALIZABLE` isolation may fail if PgBouncer is in transaction-pooling mode. The verification is a manual check of the `DATABASE_URL`. This is a significant environmental dependency. If the test environment's PgBouncer configuration doesn't match production, the tests for the "last admin" race condition could provide a false sense of security. This risk cannot be fully mitigated without ensuring environment parity. |

## Token Stats

- total_input=10413
- total_output=1177
- total_tokens=27597
- `gemini-2.5-pro`: input=10413, output=1177, total=27597

## Resolution
- status: accepted
- note: HIGH Wave 5 manual testing: deferred — full E2E framework (Playwright/Cypress) is out of scope for V1; manual verification documented. Flagged as post-ship tech debt. HIGH grep mutation audit: upgraded to a schema-aware integration test in Risk 1 — enumerates all mutations via introspection and asserts FORBIDDEN for Visitor on each; provides durable CI gate. MEDIUM last-admin race test: accepted; added controlled parallel integration test approach using Promise.all + note on test-mode delay. MEDIUM password change JWT race: handled naturally — JWT is signed from fresh DB read at signing time so current role is always in the new token. MEDIUM read endpoint snapshot: deferred as out of scope for V1; the one-time manual verification before ship is sufficient given this is configuration metadata not credentials. MEDIUM JWT test helpers: added Risk 2b to plan — check for existing helper, create if absent. LOW migration test: handled by existing integration test suite via test DB setup. LOW listUsers passwordHash: added explicit integration test to Wave 4 verification.
