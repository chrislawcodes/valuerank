# Plan Reviews — Round 1 (Full Migration in One PR)

## Gemini: 2 PASS, 4 FAIL

1. **FAIL** — Zero consumer changes is false. null vs undefined, JSON type loss.
2. **FAIL** — JSON→unknown breaks existing 3 migrated files.
3. **PASS** — Fragment collisions handled by codegen validation.
4. **PASS** — Nested types compatible via fragment inlining.
5. **FAIL** — Schema export script fragile with dynamic imports.
6. **FAIL** — One PR unreviewable, rollback cost too high.

## Claude Agent (partial — timed out)

- **Critical**: RunStatus schema enum may differ from manual type (missing PAUSED, SUMMARIZING)
- **Critical**: RunCategory is NOT a GraphQL enum — plain String field

**Outcome**: Plan revised to incremental 4-PR approach.

---

# Plan Reviews — Round 2 (Incremental 4 PRs)

## Gemini: 5/5 PASS

1. PASS — Incremental approach mitigates all flagged risks
2. PASS — PR 1 simple files have no JSON scalar fields
3. PASS — JSON→unknown change is expected + plan budgets for fixing existing files
4. PASS — tags.ts is safe first candidate (4 consumers)
5. PASS — Lint rule in PR 4 prevents shim regression

## Codex: 1 FAIL, 1 PASS

1. **FAIL** — health.ts and scenarios.ts have JSON scalar fields; not safe for PR 1
2. **PASS** — No cross-file dependencies in any of the 5 files

**Outcome**: health.ts and scenarios.ts moved from PR 1 to PR 2. PR 1 reduced to 3 truly simple files: tags.ts, costs.ts, api-keys.ts.
