# Implementation Plan: Stage 7 - Frontend Foundation

**Branch**: `stage-7-frontend` | **Date**: 2025-12-06 | **Spec**: [spec.md](./spec.md)

## Summary

Build the React frontend foundation with urql GraphQL client, JWT authentication, navigation shell, and API key management. The web app already has basic Vite + React + TypeScript + Tailwind scaffolding; this stage adds auth infrastructure, routing, and the Settings page.

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Language/Version** | TypeScript 5.3+ |
| **Framework** | React 18 + Vite 5 |
| **Styling** | Tailwind CSS 3.3 |
| **GraphQL Client** | urql (to add) |
| **Routing** | React Router v6 (to add) |
| **Icons** | Lucide React (from DevTool) |
| **API Endpoint** | `http://localhost:3001/graphql` (dev) |
| **Auth Method** | JWT via REST `/api/auth/login`, stored in localStorage |
| **Test Framework** | Vitest + React Testing Library (to add) |
| **Target Platform** | SPA served by Vite dev server (dev), static build (prod) |

**Performance Goals** (from spec):
- Login flow under 5 seconds
- Navigation without full page reload
- 80% test coverage on hooks/utilities

**Existing Infrastructure**:
- API has `/api/auth/login` and `/api/auth/me` REST endpoints
- GraphQL has `me` query, `apiKeys` query
- GraphQL has `createApiKey`, `revokeApiKey` mutations
- Web scaffolding has basic `App.tsx` with Tailwind

---

## Constitution Check

**Status**: PASS

Per `cloud/CLAUDE.md`:

| Requirement | Compliance |
|-------------|------------|
| React components < 400 lines | Plan splits into focused components |
| No `any` types | urql provides typed operations |
| Test coverage 80% minimum | Testing strategy defined |
| Type inference for obvious cases | Using TypeScript strict mode |
| Folder structure per app | Following `apps/web/src/` structure |

---

## Architecture Decisions

### Decision 1: GraphQL Client Selection

**Chosen**: urql

**Rationale**:
- Recommended in `frontend-design.md`
- Lightweight (~10KB) vs Apollo (~50KB)
- Built-in document caching
- Simple polling support (`pollInterval` option)
- TypeScript-first design

**Alternatives Considered**:
- Apollo Client: More features but heavier, overkill for internal tool
- Tanstack Query + graphql-request: Good but requires manual cache management
- Relay: Too complex for this use case

**Tradeoffs**:
- Pros: Simple, fast, good defaults, easy polling
- Cons: Less ecosystem than Apollo, fewer advanced features

---

### Decision 2: Auth Token Storage

**Chosen**: localStorage with React Context

**Rationale**:
- Simple implementation
- Per `authentication.md`: internal team tool, no XSS concerns
- Persists across browser sessions
- Easy to clear on logout

**Alternatives Considered**:
- httpOnly cookies: More secure but requires API changes, CSRF handling
- sessionStorage: Doesn't persist across tabs/sessions

**Tradeoffs**:
- Pros: Simple, persists, no API changes needed
- Cons: Vulnerable to XSS (acceptable for internal tool)

---

### Decision 3: Routing Library

**Chosen**: React Router v6

**Rationale**:
- Industry standard for React SPAs
- Good TypeScript support
- Simple protected route pattern
- Supports URL-based navigation state

**Alternatives Considered**:
- TanStack Router: Excellent but newer, less familiar
- Wouter: Simpler but missing features we need

---

### Decision 4: UI Component Approach

**Chosen**: Custom components with Tailwind + Lucide icons

**Rationale**:
- Consistent with DevTool patterns (can reference existing code)
- No component library dependency
- Full control over styling
- DevTool uses Lucide React icons already

**Alternatives Considered**:
- Headless UI: Good for accessibility but adds dependency
- shadcn/ui: Excellent but more setup than needed for MVP

---

## Project Structure

```
apps/web/src/
├── main.tsx              # Entry point with providers
├── App.tsx               # Router setup
├── index.css             # Tailwind imports
├── vite-env.d.ts         # Vite types
│
├── api/                  # GraphQL client setup
│   ├── client.ts         # urql client with auth
│   └── operations/       # GraphQL queries/mutations
│       ├── auth.ts       # me query
│       └── api-keys.ts   # apiKeys query, create/revoke mutations
│
├── auth/                 # Authentication
│   ├── context.tsx       # AuthContext and provider
│   ├── hooks.ts          # useAuth hook
│   └── types.ts          # Auth types
│
├── components/           # Reusable components
│   ├── layout/
│   │   ├── Header.tsx    # App header with user menu
│   │   ├── NavTabs.tsx   # Navigation tabs
│   │   └── Layout.tsx    # Main layout wrapper
│   ├── ui/
│   │   ├── Button.tsx    # Button component
│   │   ├── Input.tsx     # Form input
│   │   ├── Loading.tsx   # Loading spinner
│   │   ├── ErrorMessage.tsx  # Error display
│   │   └── EmptyState.tsx    # Empty state display
│   └── ProtectedRoute.tsx # Auth guard wrapper
│
├── pages/                # Route pages
│   ├── Login.tsx         # Login form page
│   ├── Dashboard.tsx     # Landing after login
│   ├── Definitions.tsx   # Placeholder for Stage 8
│   ├── Runs.tsx          # Placeholder for Stage 9
│   ├── Experiments.tsx   # Placeholder for Stage 10
│   └── Settings.tsx      # API key management
│
├── hooks/                # Shared hooks
│   └── usePolling.ts     # Generic polling hook (for future)
│
└── types/                # Shared types
    └── index.ts          # Common types
```

