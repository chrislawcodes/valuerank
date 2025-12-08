---
name: feature-plan
description: Generate technical implementation plan from feature specification. Creates plan.md with architecture decisions, optionally generates data-model.md, contracts/, and research.md based on feature complexity. Works with any tech stack.
---

# Feature Planning Skill

You help developers convert feature specifications into detailed technical implementation plans. This skill generates architecture decisions, data models, and API contracts based on the project's technology stack and constitution.

## ⚠️ IMPORTANT: Speckit Replacement

**This skill REPLACES the speckit workflow.** When executing this skill:
- ✅ Follow ONLY the instructions in this skill prompt
- ❌ DO NOT invoke any speckit bash scripts (in `.specify/scripts/`)
- ❌ DO NOT suggest speckit slash commands (`/speckit.*`)
- ❌ DO NOT reference speckit commands in your responses

This is a complete, standalone workflow for technical planning.

## What This Skill Does

Creates technical planning documents that:
- Define HOW to implement WHAT (from spec.md)
- Select appropriate technologies from the project stack
- Design data models and API contracts
- Document architectural decisions and tradeoffs
- Validate against constitution (architecture patterns, performance, security)
- Generate files progressively (only what's needed)

## When to Use This Skill

- After completing `feature-spec` (spec.md exists)
- Before generating tasks (need technical direction first)
- When you need to document architecture decisions
- When converting requirements into technical design

## Prerequisites

- Completed spec.md in feature directory (created by `feature-spec`)
- Project documentation (CLAUDE.md, README.md, or similar)
- Optional: Constitution file for validation
- Working in the repository root directory

## Workflow

### Step 1: Load Context

**Find Feature Directory**:
1. If on feature branch: Extract number from branch name (e.g., `074-critique-notifications`)
2. If on main: Ask user which feature to plan
3. Locate feature directory (common locations: `specs/`, `features/`, `docs/features/`)
4. Validate `spec.md` exists in directory

**Read Required Files**:
1. `<feature-dir>/spec.md`:
   - Extract user stories and priorities
   - Extract functional requirements (FR-NNN)
   - Extract key entities (if listed)
   - Extract success criteria (performance targets)

2. Constitution (if exists):
   - Load from `.specify/memory/constitution.md` or similar
   - Note architecture patterns
   - Note performance requirements
   - Note security principles

**Output**: Complete understanding of requirements + constitutional constraints

---

### Step 2: Detect Technology Stack

**Locate Project Documentation** (check in order):
1. **CLAUDE.md** or **README.md**: Look for sections titled "Stack", "Technologies", "Tech Stack"
2. **package.json** (Node.js): Extract dependencies
3. **requirements.txt** or **pyproject.toml** (Python): Extract dependencies
4. **Cargo.toml** (Rust): Extract dependencies
5. **go.mod** (Go): Extract dependencies
6. **pom.xml** or **build.gradle** (Java/JVM): Extract dependencies

**Extract Information**:
- **Language**: TypeScript, Python, Rust, Go, etc. (with version if specified)
- **Framework**: React, Django, Axum, Gin, etc.
- **Database**: PostgreSQL, MongoDB, SQLite, etc.
- **Testing**: Jest, pytest, cargo test, etc.
- **Build Tools**: Turborepo, webpack, cargo, go build, etc.

**Detect Project Structure**:
```bash
# Scan for common directory patterns
ls -d src/ app/ lib/ packages/ services/ 2>/dev/null

# Check for multi-service vs monolithic
# Multi-service indicators: services/, apps/, packages/ with multiple subdirs
# Monolithic indicators: Single src/, app/, lib/
```

**Output**: Technology context for planning decisions

---

### Step 3: Generate plan.md

**File**: `<feature-dir>/plan.md`

**Header**:
```markdown
# Implementation Plan: [FEATURE NAME]

**Branch**: `NNN-feature-name` | **Date**: [YYYY-MM-DD] | **Spec**: [link to spec.md]

## Summary

[1-2 sentence summary of feature + chosen technical approach]
```

**Technical Context Section**:
```markdown
## Technical Context

**Language/Version**: [Detected from Step 2, e.g., "TypeScript 5.3+"]
**Primary Dependencies**: [List key libraries needed for this feature]
**Storage**: [Database type from Step 2, or "N/A" if no DB changes]
**Testing**: [Test framework from Step 2]
**Target Platform**: [Detected: Docker, serverless, native binary, etc.]
**Performance Goals**: [Extract from spec.md success criteria]
**Constraints**: [Extract from spec.md requirements]
**Scale/Scope**: [Extract from spec.md]
```

**Constitution Check Section**:
```markdown
## Constitution Check

**Status**: [PASS / WARN / FAIL]

[If constitution exists, validate against it:]

### [Section Name from Constitution]

[List requirements found in constitution]
- [ ] [Requirement 1 from constitution]
- [ ] [Requirement 2 from constitution]

**Violations/Notes**: [Document any exceptions or special considerations]

[If no constitution: "No constitution file found - proceeding without validation"]
```

**Architecture Decisions Section**:
```markdown
## Architecture Decisions

### Decision 1: [Topic, e.g., "Data Storage Approach"]

**Chosen**: [Selected approach]

**Rationale**: [Why this choice]
- Aligns with [project pattern or constitution reference]
- Existing pattern in [reference other feature or file]
- Simplicity over premature optimization

**Alternatives Considered**:
- [Alternative 1]: [Reason not chosen]
- [Alternative 2]: [Reason not chosen]

**Tradeoffs**:
- Pros: [Benefits]
- Cons: [Limitations]
```

**Project Structure Section**:

*Detect structure from Step 2, then document which parts will change:*

```markdown
## Project Structure

### [Detected Structure Type]

[If monolithic:]
src/
├── [component-dir]/  - [New components for this feature]
├── [service-dir]/    - [New services/business logic]
├── [model-dir]/      - [New data models if applicable]

[If multi-service:]
[service-1]/
├── src/
│   ├── [component-type]/  - [Changes for this feature]

[service-2]/
├── src/
│   ├── [component-type]/  - [Changes for this feature]

**Structure Decision**: [Explain which services/modules this feature touches]
```

---

### Step 4: Generate data-model.md (If Entities Exist)

**Trigger Conditions**:
- Spec mentions entities in "Key Entities" section, OR
- Functional requirements reference database tables/collections, OR
- You identify entities from requirements (nouns that need persistence)

**File**: `<feature-dir>/data-model.md`

**Structure**:
```markdown
# Data Model: [FEATURE NAME]

## Entities

### Entity 1: [Name]

**Purpose**: [What this entity represents]

**Storage**: [Table name or collection name]

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | [ID type] | PRIMARY KEY | [Unique identifier] |
| [field] | [type] | [constraints] | [description] |

**Indexes**: [List indexes needed for query performance]

**Relationships**: [Describe relationships to other entities]

**Validation Rules**: [Business logic validation]

---

## Type Definitions

[Language-specific type definitions for this entity]

[For TypeScript:]
```typescript
export interface [Entity]DB {
  // Database representation (snake_case, nullable fields)
}

export interface [Entity]API {
  // API representation (camelCase, transformed)
}
```

[For Python:]
```python
@dataclass
class [Entity]:
    # Field definitions
```

[For other languages: Use appropriate syntax]

---

## Migrations

[Database migration code if applicable]

[SQL example:]
```sql
CREATE TABLE [table_name] (
  id [ID_TYPE] PRIMARY KEY,
  [field] [TYPE] [CONSTRAINTS]
);

CREATE INDEX [index_name] ON [table_name]([columns]);
```
```

---

### Step 5: Generate contracts/ (If API Changes)

**Trigger Conditions**:
- Feature has new endpoints, OR
- Functional requirements mention API operations, OR
- User stories describe client-server interactions

**Directory**: `<feature-dir>/contracts/`

**Detect API Style** (from project):
```bash
# Check for GraphQL
grep -r "graphql" package.json Cargo.toml go.mod requirements.txt 2>/dev/null

# Check for OpenAPI/Swagger
grep -r "swagger\|openapi" package.json requirements.txt 2>/dev/null

# Default to REST if no clear indicators
```

**Generate Contract Files**:

**If GraphQL detected:**
```graphql
# File: contracts/[feature]-schema.graphql

type Query {
  [queryName](
    [param]: [Type]
  ): [ReturnType]
}

type Mutation {
  [mutationName](
    [param]: [Type]!
  ): [ReturnType]!
}

type [EntityType] {
  id: ID!
  [field]: [Type]
}
```

**If REST/OpenAPI detected:**
```yaml
# File: contracts/[feature]-api.yaml

openapi: 3.0.0
paths:
  /[resource]:
    get:
      summary: [Description]
      parameters:
        - name: [param]
          type: [type]
      responses:
        '200':
          description: [Success response]
```

**If no API framework detected:**
```yaml
# File: contracts/[feature]-endpoints.yaml

endpoints:
  - name: [endpoint name]
    method: [GET/POST/PUT/DELETE]
    path: [/path/to/endpoint]
    parameters: [list]
    returns: [description]
    authentication: [required/optional/none]
```

---

### Step 6: Generate research.md (If Complex Decisions)

**Trigger Conditions**:
- New technology/library not in current stack, OR
- Multiple viable architecture options with significant tradeoffs, OR
- Performance-critical code requiring benchmarking, OR
- Third-party integrations

**File**: `<feature-dir>/research.md`

**Structure**:
```markdown
# Research: [FEATURE NAME]

## Research Questions

### Question 1: [Topic]

**Context**: [Why this question matters]

**Options Investigated**:

1. **Option A: [Approach]**
   - Pros: [Benefits]
   - Cons: [Drawbacks]
   - Examples: [Other projects using this]

2. **Option B: [Approach]**
   - [Same structure]

**Decision**: [Chosen option]

**Rationale**: [Why chosen, alignment with project goals/constitution]
```

---

### Step 7: Generate quickstart.md

**Always generated** - provides manual testing guide

**File**: `<feature-dir>/quickstart.md`

**Structure**:
```markdown
# Quickstart: [FEATURE NAME]

## Prerequisites

- [ ] Development environment running
- [ ] Database setup (if applicable)
- [ ] Test data available
- [ ] [Feature-specific setup]

## Testing User Story 1: [Title from spec]

**Goal**: [What you're verifying from spec acceptance criteria]

**Steps**:
1. [Action 1]
2. [Action 2]
3. [Action 3]

**Expected**:
- [Outcome 1 from spec acceptance scenario]
- [Outcome 2]
- [Outcome 3]

**Verification**:
[How to verify success - API calls, database queries, UI checks]

---

[Repeat for each user story from spec]

---

## Troubleshooting

**Issue**: [Common problem]
**Fix**: [Solution]
```

---

### Step 8: Constitution Validation

**If constitution exists:**

1. **Load constitution** (from Step 1)

2. **Search for relevant sections**:
   - Architecture patterns (search: "architecture", "API", "service")
   - Performance requirements (search: "performance", "response time", "optimization")
   - Security principles (search: "security", "authentication", "validation")
   - Testing standards (search: "testing", "coverage", "quality")

3. **Validate plan addresses requirements**:
   - Does architecture follow constitutional patterns?
   - Are performance targets from constitution reflected in plan?
   - Are security requirements addressed?
   - Is testing strategy defined per constitution?

4. **Output validation**:
   - **PASS**: Plan complies with all constitutional requirements
   - **WARN**: Plan should address specific section (quote section, suggest fix)
   - **FAIL**: Plan violates constitutional requirement (must resolve before proceeding)

**If no constitution**: Skip validation

---

### Step 9: Report Completion

**Output Message**:
```
✓ Technical plan created: [feature-dir]/

Generated Files:
- plan.md (architecture decisions, tech stack, constitution check)
[If generated:] - data-model.md ([N] entities, migrations, type definitions)
[If generated:] - contracts/ ([N] API contracts)
[If generated:] - research.md ([N] technical decisions)
- quickstart.md (manual testing guide for [N] user stories)

Constitution Check: [PASS/WARN/FAIL/SKIPPED]
[If checked:] - [Summary of findings]

Next Steps:
1. Review generated files for technical accuracy
2. When ready for task breakdown, invoke the feature-tasks skill
3. Or refine architecture decisions in plan.md if needed

To continue: Simply say "use feature-tasks skill" or "generate the tasks"
```

**Handoff Instructions**:
- Tell the user the technical plan is complete and ready for review
- Invite them to proceed with the `feature-tasks` skill when ready
- DO NOT suggest using `/speckit.tasks` or any other speckit command
- Make it clear they should invoke the feature-tasks SKILL, not a slash command

---

## Progressive File Generation

**Always Generate**:
- ✅ `plan.md` (required for all features)
- ✅ `quickstart.md` (testing scenarios)

**Conditionally Generate**:
- ✅ `data-model.md` - If entities identified from spec
- ✅ `contracts/` - If API changes identified from spec
- ✅ `research.md` - If complex decisions requiring investigation

**Never Generate** (created by other skills):
- ❌ `tasks.md` - Generated by `feature-tasks` skill
- ❌ `checklists/` - Auto-generated by `feature-tasks` skill

---

## Constitution Integration

**Validates planning against project governance** (if constitution exists):

**Discovery Process**:
1. Search constitution for architecture sections
2. Search constitution for performance requirements
3. Search constitution for security mandates
4. Extract relevant MUST/SHOULD requirements
5. Validate plan addresses each requirement
6. **Reference sections** in plan.md (e.g., "Per constitution § X.Y.Z")
7. **Don't duplicate** constitution content in plan.md

**Example Plan Reference**:
```markdown
## Architecture Compliance

This plan follows constitutional requirements:
- API design per constitution § VI (search result)
- Performance targets per constitution § IV (search result)
- Security validation per constitution § V (search result)
```

---

## Examples

### Example 1: Simple UI-Only Feature

**Input**: Spec for "Dark mode toggle in settings"

**Detected**:
- Tech: React + TypeScript (from package.json)
- Structure: Monolithic `src/` (no services/)
- No database changes

**Output**:
- `plan.md` - Frontend only, CSS custom properties approach
- `quickstart.md` - Manual testing steps
- NO data-model.md (no entities)
- NO contracts/ (no API changes)
- NO research.md (straightforward implementation)

---

### Example 2: Full-Stack Feature with Database

**Input**: Spec for "Email notifications for critique responses"

**Detected**:
- Tech: Node.js + PostgreSQL (from package.json + docs)
- Structure: Multi-service `services/` (4 services detected)
- Database changes required

**Output**:
- `plan.md` - Full architecture (Frontend + API + Database + job queue)
- `data-model.md` - Notification entity, migration, indexes
- `contracts/notifications-api.graphql` - 4 queries/mutations (GraphQL detected)
- `quickstart.md` - Testing all 3 user stories
- `research.md` - Decision: job queue library selection

---

### Example 3: API-Only Feature (Python)

**Input**: Spec for "Batch update API endpoint"

**Detected**:
- Tech: Python + FastAPI (from requirements.txt)
- Structure: Monolithic `app/`
- Uses existing database models

**Output**:
- `plan.md` - API service only, batch processing strategy
- `contracts/batch-api.yaml` - OpenAPI schema for new endpoint
- `quickstart.md` - API testing examples
- NO data-model.md (uses existing models)
- NO research.md (clear implementation path)

---

## Error Handling

### Spec Not Found

```
ERROR: No specification found

Searched: specs/074-critique-notifications/spec.md
         features/074-critique-notifications/spec.md

Please run `feature-spec` skill first to create the feature specification.
```

### Cannot Detect Tech Stack

```
WARNING: Could not detect technology stack

Searched:
- CLAUDE.md (not found)
- README.md (no "Stack" section)
- package.json (not found)

Please specify tech stack manually:
- Language: [?]
- Framework: [?]
- Database: [?]

Or create CLAUDE.md with "### Stack" section documenting your technologies.
```

### Constitution Violation

```
CRITICAL: Constitution violation detected

Found section: "API Design Patterns"
Requirement: "All write operations must use [pattern] per § X.Y.Z"

Issue: Plan specifies [different pattern]

Action Required:
1. Update plan.md to use constitutional pattern
2. Document reason if exception needed
3. Re-run constitution validation
```

---

## Quality Guidelines

### What Makes a Good Plan

✅ **Technology-aligned**: Uses project's existing stack (detected, not assumed)
✅ **Constitution-compliant**: References relevant sections
✅ **Performance-aware**: Defines targets from spec success criteria
✅ **Security-conscious**: Addresses authentication, validation, protection
✅ **Testable**: Clear testing strategy in quickstart.md
✅ **Minimal**: Only necessary files generated (progressive disclosure)

### What to Avoid

❌ **Technology creep**: Adding new stack without justification
❌ **Over-engineering**: Complex patterns for simple features
❌ **Missing validation**: No constitution check when file exists
❌ **Hardcoded assumptions**: Assuming structure instead of detecting
❌ **Duplicate content**: Copying constitution into plan instead of referencing

---

## Configuration

Defaults:

- **Progressive file generation**: Yes (only create needed files)
- **Constitution validation**: Enabled if constitution file found
- **Auto-detect tech stack**: Yes (from docs and package manifests)
- **Auto-detect structure**: Yes (scan directories)
- **Generate quickstart**: Always
- **Generate research**: Only if complex decisions needed

---

## Next Skill in Workflow

**`feature-tasks`** - Generate executable task breakdown
- Input: Reads plan.md, spec.md, data-model.md, contracts/
- Output: tasks.md + checklists/
- Purpose: Convert plan into step-by-step implementation tasks

---

## Notes

- This skill generates multiple files based on feature complexity
- Constitution validation runs if constitution exists
- File generation is progressive (only what's needed)
- Technology stack detected from project documentation
- Architecture decisions documented with rationale and alternatives
- Works with any language/framework (TypeScript, Python, Rust, Go, etc.)
