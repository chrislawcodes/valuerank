# Feature Specification: Stage 7 - Frontend Foundation

> **Feature #005** | Branch: `stage-7-frontend`
> **Created**: 2025-12-06
> **Status**: Draft
> **Dependencies**: Stage 4 (Authentication System) - Complete

## Overview

Build the React frontend foundation with authentication, navigation shell, and core UI infrastructure. This stage creates the web application shell that all subsequent UI stages will build upon.

**Input Description**: Set up React frontend with auth, navigation shell, and core layout. Includes urql GraphQL client with auth headers, login page, auth context, global navigation shell (header, tabs), protected route wrapper, API key management page, and basic empty/loading/error states.

---

## User Stories & Testing

### User Story 1 - Login to Web Application (Priority: P1)

As a team member, I need to log in to the web application with my email and password so that I can access the ValueRank platform securely.

**Why this priority**: Core functionality - users cannot access any features without authentication. System is completely unusable without this.

**Independent Test**: Navigate to the application URL, see login form, enter valid credentials, successfully reach the dashboard.

**Acceptance Scenarios**:

1. **Given** I am not logged in, **When** I navigate to the application, **Then** I am redirected to the login page
2. **Given** I am on the login page, **When** I enter valid email/password and submit, **Then** I am redirected to the main dashboard
3. **Given** I am on the login page, **When** I enter invalid credentials, **Then** I see an error message and remain on the login page
4. **Given** I have logged in previously (token in storage), **When** I open the application in a new tab, **Then** I am automatically logged in without re-entering credentials
5. **Given** my JWT token has expired, **When** I try to access a protected page, **Then** I am redirected to the login page

---

### User Story 2 - Navigate Between Main Sections (Priority: P1)

As a logged-in user, I need a consistent navigation shell to move between Definitions, Runs, Experiments, and Settings so that I can efficiently access all areas of the application.

**Why this priority**: Core functionality - without navigation, users cannot access any features even after logging in.

**Independent Test**: After login, verify navigation tabs are visible and clicking each tab shows the corresponding section.

**Acceptance Scenarios**:

1. **Given** I am logged in, **When** the page loads, **Then** I see a header with the application name and my user info
2. **Given** I am on any page, **When** I look at the navigation, **Then** I see tabs for Definitions, Runs, Experiments, and Settings
3. **Given** I am on the Definitions tab, **When** I click the Runs tab, **Then** I navigate to the Runs section and the tab is visually highlighted
4. **Given** I am logged in, **When** I click my user menu, **Then** I see a logout option
5. **Given** I am logged in, **When** I click logout, **Then** I am logged out and redirected to the login page

---

### User Story 3 - Manage API Keys for MCP Access (Priority: P2)

As a user, I need to create and manage API keys so that I can connect external tools (Claude Desktop, Cursor) to the ValueRank API via MCP.

**Why this priority**: Important for MCP integration but the system functions without it. Users can still use the web UI for all operations.

**Independent Test**: Navigate to Settings, create an API key, verify it's listed, revoke it.

**Acceptance Scenarios**:

1. **Given** I am on the Settings page, **When** I click "Create API Key", **Then** I see a form to name the key
2. **Given** I am creating an API key, **When** I submit a name, **Then** I see the full key value displayed with a copy button
3. **Given** I have created an API key, **When** I view my API keys list, **Then** I see the key name, prefix (not full key), and creation date
4. **Given** I am viewing my API keys, **When** I click "Revoke" on a key, **Then** the key is removed from the list after confirmation
5. **Given** I have just created an API key, **When** I navigate away and return, **Then** I can only see the key prefix (not the full key)

---

### User Story 4 - See Appropriate UI States (Priority: P2)

As a user, I need to see clear loading indicators, empty states, and error messages so that I always understand what the application is doing.

**Why this priority**: Important for UX but system functions without polished states. Impacts user confidence and experience.

**Independent Test**: Trigger each state (loading, empty, error) and verify appropriate UI is displayed.

**Acceptance Scenarios**:

1. **Given** data is being fetched, **When** I am waiting, **Then** I see a loading spinner or skeleton
2. **Given** a list has no items, **When** the page loads, **Then** I see a helpful empty state message (not a blank page)
3. **Given** a network error occurs, **When** a request fails, **Then** I see an error message with option to retry
4. **Given** I receive a GraphQL error, **When** viewing the page, **Then** the error is displayed in a user-friendly format

---

### User Story 5 - Protected Routes Redirect (Priority: P1)

As a developer building future features, I need a protected route wrapper that automatically handles auth redirects so that I can easily secure new pages.

**Why this priority**: Core infrastructure - without this, all future pages would need to implement auth checking individually, leading to bugs and inconsistency.

**Independent Test**: Access a protected route without auth, verify redirect to login. Access with auth, verify page loads.

**Acceptance Scenarios**:

1. **Given** I am not authenticated, **When** I navigate to /definitions, **Then** I am redirected to /login
2. **Given** I am not authenticated, **When** I try to access /settings, **Then** I am redirected to /login
3. **Given** I am authenticated, **When** I navigate to /definitions, **Then** the page loads normally
4. **Given** I am authenticated, **When** I navigate to /login, **Then** I am redirected to the dashboard (already logged in)

---

## Edge Cases

