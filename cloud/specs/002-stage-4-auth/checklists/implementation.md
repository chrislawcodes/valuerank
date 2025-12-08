# Implementation Quality Checklist

**Purpose**: Validate code quality during implementation
**Feature**: [tasks.md](../tasks.md)
**Constitution**: [CLAUDE.md](../../../CLAUDE.md)

---

## Code Quality (per constitution)

- [ ] **No `any` types** - Use explicit types for all auth functions
  - Reference: CLAUDE.md § TypeScript Standards
  - Use `unknown` for truly unknown types, then narrow

- [ ] **Strict mode enabled** - All auth code compiles under strict tsconfig
  - Reference: CLAUDE.md § TypeScript Standards
  - Check: `noImplicitAny: true`, `strictNullChecks: true`

- [ ] **File size limits** - Each auth file under 400 lines
  - Reference: CLAUDE.md § File Size Limits
  - Split if needed: auth/middleware.ts, auth/services.ts, auth/cli.ts

---

## Logging (per constitution)

- [ ] **Use project logger** - Never use `console.log` in auth code
  - Reference: CLAUDE.md § Logging Standards
  - Use: `createLogger('auth')` from @valuerank/shared

- [ ] **Structured logging** - Log auth events with context
  - Reference: CLAUDE.md § Structured Logging Rules
  - Pattern: `log.info({ userId, method: 'jwt' }, 'Authentication successful')`

- [ ] **Log auth failures** - Capture failed attempts with context
  - Reference: CLAUDE.md § Log Levels
  - Use `warn` for failed attempts, `error` for exceptions

---

## Error Handling (per constitution)

- [ ] **Use AppError classes** - AuthenticationError extends AppError
  - Reference: CLAUDE.md § Error Handling
  - Pattern: `new AuthenticationError('Invalid credentials')`

- [ ] **Proper error codes** - Use consistent error codes
  - Reference: CLAUDE.md § Custom Error Classes
  - Codes: UNAUTHORIZED (401), VALIDATION_ERROR (400), NOT_FOUND (404)

- [ ] **Global error handler** - Auth errors flow through Express error handler
  - Reference: CLAUDE.md § Error Handling in Routes
  - Check: server.ts error handler catches auth errors

---

## Database Access (per constitution)

- [ ] **Use Prisma with type safety** - All user/apiKey queries typed
  - Reference: CLAUDE.md § Database Access
  - Use generated Prisma types, avoid raw SQL

- [ ] **No transactions needed** - Auth operations are single-row
  - Reference: CLAUDE.md § Use Transactions
  - Verify: No multi-step auth operations requiring rollback

---

## Security Best Practices

- [ ] **Password hashing** - bcrypt with cost factor 12
  - Never log or return plaintext passwords
  - Verify hash format starts with `$2b$12$`

- [ ] **API key hashing** - SHA-256 for storage
  - Full key shown only once at creation
  - Only hash and prefix stored in database

- [ ] **JWT secret** - Minimum 32 characters
  - Read from environment variable
  - Fail fast if missing or too short

- [ ] **Generic auth errors** - No email enumeration
  - Same message for wrong password and non-existent email
  - Pattern: "Invalid credentials"

- [ ] **Timing attacks** - Use constant-time comparison
  - bcrypt.compare handles this for passwords
  - Consider for API key validation

---

## Import Order (per constitution)

- [ ] **Follow import order** in all auth files:
  - Reference: CLAUDE.md § Code Organization
  ```typescript
  // 1. Node built-ins
  import crypto from 'crypto';

  // 2. External packages
  import bcrypt from 'bcrypt';
  import jwt from 'jsonwebtoken';

  // 3. Internal packages
  import { createLogger, AuthenticationError } from '@valuerank/shared';
  import { db } from '@valuerank/db';

  // 4. Relative imports
  import { JWTPayload } from './types';
  ```

---

## Code Organization

- [ ] **Single responsibility** - Each auth file has one purpose
  - auth/services.ts - JWT and password utilities
  - auth/api-keys.ts - API key generation and validation
  - auth/middleware.ts - Express middleware
  - auth/types.ts - Type definitions

- [ ] **Re-export pattern** - auth/index.ts exports public API
  - Reference: CLAUDE.md § Folder Structure
  - Export only what's needed by other modules
