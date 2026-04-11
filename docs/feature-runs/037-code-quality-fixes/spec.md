# 037 — Code Quality Fixes (CLAUDE.md, console.log, ARIA)

**Status**: Draft
**Created**: 2026-04-11
**Motivation**: Three constitution violations found during code quality audit.

---

## Fix 1: Stale folder structure in cloud/CLAUDE.md

The "Folder Structure" section documents `jobs/` (doesn't exist) and is missing `queue/`, `auth/`, `mcp/`, `graphql/`, `cli/`, `utils/`, `config/`, `scripts/`.

**Acceptance**: Folder structure matches actual directory layout.

## Fix 2: Replace console.log/error/warn with logger

6 files use `console.error` or `console.warn` with eslint-disable overrides. Constitution requires centralized logger.

| File | Line | Call |
|------|------|------|
| `pages/Preambles.tsx` | 125 | `console.error(err)` |
| `pages/LevelPresets.tsx` | 86 | `console.error(err)` |
| `pages/DefinitionDetail/DefinitionDetail.tsx` | 169 | `console.error('Failed to delete definition:', err)` |
| `pages/DefinitionDetail/DefinitionDetail.tsx` | 182 | `console.error('Failed to unfork definition:', err)` |
| `components/export/ExportButton.tsx` | 62 | `console.error('Export error:', err)` |
| `components/compare/visualizations/registry.tsx` | 64 | `console.warn(...)` |

**Acceptance**: Zero `console.error` or `console.warn` calls in web src/ (excluding test files). No `eslint-disable no-console` comments.

## Fix 3: Add ARIA attributes to custom modal backdrops

Two custom modals use `onClick` on backdrop divs without accessibility attributes. The standard `Modal.tsx` component does this correctly.

| File | Issue |
|------|-------|
| `pages/RunDetail/DeleteConfirmModal.tsx` | Missing `aria-hidden="true"` on backdrop |
| `pages/DefinitionDetail/UnforkDefinitionModal.tsx` | Missing `aria-hidden="true"` on backdrop |

**Acceptance**: Both backdrop divs have `aria-hidden="true"`.
