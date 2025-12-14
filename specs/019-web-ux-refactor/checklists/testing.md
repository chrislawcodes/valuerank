# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [tasks.md](../tasks.md)

## Pre-Commit Requirements (per constitution § Testing Requirements)

- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] TypeScript compiles: `npx tsc --noEmit`
- Reference: `cloud/CLAUDE.md` § Testing Requirements

## Test Coverage (per constitution § Coverage Targets)

- [ ] Line coverage ≥ 80% (minimum)
- [ ] Branch coverage ≥ 75% (minimum)
- [ ] Function coverage ≥ 80% (minimum)
- [ ] New components have test files created
- [ ] Refactored components maintain existing coverage
- Command: `npm run test:coverage`
- Reference: `cloud/CLAUDE.md` § Testing Requirements

## New Component Test Requirements

### Card Component Tests
- [ ] Renders children correctly
- [ ] Applies variant styles (default, bordered, elevated, interactive)
- [ ] Handles onClick for interactive variant
- [ ] Shows hover effect on interactive cards

### Badge Component Tests
- [ ] Renders with all status variants (success, warning, error, info)
- [ ] Renders with tag variant (smaller, neutral)
- [ ] Renders with count variant (circular)
- [ ] Truncates long content with title attribute

### Modal Component Tests
- [ ] Traps focus when open
- [ ] Closes on Escape key press
- [ ] Closes on backdrop click
- [ ] Returns focus to trigger on close
- [ ] Prevents body scroll when open

### Select Component Tests
- [ ] Opens dropdown on click
- [ ] Navigates options with Arrow keys
- [ ] Selects option with Enter key
- [ ] Closes dropdown with Escape key
- [ ] Has proper ARIA attributes

## Refactored Component Testing

- [ ] Existing tests pass after file extraction
- [ ] Import paths updated in test files
- [ ] No tests skipped or disabled during refactor
- [ ] Integration between extracted components verified

## Visual/Manual Testing

### File Size Validation
- [ ] Command: `find . -name "*.tsx" -exec wc -l {} \; | awk '$1 > 400'`
- [ ] Expected: No output (all files under 400 lines)

### Button Migration Validation
- [ ] Command: `grep -r "<button" --include="*.tsx" | grep -v "import" | wc -l`
- [ ] Expected: 0 (no raw button elements)

### Responsive Testing
- [ ] Chrome DevTools at 375px viewport width
- [ ] No horizontal scroll on any page
- [ ] Mobile navigation opens/closes correctly
- [ ] Touch targets visually ≥44px

### Accessibility Testing
- [ ] Lighthouse accessibility audit score >90
- [ ] Keyboard navigation works throughout app
- [ ] Focus indicators visible on all interactive elements
- [ ] Screen reader announces dynamic content changes

## Test Structure (per constitution)

- [ ] Tests follow describe/it pattern
- [ ] Test file location mirrors source location
- [ ] Setup/fixtures extracted when reused
- [ ] Tests are isolated (no shared mutable state)
- Reference: `cloud/CLAUDE.md` § Test Structure

## Success Criteria Validation

- [ ] SC-001: Zero .tsx files exceed 400 lines ✓
- [ ] SC-002: Zero raw `<button>` elements remain ✓
- [ ] SC-003: Lighthouse accessibility >90 ✓
- [ ] SC-004: No horizontal scroll at 375px ✓
- [ ] SC-005: Component library covers common patterns ✓
- [ ] SC-006: Test coverage maintained or improved ✓
