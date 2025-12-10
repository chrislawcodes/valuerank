# Components

> React component architecture for Cloud ValueRank.
>
> See also: [Pages and Routes](./pages-and-routes.md) | [State Management](./state-management.md)

## Component Organization

Components are organized by domain in `apps/web/src/components/`:

```
components/
├── analysis/       # Analysis visualizations and panels
├── definitions/    # Definition editing and display
├── export/         # Export functionality
├── import/         # Import functionality
├── layout/         # Page structure (Header, NavTabs)
├── runs/           # Run management and progress
├── settings/       # Settings panels
└── ui/             # Reusable UI primitives
```

---

## UI Primitives

Base components used throughout the application. Located in `components/ui/`.

### Button

Configurable button with variants and loading state.

```tsx
import { Button } from '../components/ui/Button';

<Button variant="primary" size="md" isLoading={false}>
  Submit
</Button>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` | Visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Button size |
| `isLoading` | `boolean` | `false` | Show loading spinner |

**Variants:**
- `primary` - Teal background, white text
- `secondary` - White background, gray border
- `ghost` - Transparent, teal text
- `danger` - Orange background (for destructive actions)

**Key Code:** `components/ui/Button.tsx`

### Input

Text input with label and error display.

```tsx
import { Input } from '../components/ui/Input';

<Input
  label="Email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error="Invalid email"
  placeholder="you@example.com"
/>
```

**Key Code:** `components/ui/Input.tsx`

### Loading

Loading spinner with optional text.

```tsx
import { Loading } from '../components/ui/Loading';

<Loading size="lg" text="Loading data..." />
```

**Key Code:** `components/ui/Loading.tsx`

### ErrorMessage

Error display with optional retry button.

```tsx
import { ErrorMessage } from '../components/ui/ErrorMessage';

<ErrorMessage message="Failed to load" onRetry={() => refetch()} />
```

**Key Code:** `components/ui/ErrorMessage.tsx`

### EmptyState

Placeholder for empty lists with optional action.

```tsx
import { EmptyState } from '../components/ui/EmptyState';

<EmptyState
  icon={FileText}
  title="No definitions"
  description="Create your first definition to get started."
  action={{ label: 'Create Definition', onClick: handleCreate }}
/>
```

**Key Code:** `components/ui/EmptyState.tsx`

### Tabs

Tab navigation component.

```tsx
import { Tabs } from '../components/ui/Tabs';

<Tabs
  tabs={[
    { id: 'overview', label: 'Overview', icon: <Info /> },
    { id: 'details', label: 'Details', icon: <List /> },
  ]}
  activeTab="overview"
  onChange={setActiveTab}
/>
```

**Key Code:** `components/ui/Tabs.tsx`

---

## Definition Components

Components for creating, editing, and displaying scenario definitions. Located in `components/definitions/`.

### DefinitionEditor

Full-featured editor for definition content (preamble, template, dimensions).

**Features:**
- Name input with validation
- Preamble textarea
- Template editor with placeholder autocomplete
- Dimension management (add, edit, remove)
- Canonical dimension quick-add chips
- Live scenario preview
- Inheritance indicators for forked definitions

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `mode` | `'create' \| 'edit'` | Editor mode |
| `initialName` | `string` | Starting name value |
| `initialContent` | `DefinitionContent` | Starting content |
| `onSave` | `(name, content) => Promise<void>` | Save callback |
| `onCancel` | `() => void` | Cancel callback |
| `isSaving` | `boolean` | Loading state |
| `isForked` | `boolean` | Whether definition is a fork |
| `parentName` | `string` | Parent definition name |
| `overrides` | `DefinitionOverrides` | Which fields are locally overridden |

**Key Code:** `components/definitions/DefinitionEditor.tsx`

### DefinitionList

List view of definitions with filtering and view modes.

