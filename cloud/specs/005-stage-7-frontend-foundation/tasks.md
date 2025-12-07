# Tasks: Stage 7 - Frontend Foundation

**Prerequisites**: spec.md, plan.md, contracts/frontend-operations.graphql

## Progress Summary

| Phase | Status | Tasks | Description |
|-------|--------|-------|-------------|
| Phase 1 | ✅ Complete | 4/4 | Setup - Dependencies & Proxy |
| Phase 2 | ✅ Complete | 7/7 | Foundation - GraphQL, Types, Tests |
| Phase 3 | ✅ Complete | 13/13 | US1 Login (P1 MVP) |
| Phase 4 | ✅ Complete | 5/5 | US5 Protected Routes (P1 MVP) |
| Phase 5 | ✅ Complete | 9/9 | US2 Navigation (P1 MVP) |
| Phase 6 | ✅ Complete | 4/4 | US4 UI States (P2) |
| Phase 7 | ✅ Complete | 7/7 | US3 API Keys (P2) |
| Phase 8 | ✅ Complete | 5/5 | Polish |

**Overall**: 54/54 tasks (100%) - **STAGE 7 COMPLETE**

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2, etc.) - for story phases only
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependencies

- [X] T001 Create feature branch `stage-7-frontend` from cloud-planning
- [X] T002 Add dependencies to apps/web/package.json: urql, graphql, @urql/exchange-auth, react-router-dom, lucide-react
- [X] T003 Add dev dependencies to apps/web/package.json: @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom, vitest
- [X] T004 Update apps/web/vite.config.ts with API proxy configuration per plan.md

**Checkpoint**: Dependencies installed, proxy configured

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

### GraphQL Client Setup

- [X] T005 Create apps/web/src/api/client.ts with urql client (basic, no auth yet)
- [X] T006 [P] Create apps/web/src/api/operations/auth.ts with Me query from contracts/
- [X] T007 [P] Create apps/web/src/api/operations/api-keys.ts with apiKeys query and mutations from contracts/

### Type Definitions

- [X] T008 Create apps/web/src/types/index.ts with User, ApiKey, AuthState types
- [X] T009 [P] Create apps/web/src/auth/types.ts with AuthContext type, LoginRequest, LoginResponse

### Test Infrastructure

- [X] T010 Create apps/web/tests/setup.ts with jsdom configuration
- [X] T011 Update apps/web/vitest.config.ts (or add to package.json) for React testing

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Login to Web Application (Priority: P1) 🎯 MVP

**Goal**: Users can log in with email/password and access the application

**Independent Test**: Navigate to app → see login → enter credentials → reach dashboard

### Implementation for User Story 1

- [X] T012 [US1] Create apps/web/src/auth/context.tsx with AuthProvider and AuthContext
- [X] T013 [US1] Create apps/web/src/auth/hooks.ts with useAuth hook
- [X] T014 [US1] Update apps/web/src/api/client.ts to inject auth header from context
- [X] T015 [US1] Create apps/web/src/components/ui/Input.tsx for form inputs
- [X] T016 [P] [US1] Create apps/web/src/components/ui/Button.tsx for buttons
- [X] T017 [P] [US1] Create apps/web/src/components/ui/ErrorMessage.tsx for errors
- [X] T018 [US1] Create apps/web/src/pages/Login.tsx with login form
- [X] T019 [US1] Integrate login API call (/api/auth/login) in Login.tsx
- [X] T020 [US1] Add token storage to localStorage in auth/context.tsx
- [X] T021 [US1] Add token restoration on app load in auth/context.tsx

### Tests for User Story 1

- [X] T022 [US1] Create apps/web/tests/auth/context.test.tsx for AuthContext
- [X] T023 [P] [US1] Create apps/web/tests/auth/hooks.test.tsx for useAuth
- [X] T024 [US1] Create apps/web/tests/pages/Login.test.tsx for Login page

**Checkpoint**: User Story 1 complete - can login via web UI

---

## Phase 4: User Story 5 - Protected Routes (Priority: P1) 🎯 MVP

**Goal**: Protected route wrapper handles auth redirects automatically

**Independent Test**: Access protected route without auth → redirect to login

### Implementation for User Story 5

- [X] T025 [US5] Create apps/web/src/components/ProtectedRoute.tsx
- [X] T026 [US5] Update apps/web/src/App.tsx with React Router setup
- [X] T027 [US5] Add route definitions for /login, /definitions, /runs, /experiments, /settings
- [X] T028 [US5] Implement redirect to intended URL after login in auth/context.tsx

### Tests for User Story 5

- [X] T029 [US5] Create apps/web/tests/components/ProtectedRoute.test.tsx

**Checkpoint**: User Story 5 complete - all routes protected, redirects work

---

