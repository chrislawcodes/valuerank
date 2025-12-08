# Tasks: Stage 17 - Production Deployment

**Prerequisites**: plan.md, spec.md, quickstart.md

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel
- **[Story]**: User story (US1-US8)
- Include exact file paths from plan.md

---

## Phase 1: Infrastructure Code (On cloud-planning branch)

**Purpose**: Create deployment configuration before forking

⚠️ **CRITICAL**: Complete this phase BEFORE forking. Code must be in main for Railway auto-deploy to work.

### Health Check Endpoint

- [X] T001 Create `cloud/apps/api/src/routes/health.ts` with component status checks
- [X] T002 Add health route to `cloud/apps/api/src/index.ts` at `/health` path
- [X] T003 Add tests for health endpoint in `cloud/apps/api/tests/routes/health.test.ts`

### CI/CD Configuration

- [X] T004 [P] Create `cloud/.github/workflows/ci.yml` with lint, typecheck, test jobs
- [X] T005 [P] Create `cloud/railway.toml` with service configuration
- [X] T006 [P] Create `cloud/nixpacks.toml` for Python runtime configuration

### Build Scripts

- [X] T007 Update `cloud/package.json` with Railway-compatible build scripts (if needed)
- [X] T008 Verify `cloud/apps/api/package.json` has correct `build` and `start` scripts
- [X] T009 Verify `cloud/apps/web/package.json` has correct `build` script

### Test & Commit

- [X] T010 Run tests locally to verify health endpoint works
- [X] T011 Commit infrastructure code to `cloud-planning` branch
- [X] T012 Push to origin and verify GitHub Actions CI passes (if workflow active)

**Checkpoint**: Infrastructure code complete, ready to merge

---

## Phase 2: Merge & Fork

**Purpose**: Get code into main and create deployable fork

- [ ] T013 Create PR: `cloud-planning` → `main` on `chrislawcodes/valuerank`
- [ ] T014 Verify CI passes on PR (all tests green)
- [ ] T015 Merge PR to main
- [ ] T016 Fork `chrislawcodes/valuerank` to personal GitHub account
- [ ] T017 Clone fork locally
- [ ] T018 Add upstream remote: `git remote add upstream https://github.com/chrislawcodes/valuerank.git`

**Checkpoint**: Fork ready with all deployment config in main

---

## Phase 3: User Story 1 - Access Production Application (Priority: P1) 🎯 MVP

**Goal**: Application accessible via HTTPS URL with valid SSL

**Independent Test**: Navigate to production URL, verify login page loads

### Railway Project Setup

- [ ] T019 [US1] Create Railway account at https://railway.app (if needed)
- [ ] T020 [US1] Create new Railway project from dashboard
- [ ] T021 [US1] Add PostgreSQL database addon to project
- [ ] T022 [US1] Connect Railway to forked GitHub repository (grant access)

### API Service Configuration

- [ ] T023 [US1] Create API service pointing to fork
- [ ] T024 [US1] Set API root directory to `cloud`
- [ ] T025 [US1] Configure API build command: `npm ci && npm run build --workspace=@valuerank/api`
- [ ] T026 [US1] Configure API start command: `npm run start --workspace=@valuerank/api`
- [ ] T027 [US1] Configure API release command: `npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma`

### Web Service Configuration

- [ ] T028 [US1] Create Web service pointing to fork
- [ ] T029 [US1] Set Web root directory to `cloud`
- [ ] T030 [US1] Configure Web build command: `npm ci && npm run build --workspace=@valuerank/web`

### Initial Deployment

- [ ] T031 [US1] Trigger first deployment and monitor build logs
- [ ] T032 [US1] Verify database migration runs successfully
- [ ] T033 [US1] Verify API health check returns 200
- [ ] T034 [US1] Set `VITE_API_URL` to API service domain in Web service
- [ ] T035 [US1] Verify Web frontend loads in browser

**Checkpoint**: Application accessible, login page loads

---

## Phase 4: User Story 4 - Environment Variables (Priority: P1) 🎯 MVP

**Goal**: All secrets configured securely in Railway

**Independent Test**: Services use correct environment values, LLM calls succeed

### Required Variables

- [ ] T036 [US4] Set `NODE_ENV=production` in API service
- [ ] T037 [US4] Generate and set `JWT_SECRET` (32+ chars) in API service
- [ ] T038 [US4] Link `DATABASE_URL` from PostgreSQL service to API

### Optional LLM Provider Keys

- [ ] T039 [P] [US4] Set `OPENAI_API_KEY` in API service (if available)
- [ ] T040 [P] [US4] Set `ANTHROPIC_API_KEY` in API service (if available)
- [ ] T041 [P] [US4] Set `GOOGLE_API_KEY` in API service (if available)

### Verification

- [ ] T042 [US4] Redeploy API service to pick up new variables
- [ ] T043 [US4] Verify health check still passes
- [ ] T044 [US4] Create initial admin user via Railway shell

**Checkpoint**: Environment properly configured, can login

---

## Phase 5: User Story 5 - Health Check Endpoints (Priority: P1) 🎯 MVP

**Goal**: Comprehensive health endpoint for monitoring

**Independent Test**: `/health` returns component status JSON

### Production Verification

- [ ] T045 [US5] Verify `/health` returns database status: `connected`
- [ ] T046 [US5] Verify `/health` returns queue status: `healthy`
- [ ] T047 [US5] Verify `/health` returns worker status (Python available)
- [ ] T048 [US5] Verify Railway uses health check for zero-downtime deploys

**Checkpoint**: Health monitoring operational

---

