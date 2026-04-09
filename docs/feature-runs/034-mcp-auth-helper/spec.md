# 034 — Extract MCP Auth Context Helper

**Status**: Draft
**Created**: 2026-04-09
**Motivation**: 11 MCP tool files each contain `const userId = 'mcp-user'; // TODO: Extract from auth context when available`. When real auth is added, all 11 files must be updated individually. A shared helper centralizes this.

---

## Background

MCP tools need a `userId` for audit logging. Today it's hardcoded to `'mcp-user'` in every tool. When MCP auth is implemented, each tool will need to extract the user ID from the auth context. A helper in `helpers.ts` makes this a one-line change later.

Affected files (11):
- cancel-summarization.ts
- restart-summarization.ts
- delete-definition.ts
- create-definition.ts
- validate-definition.ts
- trigger-recovery.ts
- get-unsummarized-transcripts.ts
- recover-run.ts
- delete-run.ts
- fork-definition.ts
- get-job-queue-status.ts

---

## User Stories

### US-1: Single place to update MCP auth (P1)

When MCP auth is implemented, a developer should only update one function instead of 11 files.

**Acceptance**:
- A `getMcpUserId()` function exists in `helpers.ts`
- All 11 tool files import and call it instead of hardcoding `'mcp-user'`
- The TODO comment lives in one place (the helper) instead of 11

---

## Requirements

- **FR-001**: `getMcpUserId()` MUST return `'mcp-user'` (preserving current behavior)
- **FR-002**: `getMcpUserId()` MUST include the TODO comment about future auth context extraction
- **FR-003**: All 11 tool files MUST import from `helpers.ts` and use the helper
- **FR-004**: Zero behavioral changes

---

## Success Criteria

- **SC-001**: Zero occurrences of `'mcp-user'` outside `helpers.ts`
- **SC-002**: All existing tests pass
- **SC-003**: Lint, build pass
