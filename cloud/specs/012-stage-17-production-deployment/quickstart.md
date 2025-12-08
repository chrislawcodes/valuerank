# Quickstart: Stage 17 - Production Deployment

## Prerequisites

- [ ] GitHub account with ability to create forks
- [ ] Railway account (https://railway.app - free tier works)
- [ ] Access to `chrislawcodes/valuerank` repository
- [ ] LLM API keys for at least one provider (optional for initial deploy)

---

## Part 1: Infrastructure Code (Before Forking)

### Step 1: Complete Deployment Config on cloud-planning

Before forking, ensure these files exist in `cloud-planning` branch:

```
cloud/
├── .github/workflows/ci.yml     # GitHub Actions CI
├── apps/api/src/routes/health.ts  # Health check endpoint
├── railway.toml                  # Railway service config
└── nixpacks.toml                 # Python runtime config
```

### Step 2: Merge to Main

1. Create PR: `cloud-planning` → `main` on `chrislawcodes/valuerank`
2. Verify CI passes (all tests green)
3. Merge PR to main

**Verification**: Main branch now has all deployment configuration

---

## Part 2: Fork and Setup

### Step 3: Fork the Repository

1. Go to https://github.com/chrislawcodes/valuerank
2. Click "Fork" button (top right)
3. Select your personal account as destination
4. Wait for fork to complete

**Verification**: You now have `yourusername/valuerank` in your GitHub with deployment config in main

### Step 4: Clone Your Fork Locally

```bash
git clone https://github.com/yourusername/valuerank.git
cd valuerank

# Add upstream remote for syncing
git remote add upstream https://github.com/chrislawcodes/valuerank.git

# Verify remotes
git remote -v
# origin    https://github.com/yourusername/valuerank.git (fetch)
# origin    https://github.com/yourusername/valuerank.git (push)
# upstream  https://github.com/chrislawcodes/valuerank.git (fetch)
# upstream  https://github.com/chrislawcodes/valuerank.git (push)
```

---

## Part 3: Railway Project Setup

### Step 5: Create Railway Project

1. Go to https://railway.app/dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Authorize Railway to access your GitHub (if first time)
5. Select your forked `valuerank` repository
6. Railway will auto-detect the monorepo

### Step 6: Add PostgreSQL

1. In your Railway project, click "+ New"
2. Select "Database" → "PostgreSQL"
3. Wait for database to provision (< 1 minute)
4. Click the PostgreSQL service → "Variables" tab
5. Note that `DATABASE_URL` is now available

### Step 7: Configure API Service

1. Click "+ New" → "GitHub Repo" → select your fork
2. Name this service "api"
3. Go to service Settings:
   - **Root Directory**: `cloud`
   - **Build Command**: `npm ci && npm run build --workspace=@valuerank/api`
   - **Start Command**: `npm run start --workspace=@valuerank/api`
4. Go to Variables tab, add:
   ```
   NODE_ENV=production
   JWT_SECRET=<generate-32-char-secret>
   ```
5. Link the PostgreSQL `DATABASE_URL`:
   - Click "Add Variable Reference"
   - Select PostgreSQL service → `DATABASE_URL`

### Step 8: Configure Web Service

1. Click "+ New" → "GitHub Repo" → select your fork
2. Name this service "web"
3. Go to service Settings:
   - **Root Directory**: `cloud`
   - **Build Command**: `npm ci && npm run build --workspace=@valuerank/web`
   - **Start Command**: (leave empty for static site, or use `npx serve apps/web/dist`)
4. Go to Variables tab, add:
   ```
   VITE_API_URL=<api-service-url>/graphql
   ```
   (Get API URL from the api service's Settings → Domains)

---

## Part 4: Initial Deployment Verification

### Step 9: Verify API Deployment

1. Wait for API service build to complete (check "Deployments" tab)
2. Once deployed, find the API URL in Settings → Domains
3. Test health endpoint:
   ```bash
   curl https://your-api-url.railway.app/health
   ```
4. Expected response:
   ```json
   {
     "status": "ok",
     "timestamp": "2025-12-08T...",
     "components": {
       "database": { "status": "connected" },
       "queue": { "status": "healthy" }
     }
   }
   ```

### Step 10: Run Database Migration

If migration didn't run automatically:

1. Go to API service → "Settings" → "Deploy"
2. Set Release Command: `cd cloud && npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma`
3. Redeploy

Or manually via Railway shell:
1. Click API service → three dots → "Open Shell"
2. Run:
   ```bash
   cd cloud
   npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
   ```

### Step 11: Create Initial User

1. Open Railway shell for API service
2. Run:
   ```bash
   cd cloud
   npm run create-user
   # Follow prompts to create admin user
   ```

### Step 12: Verify Web Deployment

1. Wait for Web service build to complete
2. Find the Web URL in Settings → Domains
3. Navigate to URL in browser
4. Login with the user created in Step 11

**Expected**:
- Login page loads
- Can login with created credentials
- Main dashboard shows Definitions/Runs/Settings tabs

---

## Part 5: CI/CD Verification

### Step 13: Test GitHub Actions CI

1. Make a small change in your fork (e.g., add comment to README)
2. Create a pull request
3. Check "Actions" tab in GitHub
4. Verify CI workflow runs:
   - Lint passes
   - Typecheck passes
   - Tests pass

### Step 14: Test Automatic Deployment

1. Merge the PR to main
2. Go to Railway project dashboard
3. Watch for new deployment to start automatically
4. Verify deployment completes successfully
5. Check health endpoint still returns 200

---

## Troubleshooting

### Issue: Build fails with "Module not found"

**Fix**: Ensure Root Directory is `cloud` (not `cloud/apps/api`)

### Issue: Database connection fails

**Fix**:
1. Verify `DATABASE_URL` variable is linked from PostgreSQL service
2. Check PostgreSQL service is running (green status)

### Issue: Health check returns 503

**Fix**:
1. Check API logs for errors
2. Verify Prisma migration ran successfully
3. Check PgBoss tables exist: `pgboss.job`, `pgboss.schedule`

### Issue: Web can't connect to API

**Fix**:
1. Verify `VITE_API_URL` points to correct API domain
2. Check CORS is configured to allow web domain
3. Rebuild web service after changing env vars

### Issue: Python workers fail

**Fix**:
1. Check nixpacks.toml includes Python
2. Verify workers/ directory is in build context
3. Check Python dependencies installed

---

## Syncing with Upstream

To pull updates from the original repository:

```bash
# Fetch upstream changes
git fetch upstream

# Merge upstream main into your main
git checkout main
git merge upstream/main

# Push to your fork (triggers Railway deploy)
git push origin main
```

---

## Environment Variable Reference

### Required
| Variable | Example | Where to Set |
|----------|---------|--------------|
| `DATABASE_URL` | (auto from PostgreSQL) | Railway variable reference |
| `JWT_SECRET` | `abc123...` (32+ chars) | Railway API service |
| `NODE_ENV` | `production` | Railway API service |

### Optional (LLM Providers)
| Variable | Where to Get |
|----------|--------------|
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `GOOGLE_API_KEY` | https://makersuite.google.com/app/apikey |

---

## Success Checklist

- [ ] Repository forked to personal account
- [ ] Railway project created with PostgreSQL
- [ ] API service deployed and healthy
- [ ] Web service deployed and loading
- [ ] Can login and navigate dashboard
- [ ] GitHub Actions CI running on PRs
- [ ] Auto-deploy working on push to main
- [ ] Upstream remote configured for syncing
