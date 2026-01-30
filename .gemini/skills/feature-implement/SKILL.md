---
name: feature-implement
description: Execute feature tasks phase-by-phase with automatic progress tracking. Updates tasks.md checkboxes live, creates commits at phase boundaries, validates constitution compliance throughout. Works with any tech stack.
---

# Feature Implementation Skill

You help developers execute feature tasks systematically with automatic progress tracking, constitution validation, and phase-based commits. This skill transforms task plans into working code.

## ⚠️ IMPORTANT: Speckit Replacement

**This skill REPLACES the speckit workflow.** When executing this skill:
- ✅ Follow ONLY the instructions in this skill prompt
- ❌ DO NOT invoke any speckit bash scripts (in `.specify/scripts/`)
- ❌ DO NOT suggest speckit slash commands (`/speckit.*`)
- ❌ DO NOT reference speckit commands in your responses

This is a complete, standalone workflow for feature implementation.

## What This Skill Does

Executes implementation that:
- Runs tasks phase-by-phase (Setup → Foundation → User Stories → Polish)
- Updates tasks.md checkboxes to [X] after each task
- Creates git commits at phase boundaries
- Validates constitution compliance continuously
- Checks quality checklists before starting
- Reports progress in real-time
- Stops gracefully on errors

## When to Use This Skill

- After completing `feature-tasks` (tasks.md exists)
- When ready to implement the feature
- When continuing interrupted implementation (picks up from last checkbox)
- When implementing incrementally (MVP-first approach)

## Prerequisites

- Completed `tasks.md` in feature directory
- Completed `plan.md` in feature directory
- Completed `spec.md` in feature directory
- Optional: `checklists/` (quality gates)
- Working in repository root directory
- Git branch checked out for feature

## Workflow

### Step 1: Pre-Flight Checks

**Check Feature Context**:
1. Identify current feature:
   - If on feature branch: Extract from branch name (e.g., `074-critique-notifications`)
   - If on main: Ask user which feature to implement
2. Locate feature directory (common locations: `specs/`, `features/`, `docs/features/`)
3. Validate files exist:
   - `<feature-dir>/tasks.md` (REQUIRED)
   - `<feature-dir>/plan.md` (REQUIRED)
   - `<feature-dir>/spec.md` (REQUIRED)

**Output**: Confirmed feature directory and prerequisites met

---

### Step 2: Checklist Validation (If Exists)

**Scan**: `<feature-dir>/checklists/`

**If checklists exist**:

1. **Count items** in each checklist:
   - Total: `grep -c '^\s*- \[[ xX]\]' file.md`
   - Completed: `grep -c '^\s*- \[[xX]\]' file.md`
   - Incomplete: `grep -c '^\s*- \[ \]' file.md`

2. **Create status table**:
```
Checklist Status:

| Checklist            | Total | Completed | Incomplete | Status |
|----------------------|-------|-----------|------------|--------|
| requirements.md      | 12    | 12        | 0          | ✓ PASS |
| implementation.md    | 18    | 15        | 3          | ✗ FAIL |
| testing.md           | 15    | 15        | 0          | ✓ PASS |
```

3. **Determine action**:

**If ALL checklists complete (0 incomplete)**:
```
✓ All checklists complete - proceeding with implementation

Checklist Summary:
- requirements.md: 12/12 ✓
- implementation.md: 18/18 ✓
- testing.md: 15/15 ✓

Starting Phase 1: Setup...
```

**If ANY checklist incomplete**:
```
⚠️ Some checklists are incomplete

Incomplete Items:
- implementation.md: 3 items unchecked
  - [ ] [Item from checklist]
  - [ ] [Item from checklist]
  - [ ] [Item from checklist]

This may indicate the plan is not fully validated.

Do you want to proceed with implementation anyway? (yes/no)
```

**Wait for user response**:
- "yes" / "proceed" / "continue" → Continue to Step 3
- "no" / "wait" / "stop" → Halt execution, suggest reviewing checklists

**If no checklists exist**: Skip validation, proceed to Step 3

---

### Step 3: Load Implementation Context

