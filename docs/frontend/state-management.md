# State Management

> Data fetching, caching, and state patterns in Cloud ValueRank.
>
> See also: [Pages and Routes](./pages-and-routes.md) | [Components](./components.md)

## Overview

Cloud ValueRank uses a simple state management approach:

| Concern | Solution |
|---------|----------|
| Server state (GraphQL) | urql |
| Authentication | React Context |
| UI state | Local component state (`useState`) |

This avoids complexity from global state managers like Redux or Zustand.

---

## urql GraphQL Client

The frontend uses [urql](https://formidable.com/open-source/urql/) for GraphQL data fetching.

### Client Setup

The urql client is configured in `api/client.ts`:

```typescript
import { createClient, cacheExchange, fetchExchange, mapExchange } from 'urql';
import { getStoredToken, clearStoredToken } from '../auth/context';

// Custom exchange to handle 401 responses
const authErrorExchange = mapExchange({
  onResult(result) {
    if (result.error?.graphQLErrors?.some((e) => e.extensions?.code === 'UNAUTHORIZED')) {
      clearStoredToken();
      window.location.href = '/login';
    }
    return result;
  },
});

export const client = createClient({
  url: '/graphql',
  exchanges: [cacheExchange, authErrorExchange, fetchExchange],
  fetchOptions: () => {
    const token = getStoredToken();
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  },
});
```

**Key Features:**
- Automatic auth header injection
- 401 response handling (redirect to login)
- Document caching via `cacheExchange`

### Provider Setup

The client is provided at the app root in `App.tsx`:

```tsx
import { Provider } from 'urql';
import { client } from './api/client';

function App() {
  return (
    <Provider value={client}>
      <AuthProvider>
        <Routes>...</Routes>
      </AuthProvider>
    </Provider>
  );
}
```

---

## Authentication Context

Authentication state is managed via React Context in `auth/context.tsx`.

### AuthContext Shape

```typescript
type AuthContextValue = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};
```

### AuthProvider

The `AuthProvider` wraps the app and manages:
- Token storage in `localStorage`
- Token validation on mount
- Login/logout actions

```tsx
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('valuerank_token');
    if (storedToken) {
      validateToken(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    localStorage.setItem('valuerank_token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('valuerank_token');
    setToken(null);
    setUser(null);
  };

  // ...
}
```

### useAuth Hook

Components access auth state via the `useAuth` hook:

```typescript
import { useAuth } from '../auth/hooks';

function MyComponent() {
  const { user, isAuthenticated, logout } = useAuth();
  // ...
}
```

**Key Code:**
- `auth/context.tsx` - AuthProvider and context
- `auth/hooks.ts` - useAuth hook
- `auth/types.ts` - Type definitions

---

## Custom Hooks

Data fetching is encapsulated in custom hooks located in `hooks/`. All hooks follow a consistent pattern.

### Hook Pattern

```typescript
type UseEntityOptions = {
  id: string;
  pause?: boolean;
};

type UseEntityResult = {
  entity: Entity | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useEntity({ id, pause = false }: UseEntityOptions): UseEntityResult {
  const [result, reexecuteQuery] = useQuery({
    query: ENTITY_QUERY,
    variables: { id },
    pause,
  });

  return {
    entity: result.data?.entity ?? null,
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: () => reexecuteQuery({ requestPolicy: 'network-only' }),
  };
}
```

### Available Hooks

#### Data Fetching Hooks

| Hook | Purpose | Polling |
|------|---------|---------|
| `useDefinition` | Fetch single definition | No |
| `useDefinitions` | Fetch definition list with filters | No |
| `useRun` | Fetch single run | Yes (5s when active) |
| `useRuns` | Fetch run list with filters | No |
| `useAnalysis` | Fetch run analysis | Yes (3s when computing) |
| `useTags` | Fetch all tags | No |
| `useVersionTree` | Fetch definition lineage | No |
| `useExpandedScenarios` | Fetch generated scenarios | No |
| `useAvailableModels` | Fetch LLM models | No |
| `useSystemHealth` | Fetch queue status | No |
| `useScenarioPreview` | Preview scenarios from template | No |

#### Mutation Hooks

| Hook | Purpose | Operations |
|------|---------|------------|
| `useDefinitionMutations` | Definition CRUD | create, update, fork, delete |
| `useRunMutations` | Run control | start, pause, resume, cancel, delete |

---

## Polling Pattern

Some hooks implement polling for data that changes over time.

### useRun Polling

The `useRun` hook polls every 5 seconds when the run is in an active state:

```typescript
export function useRun({ id, pause, enablePolling = true }: UseRunOptions): UseRunResult {
  const [result, reexecuteQuery] = useQuery({ query: RUN_QUERY, variables: { id }, pause });
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const run = result.data?.run ?? null;
  const isActive = run?.status === 'PENDING' || run?.status === 'RUNNING' || run?.status === 'SUMMARIZING';

  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    if (enablePolling && isActive && !pause) {
      pollIntervalRef.current = setInterval(() => {
        reexecuteQuery({ requestPolicy: 'network-only' });
      }, 5000);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [enablePolling, isActive, pause, reexecuteQuery]);

  // ...
}
```

**When polling stops:**
- Run reaches terminal state (COMPLETED, FAILED, CANCELLED)
- Component unmounts
- `pause` becomes `true`
- `enablePolling` is `false`

### useAnalysis Polling

The `useAnalysis` hook polls every 3 seconds when analysis is computing:

```typescript
const shouldPoll = analysisStatus === 'pending' || analysisStatus === 'computing';

useEffect(() => {
  if (enablePolling && shouldPoll && !pause) {
    pollIntervalRef.current = setInterval(() => {
      reexecuteQuery({ requestPolicy: 'network-only' });
    }, 3000);
  }
  // ...
}, [enablePolling, shouldPoll, pause, reexecuteQuery]);
```

---

## Mutation Hooks

Mutations are organized into domain-specific hooks that wrap `useMutation`.

### useDefinitionMutations

```typescript
export function useDefinitionMutations(): UseDefinitionMutationsResult {
  const [createResult, executeCreate] = useMutation(CREATE_DEFINITION_MUTATION);
  const [updateResult, executeUpdate] = useMutation(UPDATE_DEFINITION_MUTATION);
  const [forkResult, executeFork] = useMutation(FORK_DEFINITION_MUTATION);
  const [deleteResult, executeDelete] = useMutation(DELETE_DEFINITION_MUTATION);

  const createDefinition = async (input: CreateDefinitionInput): Promise<Definition> => {
    const result = await executeCreate({ input });
    if (result.error) throw new Error(result.error.message);
    return result.data.createDefinition;
  };

  // Similar pattern for update, fork, delete...

  return {
    createDefinition,
    updateDefinition,
    forkDefinition,
    deleteDefinition,
    isCreating: createResult.fetching,
    isUpdating: updateResult.fetching,
    isForking: forkResult.fetching,
    isDeleting: deleteResult.fetching,
    error: createResult.error || updateResult.error || forkResult.error || deleteResult.error,
  };
}
```

**Usage in components:**

```tsx
function DefinitionDetail() {
  const { createDefinition, isCreating } = useDefinitionMutations();

  const handleSave = async (name: string, content: DefinitionContent) => {
    const newDefinition = await createDefinition({ name, content });
    navigate(`/definitions/${newDefinition.id}`);
  };

  return <DefinitionEditor onSave={handleSave} isSaving={isCreating} />;
}
```

### useRunMutations

```typescript
export function useRunMutations() {
  return {
    startRun: async (input: StartRunInput) => { /* ... */ },
    pauseRun: async (id: string) => { /* ... */ },
    resumeRun: async (id: string) => { /* ... */ },
    cancelRun: async (id: string) => { /* ... */ },
    deleteRun: async (id: string) => { /* ... */ },
    loading: boolean,
    error: Error | null,
  };
}
```

---

## GraphQL Operations

GraphQL queries and mutations are defined in `api/operations/`.

### File Organization

```
api/operations/
├── analysis.ts      # Analysis queries/types
├── api-keys.ts      # API key CRUD
├── auth.ts          # Auth types
├── definitions.ts   # Definition queries/mutations/types
├── health.ts        # Health check queries
├── llm.ts           # LLM provider queries
├── models.ts        # Model queries
├── runs.ts          # Run queries/mutations/types
├── scenarios.ts     # Scenario queries
└── tags.ts          # Tag queries/mutations
```

### Operation Pattern

Each file exports:
1. **Types** - TypeScript types for entities
2. **Queries** - GraphQL query strings (using `gql` tag)
3. **Mutations** - GraphQL mutation strings
4. **Result types** - Types for query/mutation results

Example from `definitions.ts`:

```typescript
// Types
export type Definition = {
  id: string;
  name: string;
  content: DefinitionContent;
  // ...
};

// Query
export const DEFINITION_QUERY = gql`
  query Definition($id: ID!) {
    definition(id: $id) {
      id
      name
      content
      tags { id name }
      # ...
    }
  }
`;

// Query result type
export type DefinitionQueryResult = {
  definition: Definition | null;
};

// Mutation
export const CREATE_DEFINITION_MUTATION = gql`
  mutation CreateDefinition($input: CreateDefinitionInput!) {
    createDefinition(input: $input) {
      id
      name
      # ...
    }
  }
`;

// Mutation result type
export type CreateDefinitionResult = {
  createDefinition: Definition;
};
```

---

## Local Component State

UI-specific state is managed with `useState` in components:

```tsx
function DefinitionList() {
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    rootOnly: false,
    tagIds: [],
  });

  // View mode state
  const [viewMode, setViewMode] = useState<'flat' | 'folder'>('folder');

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // ...
}
```

**When to use local state:**
- Form inputs
- UI toggles (modals, dropdowns, tabs)
- Temporary states (loading, errors)
- Filter/sort preferences

---

## Data Flow Example

Here's how data flows through the app for viewing a run:

```
1. User navigates to /runs/:id

2. RunDetail page renders
   └── useRun({ id }) hook called
       └── urql executes RUN_QUERY
           └── GraphQL request to /graphql with auth header

3. Server returns run data
   └── urql caches response
       └── Hook returns { run, loading: false }
           └── RunDetail renders RunProgress, RunControls, etc.

4. If run.status is RUNNING
   └── useRun starts 5-second polling
       └── Periodic refetches update the cache
           └── Components re-render with new data

5. Run completes
   └── run.status changes to COMPLETED
       └── Polling stops
           └── AnalysisPanel appears
               └── useAnalysis fetches analysis data
```

---

## Cache Behavior

urql uses document caching by default:

- **Query results are cached** by operation + variables
- **Cache is normalized** by document structure
- **Mutations don't auto-invalidate** - use `refetch()` after mutations

### Refetch Patterns

```typescript
// After mutation, refetch the parent query
const { refetch } = useDefinition({ id });

const handleUpdate = async () => {
  await updateDefinition(id, input);
  refetch();  // Refresh from server
};
```

### Network-Only Requests

For data that must be fresh:

```typescript
reexecuteQuery({ requestPolicy: 'network-only' });
```

---

## API Clients for REST Endpoints

Some functionality uses REST endpoints instead of GraphQL:

### Export API

```typescript
// api/export.ts
export async function exportRunAsCSV(runId: string): Promise<void> {
  const token = getStoredToken();
  const response = await fetch(`/api/export/run/${runId}/csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // Download file...
}