**Features:**
- Flat list or folder view (grouped by tags)
- Search, filter by root-only, has-runs, tags
- Drag-and-drop Markdown import
- Create new button

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `definitions` | `Definition[]` | Definitions to display |
| `loading` | `boolean` | Loading state |
| `error` | `Error \| null` | Error state |
| `onCreateNew` | `() => void` | Create button handler |
| `filters` | `DefinitionFilterState` | Active filters |
| `onFiltersChange` | `(filters) => void` | Filter change handler |

**Key Code:** `components/definitions/DefinitionList.tsx`

### DefinitionCard

Individual definition preview in list view.

**Displays:**
- Name with icon
- Tags (chips)
- Scenario count, run count
- Fork indicator (if forked)
- Creation date

**Key Code:** `components/definitions/DefinitionCard.tsx`

### DefinitionFilters

Filter controls for definition list.

**Filters:**
- Search (text input)
- Root only (checkbox)
- Has runs (checkbox)
- Tags (multi-select)

**Key Code:** `components/definitions/DefinitionFilters.tsx`

### VersionTree

Tree visualization of definition lineage (parent/child relationships).

**Features:**
- ASCII-art style tree display
- Highlights current definition
- Click to navigate to other versions
- Shows fork relationships

**Key Code:** `components/definitions/VersionTree.tsx`

### ExpandedScenarios

Displays LLM-generated scenarios for a definition.

**Features:**
- Lists generated scenarios with dimension values
- Shows expansion status (pending, active, completed)
- Pagination for large scenario sets
- Regenerate button

**Key Code:** `components/definitions/ExpandedScenarios.tsx`

### ForkDialog

Modal for creating a fork of a definition.

**Key Code:** `components/definitions/ForkDialog.tsx`

### TagSelector

Tag management component for adding/removing tags.

**Features:**
- Shows current tags
- Shows inherited tags (from parent definition)
- Dropdown to add existing tags
- Create new tag inline

**Key Code:** `components/definitions/TagSelector.tsx`

### DimensionEditor

Editor for a single dimension with levels.

**Features:**
- Name input
- Level management (add, edit, remove)
- Score, label, description, options per level
- Drag-to-reorder (future)

**Key Code:** `components/definitions/DimensionEditor.tsx`

### TemplateEditor

Rich text editor for scenario templates with placeholder autocomplete.

**Features:**
- Type `[` to trigger autocomplete for dimension names
- Click placeholder chips to insert
- Syntax highlighting for placeholders

**Key Code:** `components/definitions/TemplateEditor.tsx`

### CanonicalDimensionChips

Quick-add chips for canonical dimensions (severity, urgency, etc.).

**Key Code:** `components/definitions/CanonicalDimensionChips.tsx`

### ScenarioPreview

Live preview of generated scenarios from template + dimensions.

**Key Code:** `components/definitions/ScenarioPreview.tsx`

---

## Run Components

Components for run management and progress tracking. Located in `components/runs/`.

### RunForm

Form for configuring and starting a new run.

**Features:**
- Model selection (checkboxes grouped by provider)
- Sample percentage selection (1%, 10%, 25%, 50%, 100%)
- Run summary preview (models x scenarios = total jobs)
- Advanced options (collapsed by default)

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `definitionId` | `string` | Definition to run against |
| `scenarioCount` | `number` | Total scenarios available |
| `onSubmit` | `(input) => Promise<void>` | Submit callback |
| `onCancel` | `() => void` | Cancel callback |
| `isSubmitting` | `boolean` | Loading state |

**Key Code:** `components/runs/RunForm.tsx`

### RunProgress

Progress display with status badge and progress bar.

**Features:**
- Status badge (PENDING, RUNNING, PAUSED, etc.)
- Progress bar with percentage
- Completed/failed/pending counts
- Per-model breakdown (optional)
- Warning for failed jobs

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `run` | `Run` | Run data with progress |
| `showPerModel` | `boolean` | Show per-model breakdown |

**Key Code:** `components/runs/RunProgress.tsx`

### RunControls

Pause/resume/cancel buttons for active runs.

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `runId` | `string` | Run ID |
| `status` | `RunStatus` | Current status |
| `onPause` | `(id) => Promise<void>` | Pause handler |
| `onResume` | `(id) => Promise<void>` | Resume handler |
| `onCancel` | `(id) => Promise<void>` | Cancel handler |