**Read All Context Files**:

1. **REQUIRED**:
   - `tasks.md` - Task list and execution order
   - `plan.md` - Tech stack, architecture, service changes
   - `spec.md` - User stories, requirements, success criteria

2. **OPTIONAL** (if exist):
   - `data-model.md` - Entities, migrations, relationships
   - `contracts/` - GraphQL schema, API contracts
   - `research.md` - Technical decisions
   - `quickstart.md` - Testing scenarios

3. **Constitution** (if exists):
   - Search for constitution file (`.specify/memory/constitution.md`, `CONSTITUTION.md`, `docs/constitution.md`)
   - Load quality standards if found

**Parse tasks.md Structure**:
- Extract all task IDs, descriptions, file paths
- Identify current phase (first phase with unchecked tasks)
- Identify parallel opportunities ([P] markers)
- Build dependency graph

**Output**: Complete implementation context loaded

---

### Step 4: Determine Starting Point

**Scan tasks.md for progress**:

1. Count tasks:
   - Total: All `- [ ]` or `- [X]`
   - Completed: All `- [X]` or `- [x]`
   - Remaining: All `- [ ]`

2. Find first unchecked task:
   - If T001 unchecked: Starting fresh (Phase 1)
   - If T015 unchecked: Resuming from Phase 3
   - If all checked: Implementation complete!

3. Identify current phase:
   - Scan tasks.md headers: `## Phase N: [Name]`
   - Find phase containing first unchecked task

**Output**:
```
Implementation Status:

Progress: 12/45 tasks complete (27%)
Current Phase: Phase 3 - User Story 1 (Priority: P1)
Next Task: T013 [US1] Integrate component into application

Completed Phases:
✓ Phase 1: Setup (3/3 tasks)
✓ Phase 2: Foundation (5/5 tasks)

Current Phase:
Phase 3: User Story 1 (4/12 tasks)

Remaining Phases:
- Phase 4: User Story 2 (0/15 tasks)
- Phase 5: User Story 3 (0/8 tasks)
- Phase 6: Polish (0/2 tasks)

Starting implementation from T013...
```

---

### Step 5: Execute Tasks Phase-by-Phase

**Phase Execution Rules**:

1. **Sequential by default**: Execute tasks in order (T001 → T002 → T003)
2. **Parallel when marked**: Tasks with [P] can run together (if same phase)
3. **Phase boundaries**: Complete all tasks in phase before moving to next
4. **Checkpoints**: Validate after each phase completion

---

#### Executing a Single Task

**For each task**:

1. **Parse task**:
   - ID: `T013`
   - Labels: `[US1]` (story marker, if present)
   - Description: Extract action and file path from task description
   - File path: Extract from task description (per plan.md structure)

2. **Announce start**:
   ```
   🔨 T013 [US1] [Task description from tasks.md]
   File: [path from task description]
   ```

3. **Execute work**:
   - Read existing file (if modifying)
   - Implement the change per task description
   - Follow plan.md architecture
   - Apply quality standards from constitution (if exists)
   - Use patterns detected from project

4. **Apply quality standards** (if constitution exists):
   - Search constitution for code quality requirements
   - Search constitution for logging/observability requirements
   - Search constitution for URL construction requirements
   - Search constitution for API design requirements
   - Validate new code follows discovered standards

5. **Write/modify file**:
   - Use Edit tool for existing files
   - Use Write tool for new files
   - Preserve existing code quality

6. **Mark complete**:
   - Update tasks.md: `- [ ] T013` → `- [X] T013`
   - Use Edit tool to update checkbox

7. **Report completion**:
   ```
   ✓ T013 [US1] [Task description]
   Updated: [file path]
   Progress: 13/45 tasks (29%)
   ```

---

#### Executing Parallel Tasks [P]

**When encountering [P] tasks**:

1. **Identify parallel group**:
   ```markdown
   - [ ] T009 [P] [US1] Create component A in <path-from-plan>/ComponentA.ext
   - [ ] T010 [P] [US1] Create component B in <path-from-plan>/ComponentB.ext
   - [ ] T011 [P] [US1] Create hook in <path-from-plan>/useHook.ext
   - [ ] T012 [US1] Integrate components (depends on above)
   ```

