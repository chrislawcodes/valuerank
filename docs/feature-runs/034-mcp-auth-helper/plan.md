# Implementation Plan: Extract MCP Auth Context Helper

**Branch**: `claude/brave-williamson` | **Date**: 2026-04-09 | **Spec**: [spec.md](./spec.md)

## Summary

Add `getMcpUserId()` to `mcp/tools/helpers.ts`, then replace the hardcoded `'mcp-user'` in 11 tool files with a call to it.

---

## Files In Scope

| File | Action |
|------|--------|
| `mcp/tools/helpers.ts` | Add `getMcpUserId()` function |
| `mcp/tools/cancel-summarization.ts` | Replace hardcoded userId |
| `mcp/tools/restart-summarization.ts` | Replace hardcoded userId |
| `mcp/tools/delete-definition.ts` | Replace hardcoded userId |
| `mcp/tools/create-definition.ts` | Replace hardcoded userId |
| `mcp/tools/validate-definition.ts` | Replace hardcoded userId |
| `mcp/tools/trigger-recovery.ts` | Replace hardcoded userId |
| `mcp/tools/get-unsummarized-transcripts.ts` | Replace hardcoded userId |
| `mcp/tools/recover-run.ts` | Replace hardcoded userId |
| `mcp/tools/delete-run.ts` | Replace hardcoded userId |
| `mcp/tools/fork-definition.ts` | Replace hardcoded userId |
| `mcp/tools/get-job-queue-status.ts` | Replace hardcoded userId |

---

## The Change

**helpers.ts** — add:
```typescript
/**
 * Returns the current MCP user ID for audit logging.
 * TODO: Extract from auth context when MCP authentication is implemented.
 */
export function getMcpUserId(): string {
  return 'mcp-user';
}
```

**Each tool file** — replace:
```typescript
const userId = 'mcp-user'; // TODO: Extract from auth context when available
```
with:
```typescript
const userId = getMcpUserId();
```

---

## Verification

1. `npm run lint --workspace @valuerank/api`
2. `npm run build --workspace @valuerank/api`
3. Grep confirms zero occurrences of `'mcp-user'` outside `helpers.ts`
