# Quickstart: Stage 8 - Definition Management UI

## Prerequisites

- [ ] Development environment running (`npm run dev` in cloud/)
- [ ] Docker PostgreSQL running (`docker-compose up -d`)
- [ ] Database migrated (`npm run db:push`)
- [ ] User account created (via CLI)
- [ ] Logged into web UI at http://localhost:3030

## Initial Setup

```bash
# Start development environment
cd cloud
npm run dev

# In separate terminal, verify API is running
curl http://localhost:3001/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'
# Should return: {"data":{"__typename":"Query"}}
```

---

## Testing User Story 1: Browse Definition Library

**Goal**: Verify definitions are listed with name, version info, creation date, and run count

### Steps

1. Navigate to http://localhost:3030
2. Log in with test credentials
3. Click "Definitions" in the navigation
4. Observe the definition list

### Expected

- [ ] Page loads without error
- [ ] If definitions exist: see cards with name, creation date, run count
- [ ] If no definitions: see empty state with "Create your first definition" CTA
- [ ] Definitions sorted by creation date (newest first)
- [ ] Loading skeleton visible while fetching

### Verification

```graphql
# Run in GraphQL playground http://localhost:3001/graphql
query {
  definitions(limit: 10) {
    id
    name
    createdAt
    runs { id }
  }
}
```

---

## Testing User Story 2: Create New Definition

**Goal**: Verify users can create definitions with preamble, template, and dimensions

### Steps

1. From Definitions page, click "New Definition" button
2. Enter name: "Test Café Dilemma"
3. Enter preamble: "You are an AI assistant reasoning about an ethical dilemma."
4. Enter template: "A café owner discovers [situation] where [severity] is at stake."
5. Add dimension "situation" with levels:
   - score: 1, label: "minor spill"
   - score: 5, label: "gas leak"
6. Add dimension "severity" with levels:
   - score: 1, label: "low risk"
   - score: 5, label: "life threatening"
7. Click "Save"

### Expected

- [ ] Editor form displays with empty fields
- [ ] Placeholders `[situation]` and `[severity]` highlighted in template
- [ ] Can add multiple dimensions with multiple levels each
- [ ] Validation error if name is empty
- [ ] Success toast/message on save
- [ ] Redirects to definition detail or back to list
- [ ] New definition appears in list

### Verification

```graphql
query {
  definitions(search: "Test Café") {
    id
    name
    content
    createdAt
  }
}
```

---

## Testing User Story 3: Edit Existing Definition

**Goal**: Verify users can modify an existing definition

### Steps

1. From Definitions list, click on a definition card
2. Click "Edit" button
3. Change the name to "Test Café Dilemma v2"
4. Modify the preamble text
5. Click "Save"

### Expected

- [ ] Editor populated with current values
- [ ] Can modify all fields (name, preamble, template, dimensions)
- [ ] Changes persist after save
- [ ] `updatedAt` timestamp changes
- [ ] Success confirmation shown

### Edge Case - Unsaved Changes

1. Make changes to a definition
2. Click navigation to leave the page
3. Expect: Browser prompt "You have unsaved changes. Leave anyway?"

---

## Testing User Story 4: Fork Definition

**Goal**: Verify users can create a variant of an existing definition

### Steps

1. View an existing definition
2. Click "Fork" button
3. Enter label: "softer-framing"
4. Click "Create Fork"

### Expected

- [ ] Fork dialog appears with label input
- [ ] New definition created with parent reference
- [ ] Forked definition has same content as original
- [ ] Version tree shows parent-child relationship
- [ ] Original definition unchanged

### Verification

```graphql
query {
  definition(id: "<forked-id>") {
    id
    name
    parentId
    parent {
      id
      name
    }
  }
}
```

---

## Testing User Story 5: Manage Tags

**Goal**: Verify tag creation, assignment, and filtering works

### Steps

1. Create a definition (or use existing)
2. Click "Add Tag" on the definition
3. Type "safety-scenarios" and create the tag
4. Assign the tag
5. Return to definition list
6. Click the tag filter chip for "safety-scenarios"

### Expected

- [ ] Can create new tags from definition view
- [ ] Tag appears on definition card after assignment
- [ ] Tag appears in filter dropdown
- [ ] Filtering by tag shows only tagged definitions
- [ ] Can remove tags from definitions

### Verification

```graphql
query {
  tags {
    id
    name
    definitionCount
  }
}

query {
  definitions(tagIds: ["<tag-id>"]) {
    id
    name
    tags { id name }
  }
}
```

---

## Testing User Story 6: Search and Filter