## Phase 6: User Story 3 - Automated Deployments (Priority: P1) 🎯 MVP

**Goal**: CI/CD pipeline triggers automatic deploys on main branch push

**Independent Test**: Push commit to main, verify auto-deployment

### GitHub Integration

- [ ] T049 [US3] Verify Railway webhook connected to fork
- [ ] T050 [US3] Configure Railway to deploy from `main` branch
- [ ] T051 [US3] Enable "Wait for CI" option in Railway (optional)

### Test Auto-Deploy

- [ ] T052 [US3] Make small change in fork (e.g., update comment)
- [ ] T053 [US3] Push to main branch
- [ ] T054 [US3] Verify Railway triggers automatic deployment
- [ ] T055 [US3] Verify deployment completes within 10 minutes
- [ ] T056 [US3] Verify health check passes after deploy

**Checkpoint**: Auto-deploy working on push to main

---

## Phase 7: User Story 2 - Railway Config Refinements (Priority: P1)

**Goal**: All services configured correctly with proper watch paths

**Independent Test**: Changes to web don't rebuild API, and vice versa

### Watch Paths

- [ ] T057 [US2] Configure API service watch paths in Railway dashboard
- [ ] T058 [US2] Configure Web service watch paths in Railway dashboard

### Python Runtime Verification

- [ ] T059 [US2] Verify nixpacks.toml includes Python 3.11
- [ ] T060 [US2] Test Python worker via probe job (if LLM keys configured)

**Checkpoint**: All services properly configured

---

## Phase 8: User Story 6 - Database Backups (Priority: P2)

**Goal**: Automatic daily backups enabled

**Independent Test**: Verify backup settings in Railway dashboard

- [ ] T061 [US6] Verify Railway PostgreSQL automatic backups enabled
- [ ] T062 [US6] Document backup retention period (7 days default)
- [ ] T063 [US6] Test manual backup trigger (optional)

**Checkpoint**: Database backups configured

---

## Phase 9: User Story 7 - Custom Domain & SSL (Priority: P2)

**Goal**: Professional domain with HTTPS

**Independent Test**: Access app via custom domain with valid SSL

- [ ] T064 [US7] Choose domain structure (e.g., app.valuerank.ai, api.valuerank.ai)
- [ ] T065 [US7] Add custom domain in Railway for Web service
- [ ] T066 [US7] Add custom domain in Railway for API service
- [ ] T067 [US7] Configure DNS records (CNAME to Railway)
- [ ] T068 [US7] Verify SSL certificate provisioned by Railway
- [ ] T069 [US7] Update `VITE_API_URL` to use custom API domain

**Checkpoint**: Custom domain working with HTTPS

---

## Phase 10: User Story 8 - Error Tracking (Priority: P3)

**Goal**: Visibility into production errors

**Independent Test**: Trigger error, verify it appears in tracking dashboard

- [ ] T070 [US8] Evaluate Sentry vs Railway built-in logging (decision)
- [ ] T071 [US8] If Sentry: Create Sentry project and get DSN
- [ ] T072 [US8] If Sentry: Install @sentry/node in API
- [ ] T073 [US8] If Sentry: Configure Sentry in `cloud/apps/api/src/index.ts`
- [ ] T074 [US8] If Sentry: Upload source maps during build
- [ ] T075 [US8] Verify error tracking captures unhandled exceptions

**Checkpoint**: Error visibility in production

---

## Phase 11: Polish & Documentation

**Purpose**: Final verification and documentation

### Documentation

- [ ] T076 [P] Update `cloud/docs/deployment.md` with Railway instructions
- [ ] T077 [P] Document upstream sync process in README or docs
- [ ] T078 [P] Document environment variables reference

### Final Verification

- [ ] T079 Run through quickstart.md verification checklist
- [ ] T080 Verify all P1 success criteria met
- [ ] T081 Test end-to-end: login → create definition → start run

**Checkpoint**: Production deployment complete

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Infrastructure Code) ─── On cloud-planning branch
    └── Phase 2 (Merge & Fork) ─── BLOCKS ALL RAILWAY SETUP
            └── Phase 3 (US1: Access) ─── Core Railway setup
                └── Phase 4 (US4: Env Vars) ─── Secrets & Login
                    └── Phase 5 (US5: Health) ─── Verify monitoring
                        └── Phase 6 (US3: Auto-Deploy) ─── CI/CD
                            └── Phase 7 (US2: Refinements)
                                ├── Phase 8 (US6: Backups) [P2]
                                ├── Phase 9 (US7: Domain) [P2]
                                └── Phase 10 (US8: Errors) [P3]
                                        └── Phase 11 (Polish)
```

### Critical Path (MVP)

1. **Phase 1**: Create health endpoint + CI config (code changes)
2. **Phase 2**: Merge to main, fork repo
3. **Phase 3**: Railway project + first deploy
4. **Phase 4**: Configure secrets, create admin user
5. **Phase 5**: Verify health checks work
6. **Phase 6**: Test auto-deploy pipeline

### Parallel Opportunities

- T004, T005, T006: CI and Railway configs (different files)
- T039, T040, T041: LLM provider keys (independent)
- T076, T077, T078: Documentation updates (different files)

---

## Task Statistics

- **Total Tasks**: 81
- **Phase 1 (Infrastructure)**: 12 tasks
- **Phase 2 (Merge & Fork)**: 6 tasks
- **P1 (MVP) Tasks**: 44
- **P2 Tasks**: 9
- **P3 Tasks**: 6
- **Polish Tasks**: 6
- **Parallel Opportunities**: 9 tasks marked [P]