2. **Execute T009, T010, T011 together** (different files):
   ```
   🔨 Parallel Execution:
   - T009 [P] [US1] Create component A
   - T010 [P] [US1] Create component B
   - T011 [P] [US1] Create hook
   ```

3. **Write all files**:
   - ComponentA.ext
   - ComponentB.ext
   - useHook.ext

4. **Mark all complete**:
   - Update tasks.md: Mark T009, T010, T011 as [X]

5. **Report**:
   ```
   ✓ T009 [P] [US1] Create component A
   ✓ T010 [P] [US1] Create component B
   ✓ T011 [P] [US1] Create hook
   Progress: 11/45 tasks (24%)
   ```

6. **Continue to T012** (sequential, depends on parallel group)

---

#### Phase Checkpoint Validation

**After completing all tasks in a phase**:

1. **Run validations** (detect from project):

**Detect Project Build/Test Commands**:
1. Check `package.json` scripts (Node.js):
   - Look for `"test"`, `"build"`, `"migrate"` scripts
   - Use detected scripts: `npm test`, `npm run build`, etc.

2. Check `Makefile` (any language):
   - Look for `test`, `build`, `lint` targets
   - Use: `make test`, `make build`, etc.

3. Check `pyproject.toml` or `setup.py` (Python):
   - Look for test frameworks: pytest, unittest
   - Use: `pytest`, `python -m unittest`, etc.

4. Check `Cargo.toml` (Rust):
   - Use: `cargo test`, `cargo build`, etc.

5. Check `go.mod` (Go):
   - Use: `go test ./...`, `go build ./...`, etc.

**Phase 1 (Setup) Validation**:
```bash
# Verify project structure created (paths from plan.md)
ls -la [directories from plan.md]

# Verify dependencies installed (detect package manager)
# Node.js: npm list [package] or check node_modules/
# Python: pip list | grep [package]
# Rust: cargo tree | grep [package]
# Go: go list -m all | grep [package]
```

**Phase 2 (Foundation) Validation**:
```bash
# Run database migrations (if data-model.md exists)
# Detect migration command from plan.md or project patterns

# Verify migrations applied (database-specific)
# PostgreSQL: psql -d [db] -c "\d [table]"
# MySQL: mysql -D [db] -e "DESCRIBE [table]"
# SQLite: sqlite3 [db] ".schema [table]"
# MongoDB: mongo [db] --eval "db.[collection].findOne()"

# Verify types compile (language-specific)
# TypeScript: tsc --noEmit or build command
# Rust: cargo check
# Go: go build ./...
# Python: mypy [path] (if using type hints)
```

**User Story Phases (Phase 3+) Validation**:
```bash
# Run tests (use detected test command)
[test command from project]

# Run build (use detected build command)
[build command from project]

# Verify story acceptance criteria (from spec.md)
# [Manual testing per quickstart.md if available]
```

**Polish Phase (Final) Validation**:
```bash
# Run full test suite
[test command from project]

# Run build
[build command from project]

# Check code coverage (if configured)
# Node.js: npm run test:coverage or similar
# Python: pytest --cov or coverage run
# Rust: cargo tarpaulin or cargo llvm-cov
# Go: go test -cover ./...

# Run health checks (if health check system exists)
# Search for health check scripts or endpoints in project
```

2. **Create git commit**:

**Commit Message Format** (conventional commits):
```bash
git add [files from this phase]

git commit -m "$(cat <<'EOF'
feat([feature-number]): Phase N - [Phase name and summary]

- Completed tasks T001-T008
- [Key accomplishments from this phase]
- [Notable changes or decisions]

[If applicable: Closes #issue-number]
EOF
)"
```

**Example**:
```bash
git commit -m "$(cat <<'EOF'
feat(074): Phase 2 - Foundation for [feature name]

- Completed tasks T004-T008
- Added database migration with indexes
- Created repository and base types
- Defined API schema/contracts
- All types compile, migration tested
EOF
)"
```

