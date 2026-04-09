# Tasks: Deduplicate normalizeModelSet

## Phase 1: Fix and deduplicate

- [ ] T001 [P: cloud/apps/api/src/graphql/mutations/domain/types.ts] Add `.trim() !== ''` to the filter in `normalizeModelSet`
- [ ] T002 [P: cloud/apps/api/src/graphql/mutations/assumptions.ts] Delete private `normalizeModelSet` (lines 43-49), add `import { normalizeModelSet } from './domain/types.js'`

## Phase 2: Verify

- [ ] T003 Run lint, test, build — all pass
- [ ] T004 Grep confirms exactly one `function normalizeModelSet` in codebase