### Authentication Edge Cases
- **Token expires during active session**: Show toast notification and redirect to login (don't lose unsaved work if possible)
- **Multiple tabs with same session**: Logout in one tab should reflect in others (via localStorage event)
- **Rate limiting hit on login**: Display user-friendly message indicating too many attempts
- **Network offline during auth check**: Show offline indicator, retry when back online

### Navigation Edge Cases
- **Direct URL access to protected route**: Redirect to login, then back to intended route after auth
- **Browser back button after logout**: Should stay on login page, not show cached protected content
- **Page refresh on protected route**: Should maintain auth state and reload same page

### API Key Edge Cases
- **Maximum API keys reached** (if limit exists): Show message and disable create button
- **Attempt to copy key that was never saved**: Not possible - key only shown once at creation
- **Revoke last API key**: Allow it - user can create new ones

### Error State Edge Cases
- **GraphQL query partially fails**: Show available data with error indicator for failed portions
- **401 response on any request**: Clear auth state and redirect to login
- **500 server error**: Show generic error with retry option

---

## Functional Requirements

### Authentication
- **FR-001**: System MUST provide a login form accepting email and password
- **FR-002**: System MUST store JWT token in localStorage after successful login
- **FR-003**: System MUST inject Authorization header with Bearer token on all GraphQL requests
- **FR-004**: System MUST clear auth state and redirect to login when token is invalid or expired
- **FR-005**: System MUST provide a logout function that clears stored credentials

### Navigation
- **FR-006**: System MUST display a persistent header with application branding
- **FR-007**: System MUST display navigation tabs for: Definitions, Runs, Experiments, Settings
- **FR-008**: System MUST visually indicate the currently active navigation tab
- **FR-009**: System MUST display current user info (name or email) in the header
- **FR-010**: System MUST provide logout action accessible from header user menu

### Protected Routes
- **FR-011**: System MUST redirect unauthenticated users to /login for all protected routes
- **FR-012**: System MUST preserve intended destination and redirect after successful login
- **FR-013**: System MUST redirect authenticated users away from /login to dashboard

### API Key Management
- **FR-014**: System MUST list user's API keys showing name, prefix, created date
- **FR-015**: System MUST allow creating new API keys with a name
- **FR-016**: System MUST display full key value only once at creation with copy functionality
- **FR-017**: System MUST allow revoking API keys with confirmation prompt
- **FR-018**: System MUST update the API keys list immediately after create/revoke

### GraphQL Client
- **FR-019**: System MUST configure urql client with API endpoint
- **FR-020**: System MUST include auth headers on all authenticated requests
- **FR-021**: System MUST handle 401 responses by clearing auth and redirecting to login

### UI States
- **FR-022**: System MUST display loading indicator during data fetches
- **FR-023**: System MUST display meaningful empty state when lists have no items
- **FR-024**: System MUST display user-friendly error messages on request failures
- **FR-025**: System MUST provide retry action for transient errors

---

## Success Criteria

- **SC-001**: User can complete login flow in under 5 seconds on normal network
- **SC-002**: Auth state persists correctly across browser refresh (no re-login required)
- **SC-003**: Navigation between all 4 main sections works without full page reload
- **SC-004**: API key creation displays full key immediately and copy works on first click
- **SC-005**: All routes are protected - no authenticated content visible to unauthenticated users
- **SC-006**: Error states are always shown (no silent failures or blank screens)
- **SC-007**: 80% code coverage on hooks and utility functions
- **SC-008**: All components render under 400 lines (per constitution)

---

## Key Entities

### Auth Context State
```
AuthContext {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login(email, password): Promise<void>
  logout(): void
}
```

### User (from API)
```
User {
  id: string
  email: string
  name: string | null
}
```

### API Key (display)
```
ApiKey {
  id: string
  name: string
  keyPrefix: string
  createdAt: Date
  lastUsed: Date | null
}
```

---

## Assumptions

1. **JWT expiry is 24 hours** - Based on authentication.md, no refresh token flow needed for MVP
2. **Single tenant** - All logged-in users see the same data, no multi-org support
3. **No password reset flow** - Handled manually for internal team (per authentication.md)
4. **No user registration UI** - Users created via CLI (per architecture)
5. **Polling sufficient for updates** - No WebSocket needed for this stage
6. **Browser localStorage available** - No SSR/cookies complexity for internal tool
7. **4 main navigation sections** - Definitions, Runs, Experiments, Settings (per high-level.md)

---

## Constitution Validation

### Compliance Check

| Requirement | Status | Notes |
|-------------|--------|-------|
| React components < 400 lines | PASS | Spec splits into focused components |
| No `any` types | PASS | Spec requires proper TypeScript typing |
| Test coverage 80% minimum | PASS | SC-007 requires 80% coverage |
| Structured logging | N/A | Frontend uses console for development |
| Type safety | PASS | urql provides typed GraphQL operations |

### Folder Structure Compliance
Per constitution, frontend should follow:
```
apps/web/src/
├── components/       # React components
├── hooks/            # Custom hooks
├── pages/            # Route pages
├── services/         # API client functions
└── types/            # TypeScript types
```

**VALIDATION RESULT: PASS** - Spec addresses all constitutional requirements.

---

## Out of Scope

- Real-time WebSocket updates (polling is sufficient per frontend-design.md)
- Password reset UI (manual for internal team)
- User registration UI (CLI-based)
- User management UI (CLI-based)
- Complex role-based permissions (all users are equal)
- Multi-tenancy support
- Offline mode / service workers
- Definition editor (Stage 8)
- Run dashboard (Stage 9)