export async function exportDefinitionAsMarkdown(definitionId: string): Promise<void> {
  // ...
}
```

### Import API

```typescript
// api/import.ts
export async function importDefinitionFromMd(content: string): Promise<Definition> {
  const response = await fetch('/api/import/definition', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/markdown',
      Authorization: `Bearer ${getStoredToken()}`,
    },
    body: content,
  });
  return response.json();
}
```

---

## Comparison to Original Design

The original frontend design (see `docs/preplanning/frontend-design.md`) recommended:

| Recommendation | Implementation |
|----------------|----------------|
| urql or Apollo Client | urql chosen |
| Built-in polling | Implemented in useRun, useAnalysis |
| Optimistic updates | Not implemented (refetch pattern instead) |
| Zustand or React Context for UI state | React Context for auth; local state for UI |

**Key Deviations:**
- Optimistic updates were not implemented; simpler refetch pattern used instead
- No global UI state manager needed; local state suffices

---

## Source Files

| File | Purpose |
|------|---------|
| `api/client.ts` | urql client configuration |
| `auth/context.tsx` | AuthProvider and context |
| `auth/hooks.ts` | useAuth hook |
| `hooks/*.ts` | Custom data hooks |
| `api/operations/*.ts` | GraphQL operations |
| `api/export.ts` | REST export functions |
| `api/import.ts` | REST import functions |