**Key Code:** `components/runs/RunControls.tsx`

### RunCard

Individual run preview in list view.

**Displays:**
- Definition name
- Status badge
- Progress indicator
- Model count
- Creation date

**Key Code:** `components/runs/RunCard.tsx`

### RunFilters

Filter controls for run list.

**Filters:**
- Status (dropdown)
- Tags (multi-select, filters by definition tags)
- View mode (flat/folder)

**Key Code:** `components/runs/RunFilters.tsx`

### RunFolderView

Grouped view of runs by definition tags.

**Key Code:** `components/runs/RunFolderView.tsx`

### RunResults

Results display for completed runs.

**Features:**
- Transcript list with expand/collapse
- CSV export button
- Transcript viewer modal

**Key Code:** `components/runs/RunResults.tsx`

### TranscriptList

List of transcripts from a run.

**Key Code:** `components/runs/TranscriptList.tsx`

### TranscriptViewer

Modal for viewing a single transcript.

**Key Code:** `components/runs/TranscriptViewer.tsx`

### ModelSelector

Model selection UI grouped by provider.

**Features:**
- Groups models by provider (OpenAI, Anthropic, etc.)
- Shows availability status
- Select all/none per provider
- Highlights default models

**Key Code:** `components/runs/ModelSelector.tsx`

### RerunDialog

Modal for re-running a completed run with modified configuration.

**Key Code:** `components/runs/RerunDialog.tsx`

---

## Analysis Components

Components for displaying analysis results. Located in `components/analysis/`.

### AnalysisPanel

Main container for all analysis visualizations.

**Features:**
- Summary stats (models, samples, type, status)
- Warning banners
- Filter controls (model selection, value selection)
- Tabbed interface:
  - **Overview** - Per-model statistics
  - **Decisions** - Decision distribution, model consistency
  - **Scenarios** - Scenario heatmap, contested scenarios
  - **Values** - Win rates, dimension impact
  - **Agreement** - Model comparison matrix
  - **Methods** - Statistical methods documentation
- Recompute button

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `runId` | `string` | Run ID to analyze |
| `analysisStatus` | `string` | Current analysis status |

**Key Code:** `components/analysis/AnalysisPanel.tsx`

### StatCard

Simple stat display card.

**Key Code:** `components/analysis/StatCard.tsx`

### ScoreDistributionChart

Bar chart showing win rates by value across models.

**Key Code:** `components/analysis/ScoreDistributionChart.tsx`

### VariableImpactChart

Chart showing which dimensions have the most impact on scores.

**Key Code:** `components/analysis/VariableImpactChart.tsx`

### ModelComparisonMatrix

Heatmap showing agreement between model pairs.

**Key Code:** `components/analysis/ModelComparisonMatrix.tsx`

### ModelConsistencyChart

Bar/line combo showing average decision and standard deviation per model.

**Key Code:** `components/analysis/ModelConsistencyChart.tsx`

### DecisionDistributionChart

Stacked bar showing decision 1-5 counts per model.

**Key Code:** `components/analysis/DecisionDistributionChart.tsx`

### ScenarioHeatmap

Heatmap of model behavior across scenarios.

**Key Code:** `components/analysis/ScenarioHeatmap.tsx`

### ContestedScenariosList

List of scenarios with highest model disagreement.

**Key Code:** `components/analysis/ContestedScenariosList.tsx`

### MethodsDocumentation

Documentation of statistical methods used in analysis.

**Key Code:** `components/analysis/MethodsDocumentation.tsx`

### AnalysisFilters

Filter controls for analysis views.

**Key Code:** `components/analysis/AnalysisFilters.tsx`

---

## Settings Components

Components for the settings page. Located in `components/settings/`.

### SystemHealth

System health and queue status display.

**Key Code:** `components/settings/SystemHealth.tsx`

### QueueStatus

Queue statistics and job counts.

**Key Code:** `components/settings/QueueStatus.tsx`

### ModelsPanel

