# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per constitution)

Per `/Users/chrisanderson/Code/valuerank/cloud/CLAUDE.md`:

- [ ] All files < 400 lines
  - Reference: Constitution § File Size Limits
- [ ] No `any` types used (use `unknown` if truly unknown)
  - Reference: Constitution § TypeScript Standards
- [ ] Strict TypeScript mode enabled (strictNullChecks, noImplicitAny)
  - Reference: Constitution § TypeScript Standards
- [ ] Type inference used for obvious cases, explicit types for function signatures
  - Reference: Constitution § TypeScript Standards
- [ ] Types used for data shapes, interfaces for contracts/services
  - Reference: Constitution § TypeScript Standards

## Import Order (per constitution)

- [ ] Imports follow order: Node built-ins → External packages → Internal (@valuerank/*) → Relative
  - Reference: Constitution § Code Organization

## Component Organization (per constitution)

- [ ] New components in correct directories:
  - Components: `apps/web/src/components/analysis/`
  - Pages: `apps/web/src/pages/`
  - Hooks: `apps/web/src/hooks/`
  - Reference: Constitution § Folder Structure per App

## Logging (per constitution)

- [ ] No `console.log` statements in production code
  - Reference: Constitution § Logging Standards
- [ ] Use centralized logger if backend logging needed
  - Reference: Constitution § Logger Abstraction

## Error Handling (per constitution)

- [ ] Custom error classes used where appropriate
  - Reference: Constitution § Custom Error Classes
- [ ] Errors forwarded to error middleware (not swallowed)
  - Reference: Constitution § Error Handling in Routes

## React Best Practices

- [ ] Components are functional (no class components)
- [ ] Hooks follow rules of hooks
- [ ] useCallback/useMemo used appropriately for performance
- [ ] Props are typed explicitly
- [ ] Event handlers don't create new functions on each render (where performance matters)

## Accessibility

- [ ] Interactive elements are keyboard accessible
- [ ] ARIA labels on icon-only buttons
- [ ] Color contrast sufficient for text
- [ ] Focus states visible