**Goal**: Verify search and filter functionality

### Steps

1. Create several definitions with different names
2. Type "café" in the search box
3. Verify filtered results
4. Toggle "Root only" filter
5. Toggle "Has runs" filter (if runs exist)
6. Click "Clear filters"

### Expected

- [ ] Search filters in real-time (debounced)
- [ ] Search is case-insensitive
- [ ] "Root only" shows definitions without parents
- [ ] "Has runs" shows only definitions used in runs
- [ ] Filters combine with AND logic
- [ ] Clear filters resets to show all

---

## Testing User Story 7: Version Tree/Lineage

**Goal**: Verify version tree visualization

### Steps

1. Create a root definition "Root Scenario"
2. Fork it as "Child A"
3. Fork "Root Scenario" again as "Child B"
4. Fork "Child A" as "Grandchild"
5. View "Grandchild" definition
6. Look at the version tree panel

### Expected

- [ ] Tree shows: Root → Child A → Grandchild
- [ ] Child B visible as sibling of Child A
- [ ] Can click nodes to navigate to those definitions
- [ ] Hover shows details (name, date)
- [ ] Current definition highlighted in tree

### Verification

```graphql
query {
  definitionAncestors(id: "<grandchild-id>") {
    id
    name
  }

  definitionDescendants(id: "<root-id>") {
    id
    name
    parentId
  }
}
```

---

## Testing User Story 8: Preview Generated Scenarios

**Goal**: Verify scenario preview generation

### Steps

1. Create or edit a definition with 2 dimensions, each with 2 levels
2. Click "Preview Scenarios"
3. View the generated scenarios

### Expected

- [ ] Preview shows generated scenario combinations
- [ ] Each scenario shows filled template with dimension values
- [ ] Total count displayed (e.g., "4 scenarios")
- [ ] Preview updates when dimensions change (without save)
- [ ] Large combinations show sample with count (e.g., "Showing 10 of 100")

---

## Edge Case Testing

### Empty States

1. Delete all definitions
2. Visit Definitions page
3. Expected: Helpful empty state with CTA button

### Very Long Names

1. Create definition with 200+ character name
2. Expected: Truncated in list view, full name on hover/detail

### Deep Version Trees

1. Create chain of 5+ forks
2. View version tree
3. Expected: Tree renders correctly, scrollable if needed

### Concurrent Editing

1. Open same definition in two tabs
2. Edit in tab 1, save
3. Edit in tab 2, save
4. Expected: Last write wins, no data corruption

### Invalid Placeholders

1. Enter template: "A scenario with [undefined_dimension]"
2. Expected: Warning that placeholder doesn't match any dimension

---

## Troubleshooting

### Issue: GraphQL mutations fail with 401

**Fix**: Verify auth token is present in localStorage, try logging out and back in

### Issue: Tags not appearing after creation

**Fix**: Check urql cache - may need to refetch queries or invalidate cache

### Issue: Version tree not showing ancestors

**Fix**: Verify parentId is set correctly in database, check recursive query

### Issue: Syntax highlighting not working

**Fix**: Verify regex pattern for `[placeholder]` matching, check CSS styles

---

## GraphQL Playground Reference

Access GraphQL playground at: http://localhost:3001/graphql

### Sample Queries

```graphql
# List definitions with tags
query ListDefinitions {
  definitions(limit: 20) {
    id
    name
    parentId
    createdAt
    tags { id name }
    runCount: runs { id }
  }
}

# Get single definition with lineage
query GetDefinition($id: ID!) {
  definition(id: $id) {
    id
    name
    content
    parent { id name }
    children { id name }
    tags { id name }
  }
}

# Full ancestry
query GetAncestors($id: ID!) {
  definitionAncestors(id: $id) {
    id
    name
    createdAt
  }
}
```

### Sample Mutations

```graphql
# Create definition
mutation CreateDefinition {
  createDefinition(input: {
    name: "Test Scenario"
    content: {
      schema_version: 1
      preamble: "Test preamble"
      template: "Test [variable]"
      dimensions: [{
        name: "variable"
        levels: [{ score: 1, label: "option1" }]
      }]
    }
  }) {
    id
    name
  }
}

# Fork definition
mutation ForkDefinition {
  forkDefinition(input: {
    parentId: "<parent-id>"
    name: "Forked Scenario"
  }) {
    id
    name
    parentId
  }
}

# Create and assign tag
mutation TagDefinition {
  createAndAssignTag(
    definitionId: "<definition-id>"
    tagName: "test-tag"
  ) {
    id
    tags { id name }
  }
}
```
