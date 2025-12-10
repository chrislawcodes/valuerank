# Pages and Routes

> Frontend routing and page structure for Cloud ValueRank.
>
> See also: [Components](./components.md) | [State Management](./state-management.md)

## Route Structure

Cloud ValueRank uses React Router v6 for client-side routing. All routes except `/login` require authentication.

### Route Table

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/` | `Dashboard` | Yes | Welcome page with navigation hints |
| `/login` | `Login` | No | Authentication form |
| `/definitions` | `Definitions` | Yes | List all definitions with filtering |
| `/definitions/:id` | `DefinitionDetail` | Yes | View/edit single definition |
| `/definitions/new` | `DefinitionDetail` | Yes | Create new definition (special case) |
| `/runs` | `Runs` | Yes | List all runs with filtering |
| `/runs/:id` | `RunDetail` | Yes | View run progress and results |
| `/experiments` | `Experiments` | Yes | Placeholder for Stage 10 |
| `/settings` | `Settings` | Yes | System health, models, API keys |
| `*` | Redirect to `/` | - | Catch-all for unknown routes |

### Route Configuration

Routes are defined in `apps/web/src/App.tsx`:

```tsx
<Routes>
  {/* Public routes */}
  <Route path="/login" element={<Login />} />

  {/* Protected routes with layout */}
  <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
  <Route path="/definitions" element={<ProtectedLayout><Definitions /></ProtectedLayout>} />
  <Route path="/definitions/:id" element={<ProtectedLayout><DefinitionDetail /></ProtectedLayout>} />
  <Route path="/runs" element={<ProtectedLayout><Runs /></ProtectedLayout>} />
  <Route path="/runs/:id" element={<ProtectedLayout><RunDetail /></ProtectedLayout>} />
  <Route path="/experiments" element={<ProtectedLayout><Experiments /></ProtectedLayout>} />
  <Route path="/settings" element={<ProtectedLayout><Settings /></ProtectedLayout>} />

  {/* Catch-all redirect */}
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

---

## Protected Routes

Authentication is enforced via the `ProtectedRoute` wrapper component:

```tsx
// components/ProtectedRoute.tsx
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
```

Key behaviors:
- Shows loading spinner while checking auth state
- Redirects to `/login` if not authenticated
- Preserves intended destination in `location.state.from` for post-login redirect
- The `Login` page reads this state and redirects back after successful auth

---

## Layout Structure

Protected pages share a common layout defined in `components/layout/Layout.tsx`:

```
+--------------------------------------------------+
|                    Header                         |  <- Logo + User menu
+--------------------------------------------------+
|  Definitions  |  Runs  |  Experiments  | Settings |  <- NavTabs
+--------------------------------------------------+
|                                                   |
|                  Page Content                     |
|                                                   |
+--------------------------------------------------+
```

### Layout Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `Layout` | `components/layout/Layout.tsx` | Page wrapper with header and nav |
| `Header` | `components/layout/Header.tsx` | Logo, user avatar, dropdown menu |
| `NavTabs` | `components/layout/NavTabs.tsx` | Main navigation tabs |

### Navigation Tabs

The main navigation is defined in `NavTabs.tsx`:

```tsx
const tabs = [
  { name: 'Definitions', path: '/definitions', icon: FileText },
  { name: 'Runs', path: '/runs', icon: Play },
  { name: 'Experiments', path: '/experiments', icon: FlaskConical },
  { name: 'Settings', path: '/settings', icon: Settings },
];
```

Active tab is highlighted with a teal underline. Icons hide on small screens.

---

## Page Descriptions

### Login (`/login`)

**Purpose:** Authenticate users to access the application.

**Features:**
- Email/password form
- Error message display
- Auto-redirect if already authenticated
- Post-login redirect to intended destination

**Key Code:** `pages/Login.tsx`

### Dashboard (`/`)

**Purpose:** Welcome page after login.

**Features:**
- Simple welcome message
- Prompts user to navigate to Definitions or Runs

**Note:** This is intentionally minimal. Users typically navigate directly to Definitions or Runs.

**Key Code:** `pages/Dashboard.tsx`

### Definitions (`/definitions`)

**Purpose:** Browse and manage scenario definitions.

**Features:**
- List view of all definitions
- Filters: search, root-only, has-runs, tags
- Click to view definition details
- "Create New" button navigates to `/definitions/new`

**Key Components:**
- `DefinitionList` - Main list display
- `DefinitionFilters` - Filter controls
- `DefinitionCard` - Individual definition preview

**Key Code:** `pages/Definitions.tsx`

### Definition Detail (`/definitions/:id`)

**Purpose:** View, edit, fork, and run a single definition.

**Modes:**
1. **View mode** - Display definition content, tags, version tree
2. **Edit mode** - Inline editing of name, preamble, template, dimensions
3. **Create mode** - When `id === 'new'`, shows empty editor

**Features:**
- Preamble, template, and dimensions display
- Tag management (add, remove, create)
- Version tree visualization
- Expanded scenarios list (from LLM generation)
- Fork dialog for creating variants
- Delete with confirmation
- Start Run dialog with model selection
- Export as Markdown or YAML

**Key Components:**
- `DefinitionEditor` - Full editing interface
- `TagSelector` - Tag management
- `VersionTree` - Lineage visualization
- `ExpandedScenarios` - Generated scenarios list
- `ForkDialog` - Fork creation modal
- `RunForm` - Run configuration modal
- `ExportButton` - Export dropdown

**Key Code:** `pages/DefinitionDetail.tsx`