## Phase 5: User Story 2 - Navigate Between Main Sections (Priority: P1) 🎯 MVP

**Goal**: Consistent navigation shell with tabs for all sections

**Independent Test**: Click each tab → URL and content change → no page reload

### Implementation for User Story 2

- [X] T030 [US2] Create apps/web/src/components/layout/Header.tsx with logo and user menu
- [X] T031 [P] [US2] Create apps/web/src/components/layout/NavTabs.tsx with 4 tabs
- [X] T032 [US2] Create apps/web/src/components/layout/Layout.tsx wrapping Header + NavTabs + content
- [X] T033 [US2] Add logout functionality to Header user menu
- [X] T034 [US2] Create apps/web/src/pages/Dashboard.tsx as landing page
- [X] T035 [P] [US2] Create apps/web/src/pages/Definitions.tsx placeholder page
- [X] T036 [P] [US2] Create apps/web/src/pages/Runs.tsx placeholder page
- [X] T037 [P] [US2] Create apps/web/src/pages/Experiments.tsx placeholder page
- [X] T038 [US2] Integrate Layout into App.tsx route structure

**Checkpoint**: User Story 2 complete - navigation between all sections works

---

## Phase 6: User Story 4 - UI States (Priority: P2)

**Goal**: Loading, empty, and error states display appropriately

**Independent Test**: Trigger each state → see appropriate UI

### Implementation for User Story 4

- [X] T039 [US4] Create apps/web/src/components/ui/Loading.tsx spinner component
- [X] T040 [P] [US4] Create apps/web/src/components/ui/EmptyState.tsx component
- [X] T041 [US4] Update apps/web/src/components/ui/ErrorMessage.tsx with retry functionality
- [X] T042 [US4] Add 401 response handling to urql client (clear auth, redirect)

**Checkpoint**: User Story 4 complete - all UI states display correctly

---

## Phase 7: User Story 3 - Manage API Keys (Priority: P2)

**Goal**: Create, list, and revoke API keys for MCP access

**Independent Test**: Create key → see in list → revoke → gone from list

### Implementation for User Story 3

- [X] T043 [US3] Create apps/web/src/pages/Settings.tsx with API keys section
- [X] T044 [US3] Implement API keys list with urql useQuery hook
- [X] T045 [US3] Create API key creation modal/form
- [X] T046 [US3] Display full key with copy button after creation
- [X] T047 [US3] Implement revoke with confirmation dialog
- [X] T048 [US3] Add optimistic UI updates for create/revoke

### Tests for User Story 3

- [X] T049 [US3] Create apps/web/tests/pages/Settings.test.tsx

**Checkpoint**: User Story 3 complete - can manage API keys

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [X] T050 Run manual validation from quickstart.md
- [X] T051 Verify test coverage meets 80% target on hooks/utilities
- [X] T052 Update apps/web/src/main.tsx to wrap app with providers
- [X] T053 Review all components for < 400 lines (per constitution)
- [X] T054 Run linter and fix any issues

**Checkpoint**: Stage 7 complete - frontend foundation ready for Stage 8

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundation
    ↓ (BLOCKS all user stories)
    ├─→ Phase 3: US1 Login (P1) ─────┐
    │                                 │
    └─→ Phase 4: US5 Protected (P1) ─┤
                                      │
                    Phase 5: US2 Nav (P1) ─┤
                                           │
                         Phase 6: US4 UI (P2) ─┤
                                               │
                              Phase 7: US3 Keys (P2) ─┤
                                                      │
                                        Phase 8: Polish
```

### User Story Dependencies

| Story | Priority | Depends On | Notes |
|-------|----------|------------|-------|
| US1 - Login | P1 | Foundation | Core auth, must be first |
| US5 - Protected Routes | P1 | US1 | Needs auth context |
| US2 - Navigation | P1 | US5 | Needs routes defined |
| US4 - UI States | P2 | Foundation | Independent |
| US3 - API Keys | P2 | US2 | Needs Settings route |

### Parallel Opportunities

Within each phase, tasks marked `[P]` can run in parallel:

- **Phase 2**: T006, T007 parallel; T008, T009 parallel
- **Phase 3**: T015, T016, T017 parallel; T022, T023 parallel
- **Phase 5**: T030, T031 parallel; T035, T036, T037 parallel
- **Phase 6**: T039, T040 parallel

---

## Task Statistics

| Metric | Count |
|--------|-------|
| **Total Tasks** | 54 |
| **Setup** | 4 |
| **Foundation** | 7 |
| **US1 - Login** | 13 |
| **US5 - Protected Routes** | 5 |
| **US2 - Navigation** | 9 |
| **US4 - UI States** | 4 |
| **US3 - API Keys** | 7 |
| **Polish** | 5 |
| **Parallel Opportunities** | 16 |
