# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## File Size Compliance (per constitution § File Size Limits)

- [ ] All React components under 400 lines
- [ ] When file exceeds limit: extract helper functions to separate modules
- [ ] When file exceeds limit: split into logical sub-modules
- [ ] When file exceeds limit: create folder with `index.ts` re-exporting
- Reference: `cloud/CLAUDE.md` § File Size Limits

## TypeScript Standards (per constitution § TypeScript Standards)

- [ ] No `any` types - use proper typing or `unknown` for truly unknown types
- [ ] Strict mode maintained (no changes to tsconfig.json strictness)
- [ ] All function signatures have explicit types
- [ ] Empty arrays have explicit type annotations
- [ ] Use `type` for data shapes, `interface` for contracts
- Reference: `cloud/CLAUDE.md` § TypeScript Standards

## CVA Pattern Compliance (per plan.md Decision 5)

- [ ] All new UI components use `cva()` for variant definitions
- [ ] All components export `VariantProps` for type inference
- [ ] Use `cn()` utility from `lib/utils.ts` for class composition
- [ ] Variants use semantic names (success, warning, error, info)
- [ ] Default variants specified for all components

## Component API Consistency

- [ ] All UI components accept `className` prop for customization
- [ ] All interactive components accept `disabled` prop
- [ ] All clickable components accept `onClick` handler
- [ ] Icon-only buttons require `aria-label` prop
- [ ] Components use consistent prop naming (variant, size, etc.)

## Accessibility Requirements

- [ ] All interactive elements are keyboard accessible
- [ ] Focus trap implemented for Modal component
- [ ] Escape key closes dismissible elements (Modal, Select dropdown)
- [ ] ARIA attributes present on custom controls (Select, Modal)
- [ ] Touch targets minimum 44x44px on mobile viewports

## Import Organization (per constitution)

- [ ] Imports ordered: Node built-ins → External packages → Internal packages → Relative
- [ ] Use barrel exports (`components/ui/index.ts`) where created
- [ ] No circular dependencies between modules

## Code Organization

- [ ] Extracted components are in logical folder structure
- [ ] Types are co-located or in dedicated `types.ts` files
- [ ] Hooks extracted to `hooks/` folder when reusable
- [ ] Utilities extracted to `lib/` folder when shared

## No Hardcoded Values

- [ ] Colors use Tailwind classes, not hardcoded hex values
- [ ] Spacing uses Tailwind utilities, not hardcoded pixels
- [ ] Breakpoints use Tailwind responsive prefixes (sm:, md:, lg:)
- [ ] Status-to-color mappings centralized, not repeated

## Button Migration Quality

- [ ] All buttons use Button component from `components/ui/Button`
- [ ] Appropriate variant selected (primary, secondary, ghost, danger)
- [ ] Loading states use `isLoading` prop, not custom implementation
- [ ] Icon-only buttons have `aria-label` for accessibility

## Responsive Implementation

- [ ] Mobile-first approach (base styles for mobile, breakpoints for larger)
- [ ] No horizontal scroll at 375px viewport
- [ ] Collapsible filters use consistent pattern
- [ ] Mobile nav uses consistent hamburger menu pattern