### Runs (`/runs`)

**Purpose:** Browse and filter evaluation runs.

**Features:**
- List or folder view (grouped by definition tags)
- Status filter (PENDING, RUNNING, COMPLETED, etc.)
- Tag filter (client-side)
- Pagination (flat view only)
- Click to view run details

**View Modes:**
- **Folder view** - Runs grouped by definition tags
- **Flat view** - Simple paginated list

**Key Components:**
- `RunCard` - Individual run preview
- `RunFilters` - Status/tag filters and view toggle
- `RunFolderView` - Grouped display

**Key Code:** `pages/Runs.tsx`

### Run Detail (`/runs/:id`)

**Purpose:** Monitor run progress and view results.

**Features:**
- Real-time progress (5-second polling for active runs)
- Per-model progress breakdown
- Run controls (pause, resume, cancel)
- Configuration display (models, sample percentage)
- Transcript viewer
- CSV export
- Re-run dialog (for completed/failed runs)
- Delete with confirmation
- Analysis panel (for completed runs)

**Run States:**
| State | Description | Controls Available |
|-------|-------------|-------------------|
| PENDING | Queued, not started | Cancel |
| RUNNING | Actively probing models | Pause, Cancel |
| PAUSED | Temporarily stopped | Resume, Cancel |
| SUMMARIZING | Post-probe processing | - |
| COMPLETED | Finished successfully | Re-run, Delete |
| FAILED | Errored out | Re-run, Delete |
| CANCELLED | User cancelled | Re-run, Delete |

**Key Components:**
- `RunProgress` - Progress bar with counts
- `RunControls` - Pause/resume/cancel buttons
- `RunResults` - Transcript list and export
- `RerunDialog` - Re-run configuration modal
- `AnalysisPanel` - Analysis visualizations

**Key Code:** `pages/RunDetail.tsx`

### Experiments (`/experiments`)

**Purpose:** Placeholder for the Experiment Framework (Stage 10, deferred).

**Current State:** Shows "Experiments will be displayed here. (Stage 10)" message.

**Key Code:** `pages/Experiments.tsx`

### Settings (`/settings`)

**Purpose:** System configuration and monitoring.

**Tabs:**
| Tab | Component | Purpose |
|-----|-----------|---------|
| System Health | `SystemHealth` | Queue status, worker health |
| Models | `ModelsPanel` | Available LLM providers and models |
| Infrastructure | `InfraPanel` | Environment configuration |
| API Keys | `ApiKeysPanel` | Generate keys for MCP access |

**Key Code:** `pages/Settings.tsx`

---

## Navigation Patterns

### Programmatic Navigation

Pages use `useNavigate` from React Router for programmatic navigation:

```tsx
const navigate = useNavigate();

// Navigate to a specific page
navigate('/definitions');

// Navigate with route params
navigate(`/definitions/${definition.id}`);

// Navigate back
navigate(-1);

// Replace current history entry (for redirects)
navigate('/login', { replace: true });
```

### Cross-Page Links

Common navigation patterns in the app:

| From | To | Trigger |
|------|----|---------|
| Definitions list | Definition detail | Click card |
| Definition detail | New definition | Click "Create New" |
| Definition detail | Runs list | After starting run |
| Definition detail | Run detail | After "Start Run" |
| Runs list | Run detail | Click card |
| Run detail | Definition detail | Click definition link |
| Run detail | Runs list | Click "Back to Runs" |

---

## Comparison to Original Design

The original frontend design (see `docs/preplanning/frontend-design.md`) planned features in phases:

| Feature | Planned Phase | Status |
|---------|--------------|--------|
| Login form | Phase 1 | Implemented |
| Definition Editor | Phase 1 | Implemented |
| Tag Management | Phase 1 | Implemented |
| Run Dashboard | Phase 1 | Implemented |
| Queue Controls | Phase 1 | Implemented |
| Results Viewer | Phase 1 | Implemented |
| CSV Export | Phase 1 | Implemented |
| Experiment Management | Phase 2 | Deferred (Stage 10) |
| Version Tree | Phase 2 | Implemented |
| Analysis Dashboard | Phase 3 | Implemented |
| API Key Manager | Phase 3 | Implemented |
| Run Comparison | Phase 4 | Deferred (Stage 13) |

**Key Deviations from Plan:**
- Experiment Framework deferred to focus on core run workflow
- Run Comparison deferred to focus on single-run analysis
- Deep analysis (PCA, outliers) not yet implemented

---

## Source Files

| File | Purpose |
|------|---------|
| `apps/web/src/App.tsx` | Route configuration |
| `apps/web/src/main.tsx` | App entry point |
| `apps/web/src/pages/Login.tsx` | Login page |
| `apps/web/src/pages/Dashboard.tsx` | Dashboard page |
| `apps/web/src/pages/Definitions.tsx` | Definitions list page |
| `apps/web/src/pages/DefinitionDetail.tsx` | Definition detail page |
| `apps/web/src/pages/Runs.tsx` | Runs list page |
| `apps/web/src/pages/RunDetail.tsx` | Run detail page |
| `apps/web/src/pages/Experiments.tsx` | Experiments placeholder |
| `apps/web/src/pages/Settings.tsx` | Settings page |
| `apps/web/src/components/ProtectedRoute.tsx` | Auth guard |
| `apps/web/src/components/layout/Layout.tsx` | Page layout wrapper |
| `apps/web/src/components/layout/Header.tsx` | App header |
| `apps/web/src/components/layout/NavTabs.tsx` | Main navigation |
