# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## File Size Limits (per constitution)

- [ ] DefinitionViz.tsx under 400 lines
  - Reference: Constitution § File Size Limits
- [ ] DefinitionDiff.tsx under 400 lines
  - Reference: Constitution § File Size Limits
- [ ] DefinitionGroups.tsx under 400 lines
  - Reference: Constitution § File Size Limits
- [ ] Test files under 400 lines each
  - Reference: Constitution § File Size Limits

## TypeScript Standards (per constitution)

- [ ] No `any` types in any new files
  - Reference: Constitution § TypeScript Standards - No `any` Types
  - Use `unknown` if truly unknown type needed
- [ ] Strict mode enabled (inherited from project tsconfig)
  - Reference: Constitution § TypeScript Standards - Strict Mode Required
- [ ] All function signatures have explicit types
  - Reference: Constitution § TypeScript Standards - Type Inference vs Explicit Types
- [ ] Props interfaces properly defined for all components

## Code Organization (per constitution)

- [ ] Import order follows convention: Node → External → Internal → Relative
  - Reference: Constitution § Code Organization - Import Order
- [ ] Components placed in correct directory structure
  - Path: cloud/apps/web/src/components/compare/visualizations/
  - Reference: Constitution § Code Organization - Folder Structure per App

## Component Quality

- [ ] Monaco DiffEditor configured as read-only
- [ ] Graceful handling of null/undefined definitionContent
- [ ] Proper error boundaries for Monaco load failures
- [ ] Loading states for async operations
- [ ] Accessible (keyboard navigation works)

## No Hardcoded Values

- [ ] No hardcoded service URLs
- [ ] No magic numbers without named constants
- [ ] Configuration values extracted to constants

## Error Handling

- [ ] Missing data handled with placeholder text
- [ ] Monaco errors don't crash the application
- [ ] Edge cases from spec.md addressed