3. **Report checkpoint**:
   ```
   ✓ Phase 2 Complete: Foundation (5/5 tasks)

   Validation Results:
   - Migration applied: [table/collection] created ✓
   - Types compile: [build command] ✓
   - Tests pass: [test command] ✓

   Git Commit: a1b2c3d "feat(074): Phase 2 - Foundation for [feature]"

   Next Phase: Phase 3 - User Story 1 (Priority: P1) 🎯 MVP
   Goal: [What this story delivers from spec]
   Tasks: 12 remaining
   ```

4. **Proceed to next phase** (or stop if user requested MVP only)

---

### Step 6: Constitution Compliance During Implementation

**Validate continuously** (if constitution exists):

#### Code Quality

**Search constitution for code quality requirements**:
- Search for: "code quality", "strict mode", "type safety", "complexity"
- Extract MUST/SHOULD requirements
- Apply to new/modified code

**Common patterns to validate** (if found in constitution):
- Type safety requirements (TypeScript strict mode, Python type hints, etc.)
- Function complexity limits (lines per function, nesting depth)
- File size limits
- Naming conventions
- Documentation requirements

---

#### Logging and Observability

**Detect project logging pattern**:

1. **Search constitution** for logging requirements:
   - Search for: "logging", "observability", "console", "debugging"
   - Note requirements like "no console.*", "structured logging required"

2. **Scan codebase** for logging utilities:
   ```bash
   # TypeScript/JavaScript
   grep -r "import.*logger" --include="*.ts" --include="*.js" --include="*.tsx"
   grep -r "from.*logger" --include="*.ts" --include="*.js"

   # Python
   grep -r "import logging" --include="*.py"
   grep -r "from.*logger" --include="*.py"

   # Rust
   grep -r "use.*log::" --include="*.rs"
   grep -r "use.*tracing::" --include="*.rs"

   # Go
   grep -r "import.*log" --include="*.go"
   ```

3. **Examine discovered logger**:
   - Read logger utility file
   - Identify calling pattern (e.g., `logger.info(category, message)` vs `logger.info(message, context)`)
   - Note file location for imports

4. **Validate new code** uses project logger:
   - If constitution forbids `console.*`, scan for violations
   - Ensure new code imports and uses project logger
   - Follow detected logging pattern

---

#### URL Construction

**Detect project URL utilities** (if constitution requires):

1. **Search constitution** for URL requirements:
   - Search for: "URL", "hardcoded", "route construction", "endpoint"
   - Note requirements like "no hardcoded URLs", "use URL builders"

2. **If URL requirements found**, search for utilities:
   ```bash
   # Look for URL/route utility files
   find . -name "*url*.ts" -o -name "*url*.js" -o -name "*route*.ts" 2>/dev/null
   find . -name "*url*.py" -o -name "*route*.py" 2>/dev/null

   # Look for common utility directories
   ls -la src/utils/ lib/utils/ app/utils/ 2>/dev/null
   ```

3. **Examine discovered utilities**:
   - Read URL utility file
   - Identify helper functions (e.g., `buildUrl()`, `apiUrl()`, `collectionUrl()`)
   - Note import path for new code

4. **Validate new code**:
   - No hardcoded URLs (e.g., `"/api/users/123"`, `"http://localhost:3000"`)
   - Uses discovered URL utilities
   - Environment-aware construction (Local/Docker/Production)

---

#### API Design Requirements

**Detect project API patterns** (if constitution specifies):

1. **Search constitution** for API requirements:
   - Search for: "API", "GraphQL", "REST", "mutations", "write operations"
   - Note patterns like "all writes use GraphQL", "RESTful conventions"

2. **Detect API framework** from project:
   ```bash
   # Check for GraphQL
   grep -r "graphql" package.json Cargo.toml go.mod requirements.txt 2>/dev/null

   # Check for REST frameworks
   grep -r "express\|fastapi\|axum\|gin" package.json requirements.txt Cargo.toml go.mod 2>/dev/null
   ```

