# Stage 15: Data Export & CLI Compatibility

> **Feature Branch**: `feature/stage-15-data-export`
> **Created**: 2025-12-08
> **Status**: Draft
> **Input**: Enable bulk data export and maintain CLI tool compatibility, with emphasis on MD definition format and YAML scenario export

---

## Overview

This stage enables data portability between Cloud ValueRank and the original CLI tooling. The primary goals are:

1. **Definition Import/Export (MD Format)** - Round-trip definitions to/from the devtool markdown format
2. **Scenario Export (YAML Format)** - Export generated scenarios in CLI-compatible YAML format
3. **Bulk Data Export** - Export runs, transcripts, and analysis results in multiple formats
4. **Business Continuity** - Ensure fallback to CLI tool remains viable if cloud costs become unwieldy

---

## User Scenarios & Testing

### User Story 1 - Export Definition as Markdown (Priority: P1)

A researcher wants to export a definition from Cloud ValueRank to edit locally in their text editor or share with a colleague who uses the CLI tool.

**Why this priority**: This is the critical path for interoperability with existing CLI tooling and devtool. Without MD export, users cannot use external tools to edit definitions.

**Independent Test**: Export a single definition via the UI or API, verify the resulting .md file can be parsed by devtool's `parseScenarioMd()` function.

**Acceptance Scenarios**:

1. **Given** a definition exists in Cloud ValueRank, **When** user clicks "Export as Markdown", **Then** browser downloads a `.md` file with correct frontmatter, preamble, template, dimensions, and matching rules sections.

2. **Given** a definition with 3 dimensions and matching rules, **When** exported as MD, **Then** all dimension tables are properly formatted and matching rules section is included.

3. **Given** a definition with special characters in text fields, **When** exported, **Then** characters are properly escaped/preserved for round-trip fidelity.

---

### User Story 2 - Import Definition from Markdown (Priority: P1)

A researcher has an existing `.md` definition file from devtool or a colleague, and wants to import it into Cloud ValueRank to run evaluations.

**Why this priority**: Without import capability, users cannot migrate existing work into Cloud ValueRank, blocking adoption.

**Independent Test**: Take an existing devtool .md file, import via UI, verify the resulting Cloud definition has all fields populated correctly.

**Acceptance Scenarios**:

1. **Given** a valid `.md` file from devtool, **When** user uploads via "Import Definition" dialog, **Then** a new Definition is created with all fields mapped correctly (name, preamble, template, dimensions, matching rules).

2. **Given** a `.md` file with YAML frontmatter containing `name`, `base_id`, `category`, **When** imported, **Then** definition name matches frontmatter name and content includes base_id and category.

3. **Given** an invalid `.md` file (missing required sections), **When** user attempts import, **Then** validation errors are displayed explaining what's missing.

4. **Given** a duplicate definition name, **When** importing, **Then** user is prompted to rename or create as fork.

---

### User Story 3 - Export Scenarios as CLI-Compatible YAML (Priority: P1)

A researcher has completed scenario generation in Cloud and wants to run evaluations using the original Python CLI pipeline on a local machine.

**Why this priority**: This is the primary business continuity requirement - ensuring cloud data can be used with CLI tools.

**Independent Test**: Export scenarios for a definition, run the exported YAML through the CLI `probe.py` script, verify it executes without errors.

**Acceptance Scenarios**:

1. **Given** a definition with generated scenarios, **When** user exports scenarios as YAML, **Then** output matches the CLI format with `preamble` and `scenarios` map containing `base_id`, `category`, `subject`, `body` for each scenario.

2. **Given** scenarios with multi-line body text, **When** exported, **Then** YAML uses proper block scalar notation (|) for body field.

3. **Given** a definition with no generated scenarios, **When** user attempts YAML export, **Then** helpful message explains scenarios must be generated first.

---

### User Story 4 - Export Run Results (Bulk) (Priority: P2)

An analyst wants to download all transcripts and analysis results from a run for offline analysis in Jupyter, R, or pandas.

**Why this priority**: Important for data science workflows but not blocking core functionality.

**Independent Test**: Export a completed run, verify the archive contains all transcripts, analysis results, and metadata in readable formats.

**Acceptance Scenarios**:

1. **Given** a completed run with transcripts, **When** user exports as JSON Lines, **Then** each line is a valid JSON object containing transcript content, model info, scenario info, and decision summary.

2. **Given** a completed run, **When** user exports as CSV, **Then** output is a flat table with columns for scenario_id, model_id, decision_code, decision_text, and dimension scores from analysis.

