---
reviewer: "claude-sonnet-4-5"
lens: "implementation-risk-judge"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/visitor-role-access-control/spec.md"
artifact_sha256: "c0a54b6a4874a63ff9c4e6fa606c27e179b1a081ed5d594082cebf78b9c77614"
repo_root: "."
git_head_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
git_base_ref: "origin/main"
git_base_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Four load-bearing ambiguities would cause an implementer to guess or ship a bug. (1) The changePassword mutation's new return type is never specified — the spec mandates a fresh JWT in the response but never defines the GraphQL return sh..."
raw_output_path: "docs/workflow/feature-runs/visitor-role-access-control/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec implementation-risk-judge

## Findings

Four load-bearing ambiguities would cause an implementer to guess or ship a bug. (1) The changePassword mutation's new return type is never specified — the spec mandates a fresh JWT in the response but never defines the GraphQL return shape, leaving the implementer to invent a schema change and matching client code without guidance. (2) The spec mandates SERIALIZABLE isolation for the last-admin transaction but Railway commonly uses PgBouncer in transaction-pooling mode, where SET TRANSACTION ISOLATION LEVEL is silently dropped or errors — the spec does not acknowledge this and provides no fallback. (3) Two route guards produce conflicting redirects with no stated priority: mustChangePassword → /settings/account and VISITOR-on-restricted-path → /; a new VISITOR user with mustChangePassword=true hitting /archive would trigger both simultaneously with no defined winner, risking a redirect loop. (4) The spec states '24h (the JWT TTL)' as fact when describing the stale-role window, but never references the config value or env var that controls this — an implementer who sets a different TTL will ship subtly wrong documentation and possibly miscalibrated behavior.

## Residual Risks

- spec :: FR-009b - the server MUST return a fresh JWT with `mustChangePassword: false` in the response — this is the only mechanism to clear the redirect loop without forcing logout
- spec :: Key Entities — New GraphQL operations (changePassword not listed) - FR-005c Visitor write exceptions — the following mutations are explicitly allowed for VISITOR users and MUST NOT call `requireAdmin()`: `changePassword` (own password only)
- spec :: Edge Cases — Last Admin protection - within a Prisma `$transaction` with `SERIALIZABLE` isolation level
- spec :: FR-009b - if `mustChangePassword` is true, redirect to `/settings/account` before any other navigation
- spec :: FR-020 - The redirect target for unauthorized routes MUST be the home page (`/`)
- spec :: Edge Cases — JWT stale role - a demoted Admin retains write access for up to 24h (the JWT TTL)

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "spec",
      "quote": "the server MUST return a fresh JWT with `mustChangePassword: false` in the response \u2014 this is the only mechanism to clear the redirect loop without forcing logout",
      "section": "FR-009b"
    },
    {
      "artifact": "spec",
      "quote": "FR-005c Visitor write exceptions \u2014 the following mutations are explicitly allowed for VISITOR users and MUST NOT call `requireAdmin()`: `changePassword` (own password only)",
      "section": "Key Entities \u2014 New GraphQL operations (changePassword not listed)"
    },
    {
      "artifact": "spec",
      "quote": "within a Prisma `$transaction` with `SERIALIZABLE` isolation level",
      "section": "Edge Cases \u2014 Last Admin protection"
    },
    {
      "artifact": "spec",
      "quote": "if `mustChangePassword` is true, redirect to `/settings/account` before any other navigation",
      "section": "FR-009b"
    },
    {
      "artifact": "spec",
      "quote": "The redirect target for unauthorized routes MUST be the home page (`/`)",
      "section": "FR-020"
    },
    {
      "artifact": "spec",
      "quote": "a demoted Admin retains write access for up to 24h (the JWT TTL)",
      "section": "Edge Cases \u2014 JWT stale role"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-sonnet-4-5",
  "reasoning": "Four load-bearing ambiguities would cause an implementer to guess or ship a bug. (1) The changePassword mutation's new return type is never specified \u2014 the spec mandates a fresh JWT in the response but never defines the GraphQL return shape, leaving the implementer to invent a schema change and matching client code without guidance. (2) The spec mandates SERIALIZABLE isolation for the last-admin transaction but Railway commonly uses PgBouncer in transaction-pooling mode, where SET TRANSACTION ISOLATION LEVEL is silently dropped or errors \u2014 the spec does not acknowledge this and provides no fallback. (3) Two route guards produce conflicting redirects with no stated priority: mustChangePassword \u2192 /settings/account and VISITOR-on-restricted-path \u2192 /; a new VISITOR user with mustChangePassword=true hitting /archive would trigger both simultaneously with no defined winner, risking a redirect loop. (4) The spec states '24h (the JWT TTL)' as fact when describing the stale-role window, but never references the config value or env var that controls this \u2014 an implementer who sets a different TTL will ship subtly wrong documentation and possibly miscalibrated behavior.",
  "timestamp": "2026-04-21T00:00:00Z",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Four load-bearing ambiguities would cause an implementer to guess or ship a bug. (1) The changePassword mutation's new return type is never specified — the spec mandates a fresh JWT in the response but never defines the GraphQL return sh...
