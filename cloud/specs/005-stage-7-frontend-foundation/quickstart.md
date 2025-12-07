# Quickstart: Stage 7 - Frontend Foundation

Manual testing guide for verifying frontend authentication and navigation features.

## Prerequisites

- [ ] Docker Compose running (`docker-compose up -d` in `cloud/`)
- [ ] Database migrated (`npm run db:push`)
- [ ] At least one user exists (created via CLI)
- [ ] API running (`npm run dev` in root, or `cd apps/api && npm run dev`)
- [ ] Web running (`cd apps/web && npm run dev`)

### Create Test User (if needed)

```bash
cd cloud/apps/api
npm run create-user -- --email test@example.com --password testpassword123
```

---

## Testing User Story 1: Login to Web Application

**Goal**: Verify users can log in and access the application.

### Test 1.1: Unauthenticated Redirect

**Steps**:
1. Open browser to `http://localhost:3030/definitions`
2. Observe redirect behavior

**Expected**:
- Redirected to `/login`
- Login form displayed

---

### Test 1.2: Invalid Credentials

**Steps**:
1. Go to `http://localhost:3030/login`
2. Enter email: `wrong@example.com`
3. Enter password: `wrongpassword`
4. Click "Sign In"

**Expected**:
- Error message: "Invalid credentials" (or similar)
- Remain on login page
- Password field cleared

---

### Test 1.3: Valid Login

**Steps**:
1. Go to `http://localhost:3030/login`
2. Enter email: `test@example.com`
3. Enter password: `testpassword123`
4. Click "Sign In"

**Expected**:
- Redirected to dashboard or `/definitions`
- User name/email visible in header
- Navigation tabs visible

---

### Test 1.4: Session Persistence

**Steps**:
1. After successful login, open new browser tab
2. Go to `http://localhost:3030/definitions`

**Expected**:
- Page loads without login prompt
- User still authenticated
- Same user info in header

---

### Test 1.5: Token Expiry (Manual Check)

**Steps**:
1. Login successfully
2. In DevTools → Application → Local Storage
3. Find and delete the auth token
4. Navigate to any protected page

**Expected**:
- Redirected to login page

---

## Testing User Story 2: Navigate Between Sections

**Goal**: Verify navigation shell works correctly.

### Test 2.1: Navigation Tabs Present

**Steps**:
1. Login successfully
2. Observe navigation area

**Expected**:
- Tabs visible: Definitions, Runs, Experiments, Settings
- One tab highlighted as active

---

### Test 2.2: Tab Navigation

**Steps**:
1. Click "Definitions" tab
2. Click "Runs" tab
3. Click "Experiments" tab
4. Click "Settings" tab

**Expected**:
- URL changes to match section (`/definitions`, `/runs`, `/experiments`, `/settings`)
- Active tab styling updates
- No full page reload (smooth transition)
- Each page shows appropriate placeholder or content

---

### Test 2.3: Direct URL Access

**Steps**:
1. While logged in, type `http://localhost:3030/settings` directly in address bar
2. Press Enter

**Expected**:
- Settings page loads
- Navigation shows Settings tab as active

---

### Test 2.4: Logout

**Steps**:
1. Click on user name/avatar in header
2. Click "Logout" in dropdown

**Expected**:
- Redirected to login page
- Navigating to protected routes redirects to login

---

## Testing User Story 3: Manage API Keys

**Goal**: Verify API key CRUD operations work.

### Test 3.1: View API Keys (Empty State)

**Steps**:
1. Login successfully
2. Navigate to Settings
3. Find API Keys section

**Expected**:
- API Keys section visible
- Empty state message if no keys exist
- "Create API Key" button visible

---

### Test 3.2: Create API Key

**Steps**:
1. In Settings → API Keys, click "Create API Key"
2. Enter name: "Test Key 1"
3. Submit form

**Expected**:
- Dialog/modal shows full API key (starts with `vr_`)
- Copy button available
- Key shown only once warning
- After closing, key appears in list