3. **Validate new code** follows detected patterns:
   - If GraphQL detected + constitution requires: Use mutations for writes
   - If REST + constitution specifies: Follow RESTful conventions
   - Use project API client patterns (discovered from existing code)

---

#### Security

**Search constitution for security requirements**:

**Authentication**:
- Search for: "authentication", "authorization", "JWT", "session"
- Validate: New endpoints require auth (unless explicitly public)
- Use: Project auth middleware/patterns

**Input Validation**:
- Search for: "validation", "sanitization", "XSS", "SQL injection"
- Validate: Schema-based validation, parameterized queries, sanitization
- Use: Project validation library (Zod, Yup, etc. - detect from dependencies)

**File Uploads** (if applicable):
- Search for: "file upload", "file size", "file type"
- Validate: File type validation (magic bytes), size limits, secure naming
- Use: Project upload patterns from existing code

---

### Step 7: Error Handling

**If task fails**:

1. **Capture error details**:
   ```
   ✗ T015 [US1] [Task description] failed

   Error: [Error message]
   File: [file path]:[line]

   Context:
   - [Relevant context about what was expected]
   - [Relevant context about what was found]
   ```

2. **Stop execution** (preserve progress):
   ```
   Implementation halted due to error in T015.

   Completed: 14/45 tasks (31%)
   Failed: T015 [US1] [Task description]

   Next Steps:
   1. Fix the error: [Suggested fix based on error]
   2. Re-run feature-implement to continue from T015
   3. Or manually complete T015 and mark checkbox [X]

   Tasks.md has been updated to reflect progress (T001-T014 marked complete).
   ```

3. **Preserve progress**:
   - All completed tasks remain marked [X]
   - Can resume by re-running skill
   - Phase commits already created

4. **Suggest remediation**:
   - Identify likely fix based on error
   - Point to relevant documentation
   - Reference similar patterns in codebase

---

### Step 8: Completion Validation

**After all tasks complete**:

1. **Final validation suite** (use detected commands):

```bash
# All tests pass
[test command detected from project]
# Expected: All tests pass, no failures

# All builds succeed
[build command detected from project]
# Expected: Clean build, no errors

# Code coverage check (if configured)
[coverage command detected from project]
# Expected: Meet project coverage targets

# Health checks (if health check system exists)
[health check command/script if found]
# Expected: All services/components healthy
```

2. **Verify spec requirements met**:
   - Load spec.md success criteria
   - Check each SC-NNN:
     - SC-001: [Success criterion from spec]
     - SC-002: [Success criterion from spec]
     - SC-003: [Success criterion from spec]

3. **Verify quickstart scenarios** (if exists):
   - Run manual testing from quickstart.md
   - Validate each user story independently

4. **Final checklist review** (if exists):
   - Re-scan checklists/
   - Ensure all items now checked [X]
   - Flag any remaining incomplete items

---

### Step 9: Report Final Status

**Success Message**:
```
✅ Feature implementation complete!

Feature: [feature-number]-[feature-name]
Total Tasks: 45/45 (100%)

Phases Completed:
✓ Phase 1: Setup (3 tasks)
✓ Phase 2: Foundation (5 tasks)
✓ Phase 3: User Story 1 - MVP (12 tasks)
✓ Phase 4: User Story 2 (15 tasks)
✓ Phase 5: User Story 3 (8 tasks)
✓ Phase 6: Polish (2 tasks)

Git Commits: 6 commits created
- a1b2c3d: Phase 1 - Setup
- e4f5g6h: Phase 2 - Foundation
- i7j8k9l: Phase 3 - User Story 1 (MVP)
- m0n1o2p: Phase 4 - User Story 2
- q3r4s5t: Phase 5 - User Story 3
- u6v7w8x: Phase 6 - Polish

Final Validation:
✓ All tests pass ([test command])
✓ All builds succeed ([build command])
✓ Code coverage: [metrics if available]
✓ Health checks: [status if available]
✓ Constitution compliance: PASS

Checklists (if exist):
✓ requirements.md (12/12)
✓ implementation.md (18/18)
✓ testing.md (15/15)

Next Steps:
1. Review git commits for quality
2. Run final manual testing per quickstart.md
3. Create pull request: gh pr create (or equivalent)
4. Deploy to dev/staging environment (if ready)

Feature ready for review!
```

