# Stage 1: Implementation Plan

> **Spec:** [stage-1-scaffolding.md](./stage-1-scaffolding.md)
>
> **Goal:** Establish foundational project structure, build system, and local development environment.

---

## Implementation Order

Tasks are ordered by dependency. Each task should be completed before moving to the next.

---

## Phase 1: Root Infrastructure

### Task 1.1: Create cloud directory structure

Create the base folder structure for the monorepo.

**Files to create:**
```
cloud/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── db/
│   └── shared/
├── docker/
└── .gitkeep files in empty dirs
```

**Verification:** `ls -la cloud/` shows expected structure

---

### Task 1.2: Docker Compose for PostgreSQL

Set up local PostgreSQL database.

**Files to create:**
- `cloud/docker-compose.yml`

**Content:** See spec section 3

**Verification:**
```bash
cd cloud && docker-compose up -d
docker-compose ps  # shows healthy
```

---

### Task 1.3: Root package.json and Turborepo

Configure npm workspaces and Turborepo.

**Files to create:**
- `cloud/package.json`
- `cloud/turbo.json`

**Content:** See spec sections 2.1, 2.2

**Verification:**
```bash
cd cloud && npm install  # installs turbo
npx turbo --version
```

---

### Task 1.4: TypeScript base configuration

Shared TypeScript config for all packages.

**Files to create:**
- `cloud/tsconfig.base.json`

**Content:** See spec section 2.3

**Verification:** File exists with strict mode enabled

---

### Task 1.5: ESLint and Prettier

Code quality tooling.

**Files to create:**
- `cloud/.eslintrc.cjs`
- `cloud/.prettierrc`

**Content:** See spec section 6

**Verification:**
```bash
cd cloud && npm run lint  # (will fail until packages exist)
```

---

### Task 1.6: Environment configuration

Environment variable template.

**Files to create:**
- `cloud/.env.example`
- `cloud/.env` (copy of .env.example)
- `cloud/.gitignore`

**Content:** See spec section 7

**.gitignore should include:**
```
node_modules/
dist/
.env
*.log
.turbo/
coverage/
```

**Verification:** `.env` file exists and is git-ignored

---

## Phase 2: Shared Packages

### Task 2.1: packages/shared - package setup

Create the shared utilities package.

**Files to create:**
- `cloud/packages/shared/package.json`
- `cloud/packages/shared/tsconfig.json`

**tsconfig.json:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Content:** See spec section 5.1

**Verification:**
```bash
cd cloud/packages/shared && npm run build
```

---

### Task 2.2: packages/shared - logger

Implement pino-based structured logging.

**Files to create:**
- `cloud/packages/shared/src/logger.ts`

**Content:** See spec section 5.1

**Verification:** Import and call `createLogger('test')` successfully

---

### Task 2.3: packages/shared - environment helpers

Type-safe environment variable access.

**Files to create:**
- `cloud/packages/shared/src/env.ts`

**Content:** See spec section 5.1

**Verification:** `getEnv('NODE_ENV', 'development')` returns value

---

### Task 2.4: packages/shared - error classes

Custom error types for the application.

**Files to create:**
- `cloud/packages/shared/src/errors.ts`

**Content:** See spec section 5.1

**Verification:** Can instantiate `AppError`, `NotFoundError`, `ValidationError`

---

### Task 2.5: packages/shared - index exports

Re-export all utilities.

**Files to create:**
- `cloud/packages/shared/src/index.ts`

**Content:** See spec section 5.1

**Verification:**
```bash
cd cloud/packages/shared && npm run build
ls dist/  # shows index.js, index.d.ts
```

---

### Task 2.6: packages/db - package setup

Create the database package.

**Files to create:**
- `cloud/packages/db/package.json`
- `cloud/packages/db/tsconfig.json`

**tsconfig.json:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Content:** See spec section 5.2

**Verification:** `npm install` in package succeeds

---

### Task 2.7: packages/db - Prisma schema

Minimal schema for Stage 1.

**Files to create:**
- `cloud/packages/db/prisma/schema.prisma`

**Content:** See spec section 5.2

**Verification:**
```bash
cd cloud/packages/db && npx prisma validate
```

---

### Task 2.8: packages/db - client singleton

Prisma client with dev-friendly settings.

**Files to create:**
- `cloud/packages/db/src/client.ts`
- `cloud/packages/db/src/index.ts`

**Content:** See spec section 5.2

**Verification:**
```bash
cd cloud/packages/db
npm run generate  # generates Prisma client
npm run build     # compiles TypeScript
```

---

## Phase 3: API Application

### Task 3.1: apps/api - package setup

Create the API application.

**Files to create:**
- `cloud/apps/api/package.json`
- `cloud/apps/api/tsconfig.json`

**tsconfig.json:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Content:** See spec section 4.1

**Verification:** `npm install` succeeds

---

### Task 3.2: apps/api - config

Environment configuration for API.

**Files to create:**
- `cloud/apps/api/src/config.ts`

**Content:** See spec section 4.1

**Verification:** Imports compile without errors

---

### Task 3.3: apps/api - health endpoint

Database health check route.

**Files to create:**
- `cloud/apps/api/src/health.ts`

**Content:** See spec section 4.1

**Verification:** Route handler compiles

---

### Task 3.4: apps/api - server

Express server setup with middleware.

**Files to create:**
- `cloud/apps/api/src/server.ts`

**Content:** See spec section 4.1

**Verification:** `createServer()` returns Express app

---

### Task 3.5: apps/api - entry point

Application entry with graceful startup.

**Files to create:**
- `cloud/apps/api/src/index.ts`

