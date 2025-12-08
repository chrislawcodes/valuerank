# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)

## Code Quality (per constitution cloud/CLAUDE.md)

### TypeScript Standards

- [ ] No `any` types - use proper typing or `unknown`
  - Reference: Constitution § TypeScript Standards
- [ ] Strict mode enabled in tsconfig
  - Reference: Constitution § Strict Mode Required
- [ ] Type inference for obvious cases, explicit for empty arrays
  - Reference: Constitution § Type Inference vs Explicit Types
- [ ] Types for data shapes, interfaces for contracts
  - Reference: Constitution § Prefer Types Over Interfaces

### File Organization

- [ ] All React components under 400 lines
  - Reference: Constitution § File Size Limits
  - Check: `wc -l apps/web/src/components/**/*.tsx`
- [ ] All hooks under 400 lines
  - Reference: Constitution § File Size Limits
- [ ] Imports ordered: Node → External → Internal → Relative
  - Reference: Constitution § Import Order

### Code Patterns

- [ ] Use urql hooks for GraphQL operations
  - Reference: plan.md § GraphQL Client Selection
- [ ] Use React Context for auth state
  - Reference: plan.md § Auth Token Storage
- [ ] Use React Router for navigation
  - Reference: plan.md § Routing Library

## Logging (per constitution)

- [ ] No console.log in production code
  - Reference: Constitution § Logging Standards
  - Note: Frontend can use console for development, but avoid in committed code
  - Use proper error boundaries for production errors

## Error Handling

- [ ] All API calls have error handling
  - Reference: plan.md § Error Handling Strategy
- [ ] 401 responses clear auth and redirect to login
- [ ] Network errors show user-friendly message with retry
- [ ] GraphQL errors displayed to user

## URL Construction

- [ ] API endpoints use Vite proxy, not hardcoded URLs
  - Reference: plan.md § Vite Proxy Configuration
  - Good: `/api/auth/login`, `/graphql`
  - Bad: `http://localhost:3001/api/auth/login`

## Component Quality

- [ ] Components are focused (single responsibility)
- [ ] Props are properly typed
- [ ] Loading/error states handled
- [ ] Empty states handled where applicable