3. **Given** a run with analysis results, **When** exported, **Then** analysis results are included in the export bundle.

4. **Given** a large run (100+ transcripts), **When** user requests export, **Then** system generates export asynchronously and provides download link when ready.

---

### User Story 5 - Export Full Run Bundle (CLI Format) (Priority: P2)

A researcher wants to export a complete run in the same directory structure as CLI tool output for archival or re-analysis with CLI tools.

**Why this priority**: Supports business continuity but not required for daily operation.

**Independent Test**: Export a run bundle, verify structure matches CLI output format (`transcripts/*.md`, `manifest.yaml`).

**Acceptance Scenarios**:

1. **Given** a completed run, **When** exported as CLI bundle, **Then** output is a zip file containing:
   - `manifest.yaml` with run metadata and model mapping
   - `transcripts/` directory with one `.md` file per transcript
   - Optional: `analysis/` directory with analysis results

2. **Given** transcripts with model_id and model_version, **When** exported to manifest.yaml, **Then** model mapping includes both fields for reproducibility.

3. **Given** a definition snapshot was captured in transcripts, **When** exported, **Then** definition snapshot is included in manifest or separate file.

---

### User Story 6 - Generate Download URLs with Expiry (Priority: P2)

A user exports a large dataset and needs to share the download link with a colleague, with the link expiring for security.

**Why this priority**: Important for collaboration but system works without it.

**Independent Test**: Generate download URL, verify it works immediately and fails after expiry period.

**Acceptance Scenarios**:

1. **Given** an export job completes, **When** download URL is generated, **Then** URL is valid for 24 hours by default.

2. **Given** a download URL has expired, **When** user attempts to access, **Then** returns 410 Gone with message "Download link expired".

3. **Given** user requests custom expiry (1-168 hours), **When** URL is generated, **Then** URL expires at specified time.

---

### User Story 7 - Import Scenarios from YAML (Priority: P3)

A user has existing CLI-format YAML scenarios and wants to import them into Cloud to leverage cloud-based analysis.

**Why this priority**: Nice-to-have for migration; users can re-generate scenarios in cloud.

**Independent Test**: Import existing CLI YAML file, verify scenarios are created and linked to a definition.

**Acceptance Scenarios**:

1. **Given** a CLI-format YAML file with scenarios, **When** user imports, **Then** system creates a new Definition (or links to existing) and creates Scenario records for each scenario entry.

2. **Given** YAML scenarios with preamble, **When** imported, **Then** preamble is captured in definition content.

3. **Given** YAML referencing non-existent definition, **When** imported, **Then** user is prompted to create new definition or select existing.

---

### User Story 8 - Flexible Aggregation Export (Priority: P3)

An analyst wants to export custom aggregated data (e.g., average scores by model family, by category) for cohort analysis.

**Why this priority**: Advanced use case; basic export covers most needs.

**Independent Test**: Request aggregated export with custom grouping, verify output matches specified aggregation.

**Acceptance Scenarios**:

1. **Given** multiple completed runs, **When** user requests aggregation by model_id, **Then** export contains one row per model with aggregated statistics.

2. **Given** runs across different definitions, **When** user requests cohort export, **Then** data from specified cohort criteria is included.

3. **Given** custom GROUP BY parameters (model, category, dimension scores), **When** export requested, **Then** aggregation respects all specified dimensions.

---

## Edge Cases

### Definition Export/Import
- **Empty dimensions array**: Export as MD with empty Dimensions section; import accepts this
- **Very long preamble/template**: Export preserves full text; no truncation
- **Special characters** (`|`, `>`, `#`, etc.): Properly escaped in YAML/MD output
- **Unicode content**: Full UTF-8 support in all formats

### YAML Scenario Export
- **Zero scenarios generated**: Return error explaining scenarios needed
- **Scenario names with special characters**: Sanitize to valid YAML keys
- **Very large scenario sets (1000+)**: Stream output, don't buffer entire file

### Bulk Export
- **Export while run in progress**: Disallow or warn about partial data
- **Run with no transcripts**: Return empty archive with manifest only
- **Concurrent export requests**: Queue and process sequentially per user
- **Export of deleted/soft-deleted data**: Exclude soft-deleted records

### Download URLs
- **Multiple simultaneous downloads**: Allow; track separately
- **Expiry during download**: Allow completion of in-progress downloads
- **Storage cleanup**: Background job removes expired exports

---

## Requirements

### Functional Requirements