---

## Task Tracking (Live Updates)

**Update tasks.md after EACH task**:

**Before Task**:
```markdown
- [ ] T013 [US1] Integrate component into application
```

**After Task**:
```markdown
- [X] T013 [US1] Integrate component into application
```

**Implementation**:
- Use Edit tool to replace `- [ ]` with `- [X]`
- Update immediately after task completes (not batched)
- Creates version control audit trail
- Enables resuming from any point

---

## Phase-Based Commits

**Commit after each phase**:

**Commit Rules**:
1. ✅ Commit after completing each phase
2. ✅ Use conventional commits format
3. ✅ Include task range and accomplishments
4. ❌ Do NOT batch multiple phases into one commit

**Commit Message Template**:
```bash
feat(NNN): Phase X - [Clear description of what was built]

- Completed tasks TXXX-TYYY
- [Key accomplishment 1]
- [Key accomplishment 2]
- [Notable decisions or changes]
```

**Benefits**:
- Reviewable checkpoints
- Safe rollback points
- Clear history
- Easy to bisect issues

---

## Examples

### Example 1: Fresh Implementation (TypeScript Project)

**Project Context**:
- Language: TypeScript 5.3
- Framework: React + Express
- Database: PostgreSQL
- Build: npm scripts
- Tests: Jest

**Input**: tasks.md with 0/45 tasks complete

**Execution**:
1. Check checklists (all complete) ✓
2. Load context (spec, plan, tasks)
3. Detect build/test commands: `npm test`, `npm run build`
4. Start Phase 1: Setup (3 tasks)
   - Execute T001, T002, T003
   - Commit: "Phase 1 - Setup"
5. Start Phase 2: Foundation (5 tasks)
   - Execute T004-T008
   - Run migration: `npm run migrate:dev` (detected from package.json)
   - Verify types: `npm run build`
   - Commit: "Phase 2 - Foundation"
6. Start Phase 3: User Story 1 (12 tasks)
   - Execute T009-T020
   - Run tests: `npm test`
   - Verify acceptance criteria
   - Commit: "Phase 3 - User Story 1 (MVP)"
7. Continue through remaining phases...
8. Final validation: `npm test && npm run build`
9. Report completion

**Output**: 45/45 tasks complete, 6 commits, feature ready

---

### Example 2: Resume from Checkpoint (Python Project)

**Project Context**:
- Language: Python 3.11
- Framework: Django
- Database: PostgreSQL
- Build: pytest, mypy
- Tests: pytest

**Input**: tasks.md with 14/45 tasks complete (stopped mid-Phase 3)

**Execution**:
1. Scan tasks.md: T001-T014 marked [X]
2. Find next task: T015 (in Phase 3)
3. Detect test command: `pytest`
4. Detect build command: `python manage.py check && mypy .`
5. Report status:
   ```
   Resuming implementation from T015
   Progress: 14/45 tasks (31%)
   Completed: Phase 1 ✓, Phase 2 ✓, Phase 3 (partial)
   ```
6. Continue Phase 3 from T015
7. Complete remaining phases
8. Final validation: `pytest && mypy .`

**Output**: 45/45 tasks complete, 4 new commits (phases 3-6)

---

### Example 3: MVP Only - Rust Project

**Project Context**:
- Language: Rust 1.70
- Framework: Axum (web) + SQLx (database)
- Database: PostgreSQL
- Build: cargo build
- Tests: cargo test

**Input**: tasks.md, user requests MVP only (User Story 1)

**Execution**:
1. Detect commands: `cargo test`, `cargo build`
2. Complete Phase 1: Setup
3. Complete Phase 2: Foundation
   - Run migration: `sqlx migrate run` (detected from project)
4. Complete Phase 3: User Story 1 (P1)
5. **STOP after Phase 3**
6. Run validation for MVP:
   - Tests: `cargo test` ✓
   - Build: `cargo build` ✓
   - User Story 1 acceptance criteria met ✓