**New Dependencies to Add**:
```json
{
  "dependencies": {
    "urql": "^4.0.0",
    "graphql": "^16.8.0",
    "@urql/exchange-auth": "^2.1.6",
    "react-router-dom": "^6.21.0",
    "lucide-react": "^0.294.0"
  },
  "devDependencies": {
    "@testing-library/react": "^14.1.0",
    "@testing-library/jest-dom": "^6.1.0",
    "@testing-library/user-event": "^14.5.0",
    "jsdom": "^23.0.0"
  }
}
```

---

## Implementation Phases

### Phase 1: Core Dependencies & Client Setup

1. Add npm dependencies
2. Configure urql client with auth header injection
3. Set up Vite proxy to API (`/api` → `localhost:3001/api`, `/graphql` → `localhost:3001/graphql`)

### Phase 2: Authentication Infrastructure

1. Create AuthContext with login/logout/token management
2. Create useAuth hook
3. Implement token storage in localStorage
4. Add auth header to urql client dynamically

### Phase 3: Routing & Layout

1. Add React Router with route definitions
2. Create Layout component with Header and NavTabs
3. Implement ProtectedRoute wrapper
4. Create placeholder pages for all sections

### Phase 4: Login Page

1. Build login form UI
2. Integrate with `/api/auth/login` endpoint
3. Handle error states (invalid credentials, rate limiting)
4. Redirect to dashboard on success

### Phase 5: Navigation Shell

1. Implement Header with user info and logout
2. Implement NavTabs with active state
3. User dropdown menu with logout option

### Phase 6: UI State Components

1. Create Loading spinner component
2. Create ErrorMessage component with retry
3. Create EmptyState component

### Phase 7: Settings Page - API Keys

1. Implement API keys list with urql query
2. Create API key creation modal/form
3. Show full key once with copy button
4. Implement revoke with confirmation

### Phase 8: Testing

1. Set up Vitest for React components
2. Test AuthContext and useAuth hook
3. Test ProtectedRoute behavior
4. Test API key operations
5. Achieve 80% coverage on hooks/utilities

---

## API Integration Points

### REST Endpoints (Auth)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Login with email/password, returns JWT |
| `/api/auth/me` | GET | Get current user (validates token) |

### GraphQL Operations

**Queries**:
```graphql
query Me {
  me {
    id
    email
    name
    lastLoginAt
    createdAt
  }
}

query ApiKeys {
  apiKeys {
    id
    name
    keyPrefix
    lastUsed
    createdAt
  }
}
```

**Mutations**:
```graphql
mutation CreateApiKey($input: CreateApiKeyInput!) {
  createApiKey(input: $input) {
    apiKey {
      id
      name
      keyPrefix
      createdAt
    }
    key  # Full key, only returned once
  }
}

mutation RevokeApiKey($id: ID!) {
  revokeApiKey(id: $id)
}
```

---

## Vite Proxy Configuration

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3030,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/graphql': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

---

## Testing Strategy

**Unit Tests** (Vitest + React Testing Library):
- AuthContext: login, logout, token persistence
- useAuth hook: authentication state
- ProtectedRoute: redirect behavior
- UI components: render states

**Integration Tests**:
- Login flow: form → API → redirect
- API key CRUD: create → list → revoke

**Test Structure**:
```
apps/web/
├── src/
└── tests/
    ├── setup.ts           # Test setup (jsdom, mocks)
    ├── auth/
    │   ├── context.test.tsx
    │   └── hooks.test.tsx
    ├── components/
    │   ├── ProtectedRoute.test.tsx
    │   └── ui/
    └── pages/
        ├── Login.test.tsx
        └── Settings.test.tsx
```

---

## Error Handling Strategy

| Scenario | Handling |
|----------|----------|
| Invalid credentials | Show form error, remain on login |
| Network error | Show ErrorMessage with retry |
| 401 on any request | Clear token, redirect to login |
| Rate limited | Show "Too many attempts, try later" |
| GraphQL error | Display error message to user |

---

## Out of Scope (Deferred to Later Stages)

- Definition editor (Stage 8)
- Run dashboard (Stage 9)
- Experiment management (Stage 10)
- WebSocket/real-time updates
- Password reset flow
- Dark mode
