---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/visitor-role-access-control/spec.md"
artifact_sha256: "982399748eb1c1d1cca09c98488653ecbd6d55741fbcd294ed2c07659ae98ee1"
repo_root: "."
git_head_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
git_base_ref: "origin/main"
git_base_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/visitor-role-access-control/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. Stale JWT on Demotion Creates a 24-Hour Write-Access Vulnerability (CRITICAL)

The spec correctly identifies that a user whose role is changed from ADMIN to VISITOR will retain their ADMIN-level write access until their current JWT expires (up to 24 hours). However, it classifies this as an "acceptable V1 limitation" which is an underestimation of the risk.

- **Attack Vector:** A disgruntled or compromised admin, upon being demoted, has a full day to exfiltrate data, corrupt data, or delete resources using their still-valid JWT. This is not a theoretical edge case; it's a standard threat model for insider risk.
- **Flaw:** The non-goal "Real-time JWT revocation" is the source of the vulnerability. While revocation can be complex, accepting a 24-hour window for unrestricted write access after demotion is a significant security posture weakness. A shorter JWT lifetime (e.g., 15 minutes) combined with refresh tokens would be a more standard and secure pattern.

### 2. Admin-Set Passwords and Out-of-Band Delivery is a Security Anti-Pattern (HIGH)

The user creation flow (FR-009b, FR-010) requires an admin to set a temporary password and deliver it to the new user "out-of-band."

- **Attack Vector:** This process is insecure by definition. The temporary password exists in plaintext (in the admin's head, in an email, in a chat message) and is not subject to any system controls. It's vulnerable to shoulder-surfing, email/chat interception, or simple human error. It also trains users to trust password delivery via insecure channels, making them vulnerable to phishing.
- **Flaw:** A proper "invite" system where the user sets their own password via a unique, single-use link is the industry standard for a reason. While the spec declares an email-based flow a non-goal, the chosen alternative introduces significant, avoidable risk.

### 3. Forced Password Change Flow is Brittle and May Cause Lockouts (MEDIUM)

The mechanism to force a password change (FR-009b) relies on the server returning a *new* JWT within the body of the `changePassword` mutation response. This is a non-standard and fragile pattern.

- **Failure Mode:** Standard client-side auth flows are built around a login event setting the token. If a network error, browser crash, or premature tab closure occurs *after* the `changePassword` call succeeds but *before* the client-side app code has persisted the new JWT, the user will be locked out. Their old password is now invalid, and their client holds a JWT that still has `mustChangePassword: true`, trapping them in a redirect loop on their next login attempt.
- **Flaw:** This custom, stateful logic in the `changePassword` mutation is unnecessarily complex. A simpler flow would be to have the user log in with the temporary password, get the JWT with the `mustChangePassword: true` flag, get redirected, and then perform a standard `changePassword` mutation. After success, they should be forced to log out and log back in with their new password to get a clean JWT. The current spec attempts to be "clever" at the cost of robustness.

### 4. Risk of Admin-Only Data Leakage in Exports (MEDIUM)

FR-008 states that `GET /api/export` should not include user lists or admin data. This requirement is sound, but it introduces a new dimension of logic to an existing feature.

- **Flaw / [UNVERIFIED]:** The spec assumes the export generation logic can easily be made role-aware to filter out this data. However, it's plausible that the current export is a simple data dump (e.g., `SELECT * FROM results`). If the logic for filtering is not implemented perfectly, there is a high risk of leaking sensitive admin-only data (user lists, system settings, etc.) to Visitor-level users. This requires careful auditing of the *existing* export implementation, not just adding a role check at the entrypoint.

### 5. "Last Admin" Protection is Platform-Dependent (LOW)

The "Last Admin protection" edge case relies on `SERIALIZABLE` transaction isolation to prevent race conditions. This is a solid theoretical design.

- **Flaw / [UNVERIFIED]:** This guarantee is only as strong as the underlying database's support for it. Not all database platforms, particularly distributed SQL databases that may be used in cloud environments, offer true `SERIALIZABLE` isolation with the expected guarantees. If the platform silently downgrades the isolation level, the protection could fail under concurrent load, allowing the last admin account to be demoted or deleted, effectively locking everyone out of the system. The effectiveness of this control is an assumption about the deployment environment.

## Residual Risks

- **Developer Discipline as a Security Guarantee:** The core enforcement strategy relies on `FR-005a` (default-deny), which mandates that developers must remember to add `requireAdmin()` to every new write mutation. This is a process control, not a technical one. The risk is that a developer, under pressure, adds a new mutation and forgets the check, silently creating a security hole. A better approach would involve static analysis tools or a framework-level "taint" system where mutations are admin-only by default unless explicitly marked public.

- **Bootstrap Path Ambiguity:** `FR-009c` updates the CLI `create-user` command for bootstrapping. While this extends an existing tool, it creates a "god mode" access path that completely bypasses all role-based access control. The risk is that this tool is used improperly post-deployment or that its existence is not properly documented or secured, creating a powerful backdoor.

- **Inconsistent Auth Behavior:** The spec notes that API keys will have their role checked "fresh" from the DB on each request, while JWTs will carry a potentially stale role. This creates an inconsistent security model. A user demoted from ADMIN to VISITOR could find their UI access is gone (after re-login), but their old automation scripts using an API key might suddenly start failing in unexpected ways, or worse, continue to work if the role check isn't implemented correctly in the API key middleware. This inconsistency complicates debugging and reasoning about the system's behavior.

## Token Stats

- total_input=6881
- total_output=1366
- total_tokens=23388
- `gemini-2.5-pro`: input=6881, output=1366, total=23388

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