Available LLM providers and models configuration.

**Features:**
- Provider status (available/unavailable)
- Model list per provider
- Default model indicators

**Key Code:** `components/settings/ModelsPanel.tsx`

### InfraPanel

Infrastructure and environment display.

**Key Code:** `components/settings/InfraPanel.tsx`

### ProviderStatus

Provider health check display.

**Key Code:** `components/settings/ProviderStatus.tsx`

### ApiKeysPanel

API key management for MCP access.

**Features:**
- List existing keys (prefix only, full key not stored)
- Create new key (with copy-to-clipboard modal)
- Revoke key with confirmation
- Shows last used timestamp

**Key Code:** `components/settings/ApiKeysPanel.tsx`

---

## Layout Components

Page structure components. Located in `components/layout/`.

### Layout

Main page wrapper with header and navigation.

```tsx
<Layout>
  <PageContent />
</Layout>
```

**Key Code:** `components/layout/Layout.tsx`

### Header

App header with logo and user menu.

**Features:**
- ValueRank logo
- User avatar with initials
- Dropdown with sign out

**Key Code:** `components/layout/Header.tsx`

### NavTabs

Main navigation tabs.

**Tabs:** Definitions, Runs, Experiments, Settings

**Key Code:** `components/layout/NavTabs.tsx`

---

## Export/Import Components

### ExportButton

Dropdown button for exporting definitions.

**Export formats:**
- Definition as Markdown
- Scenarios as YAML

**Key Code:** `components/export/ExportButton.tsx`

### ImportDialog

Dialog for importing definitions from Markdown.

**Features:**
- File drag-and-drop
- Name conflict handling
- Validation error display

**Key Code:** `components/import/ImportDialog.tsx`

---

## Protected Route

Authentication guard component.

```tsx
<ProtectedRoute>
  <PrivateContent />
</ProtectedRoute>
```

**Behavior:**
- Shows loading spinner while checking auth
- Redirects to `/login` if not authenticated
- Passes through children if authenticated

**Key Code:** `components/ProtectedRoute.tsx`

---

## Component Patterns

### Loading States

All data-fetching components follow this pattern:

```tsx
if (loading) {
  return <Loading text="Loading..." />;
}

if (error) {
  return <ErrorMessage message={error.message} />;
}

if (!data) {
  return <EmptyState title="No data" />;
}

return <DataDisplay data={data} />;
```

### Modal Dialogs

Modals use a consistent structure:

```tsx
{showModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
      {/* Modal content */}
    </div>
  </div>
)}
```

### Form Handling

Forms use controlled components with local state:

```tsx
const [value, setValue] = useState('');
const [isSubmitting, setIsSubmitting] = useState(false);

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsSubmitting(true);
  await onSubmit(value);
  setIsSubmitting(false);
};
```

---

## Comparison to Original Design

The original frontend design (see `docs/preplanning/frontend-design.md`) planned these component categories:

| Planned Category | Status | Notes |
|-----------------|--------|-------|
| `auth/` components | Implemented | Login form, API key manager |
| `definitions/` components | Implemented | Full CRUD, versioning, forking |
| `runs/` components | Implemented | Progress, controls, results |
| `analysis/` components | Implemented | Charts, stats, methods |
| `comparison/` components | Deferred | Run comparison (Stage 13) |
| `experiments/` components | Deferred | Experiment framework (Stage 10) |
| `queue/` components | Implemented | In settings panel |

**Key Deviations:**
- `comparison/` components not built (feature deferred)
- `experiments/` components not built (feature deferred)
- Analysis components expanded with more visualization types

---

## Source Files Summary

| Directory | Component Count | Purpose |
|-----------|----------------|---------|
| `ui/` | 6 | Reusable primitives |
| `definitions/` | 14 | Definition management |
| `runs/` | 11 | Run management |
| `analysis/` | 11 | Analysis visualization |
| `settings/` | 6 | Settings panels |
| `layout/` | 3 | Page structure |
| `export/` | 1 | Export functionality |
| `import/` | 1 | Import functionality |