7. Report:
   ```
   ✓ MVP complete (User Story 1)

   Progress: 20/45 tasks (44%)
   Completed Phases:
   - Phase 1: Setup ✓
   - Phase 2: Foundation ✓
   - Phase 3: User Story 1 (MVP) ✓

   Remaining:
   - Phase 4: User Story 2 (P2)
   - Phase 5: User Story 3 (P3)
   - Phase 6: Polish

   MVP ready for testing and feedback.
   Re-run feature-implement to continue with P2/P3.
   ```

---

## Error Handling

### Task Execution Failed

```
✗ T015 [US1] Failed: [Task description]

Error: [Error type]: [Error message]
File: [file path]:[line]

Likely Cause: [Analysis of error]

Suggested Fix:
1. [First suggested fix step]
2. [Second suggested fix step]
3. [Third suggested fix step]

Implementation halted at T015.
Progress saved: 14/45 tasks complete (T001-T014 marked [X])

Fix the error and re-run feature-implement to continue.
```

---

### Constitution Violation

```
⚠️ Constitution Violation Detected

Task: T013 [US1] [Task description]

Violation: [Description of violation]
File: [file path]:[line]
Code: [Violating code snippet]

Required Fix:
- Replace: [Current code]
- With: [Compliant code following project pattern]

Auto-fixing constitution violation...
✓ Fixed: [Description of fix applied]

Continuing implementation...
```

---

### Tests Failed

```
✗ Phase Validation Failed: Phase 3 checkpoint

Test Failures:
  [test file path]
    ✗ [test description]
      Expected: [expected value]
      Received: [actual value]

Build Status: ✓ PASS
Tests Status: ✗ FAIL (1 test failing)

Action Required:
1. Fix failing test in [test file]
2. Re-run: [test command for project]
3. Verify test passes before continuing

Implementation paused at Phase 3 checkpoint.
Tasks T009-T020 marked complete, but phase validation failed.
Fix tests and re-run feature-implement to continue.
```

---

## Quality Guidelines

### What Makes Good Implementation

✅ **Constitution-compliant**: All code follows standards (if constitution exists)
✅ **Progress-tracked**: tasks.md updated in real-time
✅ **Phase-committed**: Git commits at checkpoints
✅ **Validated**: Tests/builds at each phase
✅ **Recoverable**: Can resume from any task
✅ **Clear commits**: Conventional format with context

### What to Avoid

❌ **Batch commits**: Committing multiple phases together
❌ **Skip tests**: Proceeding with failing tests
❌ **Standard violations**: Ignoring constitution requirements
❌ **Unclear progress**: Not updating tasks.md checkboxes
❌ **No validation**: Skipping phase checkpoints
❌ **Giant tasks**: Task does too much, hard to review

---

## Configuration

Defaults:

- **Live task tracking**: Update tasks.md after each task (not batched)
- **Constitution validation**: Enabled if constitution exists (discovery-based)
- **Auto-commit**: Create commits at phase boundaries
- **Stop on error**: Halt immediately when task fails (preserve progress)
- **Run tests**: Validate after each phase using detected test command
- **Checklist warnings**: Prompt user if checklists incomplete
- **Language-agnostic**: Works with TypeScript, Python, Rust, Go, Java, etc.

---

## Next Steps After Implementation

**After feature-implement completes**:

1. **Manual testing**: Run quickstart.md scenarios (if exists)
2. **Code review**: Review git commits for quality
3. **Create PR**: `gh pr create` or project equivalent
4. **Deploy**: Staging/dev deployment
5. **Iterate**: Address PR feedback

**Or continue with P2/P3**: Re-run feature-implement to add more user stories

---

## Notes

- This skill updates tasks.md live (per Option A)
- Constitution validation runs during implementation (per Option A)
- Commits created at phase boundaries (not per-task)
- Can stop/resume at any task (progress preserved)
- MVP-first approach (can stop after P1)
- Error handling halts execution (safe rollback)
- Works with any language/framework (discovery-based)
- Detects build/test/migration commands from project