---

### Test 3.3: Copy API Key

**Steps**:
1. After creating a key, click the copy button

**Expected**:
- Key copied to clipboard
- Visual feedback (button text changes or toast)

**Verification**:
- Paste clipboard content, verify it matches displayed key

---

### Test 3.4: API Key in List

**Steps**:
1. After closing creation modal, view API keys list

**Expected**:
- New key visible in list
- Shows: name, key prefix (`vr_xxxx...`), creation date
- Full key NOT shown (only prefix)

---

### Test 3.5: Revoke API Key

**Steps**:
1. Find the test key in the list
2. Click "Revoke" button
3. Confirm in dialog

**Expected**:
- Confirmation dialog appears first
- After confirm, key removed from list
- Success feedback

---

## Testing User Story 4: UI States

**Goal**: Verify loading, empty, and error states display correctly.

### Test 4.1: Loading State

**Steps**:
1. Login and navigate to Settings
2. In DevTools → Network, set throttling to "Slow 3G"
3. Refresh the page

**Expected**:
- Loading spinner/skeleton visible while fetching API keys
- Content appears after load completes

---

### Test 4.2: Empty State

**Steps**:
1. Ensure no API keys exist (revoke all)
2. Navigate to Settings → API Keys

**Expected**:
- Helpful empty state message (not blank)
- Suggests creating a key

---

### Test 4.3: Network Error

**Steps**:
1. Stop the API server
2. Try to refresh Settings page

**Expected**:
- Error message displayed
- "Retry" button available
- Clicking retry attempts fetch again

---

## Testing User Story 5: Protected Routes

**Goal**: Verify route protection works correctly.

### Test 5.1: All Routes Protected

**Steps**:
1. Logout (or clear localStorage)
2. Try to access each route:
   - `http://localhost:3030/definitions`
   - `http://localhost:3030/runs`
   - `http://localhost:3030/experiments`
   - `http://localhost:3030/settings`

**Expected**:
- All routes redirect to `/login`

---

### Test 5.2: Login Redirect When Authenticated

**Steps**:
1. Login successfully
2. Navigate to `http://localhost:3030/login`

**Expected**:
- Redirected away from login (to dashboard or `/definitions`)

---

### Test 5.3: Deep Link After Login

**Steps**:
1. Logout
2. Go to `http://localhost:3030/settings`
3. (Redirected to login)
4. Login successfully

**Expected**:
- After login, redirected to `/settings` (the originally intended page)

---

## Troubleshooting

### Issue: CORS errors in console

**Fix**: Ensure Vite proxy is configured in `vite.config.ts`:
```typescript
proxy: {
  '/api': { target: 'http://localhost:3001' },
  '/graphql': { target: 'http://localhost:3001' }
}
```

---

### Issue: Login fails with 500 error

**Fix**: Check API is running and database is accessible:
```bash
curl http://localhost:3001/health
```

---

### Issue: Token not persisting

**Fix**: Check browser allows localStorage:
```javascript
// In browser console
localStorage.setItem('test', '1');
localStorage.getItem('test'); // Should return '1'
```

---

### Issue: GraphQL queries fail with 401

**Fix**: Verify token is being sent. Check Network tab for:
- Authorization header: `Bearer <token>`
- If missing, check urql client auth exchange setup

---

## Verification Checklist

After all tests pass:

- [ ] Can login with valid credentials
- [ ] Invalid credentials show error
- [ ] Session persists across tabs
- [ ] All 4 nav tabs work
- [ ] URL routing works correctly
- [ ] Can create API key and see full key
- [ ] Can copy API key to clipboard
- [ ] API keys list shows prefix only
- [ ] Can revoke API key with confirmation
- [ ] Loading states show during fetch
- [ ] Error states show on network failure
- [ ] Empty states show when no data
- [ ] All protected routes redirect when logged out
- [ ] Login page redirects when already logged in
