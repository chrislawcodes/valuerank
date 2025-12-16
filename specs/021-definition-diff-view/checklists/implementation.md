# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## File Size Limits (per constitution)

- [X] DefinitionViz.tsx under 400 lines (44 lines)
  - Reference: Constitution § File Size Limits
- [X] DefinitionDiff.tsx under 400 lines (229 lines)
  - Reference: Constitution § File Size Limits
- [X] DefinitionGroups.tsx under 400 lines (179 lines)
  - Reference: Constitution § File Size Limits
- [X] Test files under 400 lines each
  - Reference: Constitution § File Size Limits

## TypeScript Standards (per constitution)

- [X] No `any` types in any new files
  - Reference: Constitution § TypeScript Standards - No `any` Types
  - Use `unknown` if truly unknown type needed
- [X] Strict mode enabled (inherited from project tsconfig)
  - Reference: Constitution § TypeScript Standards - Strict Mode Required
- [X] All function signatures have explicit types
  - Reference: Constitution § TypeScript Standards - Type Inference vs Explicit Types
- [X] Props interfaces properly defined for all components

## Code Organization (per constitution)

- [X] Import order follows convention: Node → External → Internal → Relative
  - Reference: Constitution § Code Organization - Import Order
- [X] Components placed in correct directory structure
  - Path: cloud/apps/web/src/components/compare/visualizations/
  - Reference: Constitution § Code Organization - Folder Structure per App

## Component Quality

- [X] Monaco DiffEditor configured as read-only
- [X] Graceful handling of null/undefined definitionContent
- [X] Proper error boundaries for Monaco load failures
- [X] Loading states for async operations
- [X] Accessible (keyboard navigation works)

## No Hardcoded Values

- [X] No hardcoded service URLs
- [X] No magic numbers without named constants
- [X] Configuration values extracted to constants

## Error Handling

- [X] Missing data handled with placeholder text
- [X] Monaco errors don't crash the application
- [X] Edge cases from spec.md addressed