**Content:** See spec section 4.1

**Verification:**
```bash
cd cloud && npm run dev
# API starts on port 3001
curl http://localhost:3001/health
```

---

### Task 3.6: apps/api - vitest config

Test configuration.

**Files to create:**
- `cloud/apps/api/vitest.config.ts`

**Content:** See spec section 8

**Verification:** Config file passes TypeScript

---

### Task 3.7: apps/api - health tests

Unit tests for health endpoint.

**Files to create:**
- `cloud/apps/api/tests/health.test.ts`

**Dependencies to add:**
- `supertest` and `@types/supertest`

**Content:** See spec section 8

**Verification:**
```bash
cd cloud/apps/api && npm run test
# Tests pass
```

---

## Phase 4: Web Application

### Task 4.1: apps/web - package setup

Create the web application.

**Files to create:**
- `cloud/apps/web/package.json`
- `cloud/apps/web/tsconfig.json`
- `cloud/apps/web/tsconfig.node.json`

**tsconfig.json:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"]
}
```

**Content:** See spec section 4.2

**Verification:** `npm install` succeeds

---

### Task 4.2: apps/web - Vite config

Vite bundler configuration.

**Files to create:**
- `cloud/apps/web/vite.config.ts`

**Content:**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
});
```

**Verification:** Vite config is valid

---

### Task 4.3: apps/web - Tailwind config

Tailwind CSS setup.

**Files to create:**
- `cloud/apps/web/tailwind.config.js`
- `cloud/apps/web/postcss.config.js`

**tailwind.config.js:**
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

**postcss.config.js:**
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Verification:** Configs are valid

---

### Task 4.4: apps/web - HTML entry

HTML template for React.

**Files to create:**
- `cloud/apps/web/index.html`

**Content:**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cloud ValueRank</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Verification:** HTML is valid

---

### Task 4.5: apps/web - React entry

React application entry.

**Files to create:**
- `cloud/apps/web/src/main.tsx`
- `cloud/apps/web/src/index.css`
- `cloud/apps/web/src/vite-env.d.ts`

**main.tsx:**
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**index.css:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**vite-env.d.ts:**
```typescript
/// <reference types="vite/client" />
```

**Verification:** Files compile

---

### Task 4.6: apps/web - App component

Root React component.

**Files to create:**
- `cloud/apps/web/src/App.tsx`

**Content:** See spec section 4.2

**Verification:**
```bash
cd cloud && npm run dev
# Web app loads at http://localhost:3000
```

---

## Phase 5: Integration & Verification

### Task 5.1: Full build verification

Verify the complete build pipeline.

**Commands:**
```bash
cd cloud
npm install
npm run db:generate
npm run build
```

**Expected:** All packages compile without errors

---

### Task 5.2: Database migration

Push schema to PostgreSQL.

**Commands:**
```bash
cd cloud
docker-compose up -d
npm run db:push
npm run db:studio
```

**Expected:** Prisma Studio shows `users` table

---

### Task 5.3: Dev mode verification

Verify development workflow.

**Commands:**
```bash
cd cloud
npm run dev
```

**Expected:**
- API running on http://localhost:3001
- Web running on http://localhost:3000
- Hot reload works for both

---

### Task 5.4: Health endpoint verification

Test API health check.

**Commands:**
```bash
curl http://localhost:3001/health
```

**Expected:**
```json
{
  "status": "healthy",
  "timestamp": "...",
  "services": {
    "database": "connected"
  }
}
```

---

### Task 5.5: Test suite verification

Run all tests.

**Commands:**
```bash
cd cloud
npm run test
```

**Expected:** All tests pass

---

### Task 5.6: Lint verification

Check code quality.

**Commands:**
```bash
cd cloud
npm run lint
```

**Expected:** No errors

---

### Task 5.7: Create README

Document setup instructions.

**Files to create:**
- `cloud/README.md`

**Content:**
```markdown
# Cloud ValueRank

Cloud-native version of the ValueRank AI moral values evaluation framework.

## Quick Start

1. Start PostgreSQL:
   ```bash
   docker-compose up -d
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment:
   ```bash
   cp .env.example .env
   ```

4. Generate Prisma client:
   ```bash
   npm run db:generate
   ```

5. Push database schema:
   ```bash
   npm run db:push
   ```

6. Start development servers:
   ```bash
   npm run dev
   ```

- API: http://localhost:3001
- Web: http://localhost:3000

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all apps in dev mode |
| `npm run build` | Build all packages |
| `npm run test` | Run all tests |
| `npm run lint` | Lint all code |
| `npm run db:studio` | Open Prisma Studio |
```

---

## Phase 6: Completion

### Task 6.1: Mark Stage 1 complete

Update high-level spec to track completion.

**File to edit:** `cloud/specs/high-level.md`

**Change:**
```markdown
## Stage 1: Project Scaffolding & Infrastructure [ ]
```

**To:**
```markdown
## Stage 1: Project Scaffolding & Infrastructure [x]
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1.1-1.6 | Root infrastructure (Docker, Turborepo, configs) |
| 2 | 2.1-2.8 | Shared packages (logger, env, db client) |
| 3 | 3.1-3.7 | API application (Express, health endpoint, tests) |
| 4 | 4.1-4.6 | Web application (Vite, React, Tailwind) |
| 5 | 5.1-5.7 | Integration & verification |
| 6 | 6.1 | Mark complete |

**Total:** 28 tasks

---

## Exit Criteria

All items from [spec section 9](./stage-1-scaffolding.md#9-exit-criteria-checklist) must pass before marking complete.