#### Definition MD Format
- **FR-001**: System MUST export definitions to markdown format matching devtool's `serializeScenarioMd()` output structure
- **FR-002**: System MUST import markdown files matching devtool's `parseScenarioMd()` expected format
- **FR-003**: System MUST preserve round-trip fidelity: `parse(serialize(def))` equals original definition data
- **FR-004**: System MUST validate imported markdown and return specific error messages for malformed input

#### Scenario YAML Format
- **FR-005**: System MUST export scenarios in CLI-compatible YAML format with `preamble` and `scenarios` map
- **FR-006**: System MUST use YAML block scalar notation (`|`) for multi-line body fields
- **FR-007**: Scenario YAML export MUST be directly usable by CLI `probe.py` without modification

#### Bulk Export
- **FR-008**: System MUST support JSON Lines export format for transcripts with one JSON object per line
- **FR-009**: System MUST support CSV export format with flat table structure for spreadsheet compatibility
- **FR-010**: System MUST support CLI bundle export format (zip with transcripts/*.md and manifest.yaml)
- **FR-011**: Large exports (>1000 records or >10MB) MUST be processed asynchronously with status polling

#### Download Management
- **FR-012**: System MUST generate time-limited download URLs with configurable expiry (default 24 hours)
- **FR-013**: Expired download URLs MUST return HTTP 410 Gone
- **FR-014**: System MUST clean up expired export files within 24 hours of expiry

#### API Design
- **FR-015**: Export endpoints MUST be available via both GraphQL mutations and REST endpoints
- **FR-016**: All export operations MUST require authentication (JWT or API key)
- **FR-017**: Export operations MUST log audit trail (user, timestamp, export type, record count)

---

## Success Criteria

- **SC-001**: Definition exported as MD can be imported into devtool and parsed without errors
- **SC-002**: Scenarios exported as YAML can be executed by CLI `probe.py` without modification
- **SC-003**: 95% round-trip fidelity for definition MD export/import (field-by-field comparison)
- **SC-004**: Bulk exports of 1000 transcripts complete in under 30 seconds
- **SC-005**: Download URLs work for the specified expiry period and fail correctly after
- **SC-006**: All export operations maintain 80%+ test coverage per project constitution

---

## Key Entities

### ExportJob (New)
Tracks async export operations:
- `id`: Unique identifier
- `type`: 'definition_md' | 'scenarios_yaml' | 'run_bundle' | 'bulk_json' | 'bulk_csv'
- `status`: 'pending' | 'processing' | 'completed' | 'failed'
- `input`: JSON with export parameters (run_id, definition_id, format options)
- `output_url`: Signed download URL when completed
- `expires_at`: When download URL expires
- `created_at`, `completed_at`
- `error`: Error message if failed

### Definition.content Schema (Extended)
Ensure content JSONB includes all fields needed for MD round-trip:
- `base_id`: Scenario base identifier
- `category`: Category string
- `preamble`: Full preamble text
- `template`: Template with placeholders
- `dimensions`: Array of dimension objects
- `matchingRules`: Optional constraint rules

---

## Assumptions

1. **Devtool MD format is stable**: The scenarioMd.ts parser/serializer defines the canonical format
2. **CLI YAML format is stable**: Existing CLI scenarios/*.yaml files define the target format
3. **Single-user exports**: No concurrent export of same data by same user needed
4. **Cloud storage available**: Temporary file storage exists for export artifacts
5. **No streaming downloads**: Downloads are complete files, not streamed (simplifies implementation)

---

## Out of Scope

- **Import from Parquet**: Only export to Parquet; import is YAML/MD only
- **Real-time sync with CLI**: One-way export, not bidirectional sync
- **Selective field export**: Export full records, not custom field subsets
- **Export scheduling**: Manual trigger only, no scheduled exports
- **Export history UI**: Track in database but no dedicated UI for viewing past exports

---

## Constitution Compliance

**Validated against cloud/CLAUDE.md**:

| Requirement | Compliance |
|-------------|------------|
| File size < 400 lines | Split export services by format type |
| No `any` types | Use typed export interfaces |
| Test coverage 80%+ | All export functions testable |
| Structured logging | Log all export operations with context |
| Error handling | Custom ExportError class |

---

## Related Documents

- `devtool/src/server/utils/scenarioMd.ts` - Canonical MD format parser/serializer
- `scenarios/**/*.yaml` - Example CLI-compatible scenario files
- `cloud/docs/product-spec.md` - CLI Compatibility section
- `cloud/docs/database-design.md` - JSONB schema versioning
