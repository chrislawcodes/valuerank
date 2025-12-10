# Quickstart: Stage 4 - Authentication System

## Prerequisites

- [ ] Development environment running (`npm run dev` in cloud/)
- [ ] PostgreSQL database running (`docker-compose up -d`)
- [ ] Database migrated (`npm run db:push`)
- [ ] `JWT_SECRET` environment variable set (32+ characters)
- [ ] Test user created (see User Story 1)

---

## Testing User Story 1: Create User via CLI

**Goal**: Verify users can be created via CLI command with proper password hashing.

**Steps**:

1. Run the create-user command:
   ```bash
   cd cloud
   npm run create-user -- --email test@example.com --password "securepass123"
   ```

2. Verify success message in output:
   ```
   User created successfully
   Email: test@example.com
   ID: clxxxxxxxxxxxxxxxxx
   ```

3. Verify in database (optional):
   ```bash
   docker exec -it valuerank-postgres psql -U valuerank -d valuerank -c \
     "SELECT id, email, password_hash FROM users WHERE email = 'test@example.com';"
   ```

**Expected**:
- User record created in database
- Password stored as bcrypt hash (starts with `$2b$12$`)
- `created_at` timestamp set
- No plaintext password visible

**Error Cases to Test**:

```bash
# Duplicate email
npm run create-user -- --email test@example.com --password "another123"
# Expected: Error - email already exists

# Short password
npm run create-user -- --email new@example.com --password "short"
# Expected: Error - password must be at least 8 characters

# Invalid email
npm run create-user -- --email "not-an-email" --password "validpass123"
# Expected: Error - invalid email format
```

---

## Testing User Story 2: Login with Email/Password

**Goal**: Verify login endpoint returns JWT token for valid credentials.

**Steps**:

1. Login with valid credentials:
   ```bash
   curl -X POST http://localhost:3030/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com", "password": "securepass123"}'
   ```

2. Verify response contains token and user:
   ```json
   {
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "user": {
       "id": "clxxxxxxxxxx",
       "email": "test@example.com"
     }
   }
   ```

3. Decode JWT to verify payload (use jwt.io or):
   ```bash
   # Extract payload (middle part between dots)
   echo "TOKEN_HERE" | cut -d. -f2 | base64 -d 2>/dev/null
   ```

   Expected payload:
   ```json
   {
     "sub": "clxxxxxxxxxx",
     "email": "test@example.com",
     "iat": 1701849600,
     "exp": 1701936000
   }
   ```

**Expected**:
- JWT returned with 24-hour expiry
- User ID in `sub` claim
- `last_login_at` updated in database

**Error Cases to Test**:

```bash
# Wrong password
curl -X POST http://localhost:3030/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "wrongpassword"}'
# Expected: 401 {"error": "UNAUTHORIZED", "message": "Invalid credentials"}

# Non-existent email
curl -X POST http://localhost:3030/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "nobody@example.com", "password": "anypassword"}'
# Expected: 401 {"error": "UNAUTHORIZED", "message": "Invalid credentials"}
```

---

## Testing User Story 3: Access Protected GraphQL Routes

**Goal**: Verify GraphQL requires authentication and accepts valid JWT.

**Steps**:

1. Try GraphQL query without auth:
   ```bash
   curl -X POST http://localhost:3030/graphql \
     -H "Content-Type: application/json" \
     -d '{"query": "{ definitions { id name } }"}'
   ```

   Expected: 401 Unauthorized

2. Try with valid JWT (use token from login):
   ```bash
   curl -X POST http://localhost:3030/graphql \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"query": "{ definitions { id name } }"}'
   ```

   Expected: Success, definitions returned

3. Try with expired token (create one with past expiry):
   Expected: 401 with "Token expired" message

**Expected**:
- Unauthenticated requests return 401
- Valid JWT grants access
- Expired/malformed tokens rejected with appropriate message

**Special Case - Introspection**:

```bash
# Introspection should work without auth (for schema discovery)
curl -X POST http://localhost:3030/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}'
# Expected: Success (schema returned)
```

---

## Testing User Story 4: Create API Key for MCP

**Goal**: Verify API keys can be created and full key is shown only once.

**Steps**:

1. Login to get JWT token (see Story 2)

2. Create API key via GraphQL:
   ```bash
   curl -X POST http://localhost:3030/graphql \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{
       "query": "mutation { createApiKey(input: { name: \"Claude Desktop\" }) { key apiKey { id name keyPrefix createdAt } } }"
     }'
   ```

3. Verify response:
   ```json
   {
     "data": {
       "createApiKey": {
         "key": "vr_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
         "apiKey": {
           "id": "clxxxxxxxxxx",
           "name": "Claude Desktop",
           "keyPrefix": "vr_a1b2c3d4",
           "createdAt": "2024-12-06T..."
         }
       }
     }
   }
   ```

4. **Important**: Copy the `key` value - it won't be shown again!

5. Verify in database only hash is stored:
   ```bash
   docker exec -it valuerank-postgres psql -U valuerank -d valuerank -c \
     "SELECT id, name, key_prefix, key_hash FROM api_keys;"
   ```

   Expected: `key_hash` is 64-character hex string (SHA-256), no plaintext key

**Expected**:
- Key starts with `vr_` prefix
- Full key is 36 characters (4 prefix + 32 random)
- Database stores only SHA-256 hash
- Key prefix shown for identification

---

## Testing User Story 5: Authenticate via API Key

**Goal**: Verify API key authentication works for GraphQL access.

**Steps**:

1. Use API key created in Story 4:
   ```bash
   curl -X POST http://localhost:3030/graphql \
     -H "Content-Type: application/json" \
     -H "X-API-Key: vr_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" \
     -d '{"query": "{ definitions { id name } }"}'
   ```

2. Verify success response

3. Check `last_used_at` updated:
   ```bash
   docker exec -it valuerank-postgres psql -U valuerank -d valuerank -c \
     "SELECT name, last_used FROM api_keys;"
   ```

**Expected**:
- Request succeeds with valid API key
- `last_used_at` updated in database
- Same access as JWT authentication

**Error Cases to Test**:

```bash
# Invalid key
curl -X POST http://localhost:3030/graphql \
  -H "Content-Type: application/json" \
  -H "X-API-Key: vr_invalidkeyhere12345678901234567" \
  -d '{"query": "{ definitions { id name } }"}'
# Expected: 401 {"error": "UNAUTHORIZED", "message": "Invalid API key"}
```

---

## Testing User Story 6: Revoke API Key

**Goal**: Verify API keys can be revoked and no longer work.

**Steps**:

1. List current API keys:
   ```bash
   curl -X POST http://localhost:3030/graphql \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"query": "{ apiKeys { id name keyPrefix } }"}'
   ```

2. Revoke a key:
   ```bash
   curl -X POST http://localhost:3030/graphql \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{
       "query": "mutation { revokeApiKey(id: \"KEY_ID_HERE\") }"
     }'
   ```

3. Verify key no longer works:
   ```bash
   curl -X POST http://localhost:3030/graphql \
     -H "Content-Type: application/json" \
     -H "X-API-Key: vr_the_revoked_key_here" \
     -d '{"query": "{ definitions { id name } }"}'
   ```

   Expected: 401 Unauthorized

**Expected**:
- Key deleted from database
- Authentication with revoked key fails
- Other keys continue to work

---

## Testing User Story 7: Get Current User Info

**Goal**: Verify `me` query returns authenticated user info.

**Steps**:

1. Query with JWT:
   ```bash
   curl -X POST http://localhost:3030/graphql \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"query": "{ me { id email name createdAt lastLoginAt } }"}'
   ```

2. Query with API key:
   ```bash
   curl -X POST http://localhost:3030/graphql \
     -H "Content-Type: application/json" \
     -H "X-API-Key: YOUR_API_KEY" \
     -d '{"query": "{ me { id email } }"}'
   ```

**Expected**:
- Returns user info for authenticated user
- Works with both JWT and API key
- Email matches the authenticated account

---

## Testing User Story 8: Rate Limiting on Login

**Goal**: Verify brute force protection on login endpoint.

**Steps**:

1. Make 10 rapid login attempts (can be wrong password):
   ```bash
   for i in {1..10}; do
     curl -s -X POST http://localhost:3030/api/auth/login \
       -H "Content-Type: application/json" \
       -d '{"email": "test@example.com", "password": "wrongpass"}' &
   done
   wait
   ```

2. Try 11th attempt:
   ```bash
   curl -X POST http://localhost:3030/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com", "password": "wrongpass"}'
   ```

**Expected**:
- First 10 attempts return 401 (wrong password)
- 11th attempt returns 429 Too Many Requests
- After 15 minutes, can try again

---

## Troubleshooting

**Issue**: Login returns 500 Internal Error
**Fix**: Check JWT_SECRET is set in environment variables

**Issue**: "User not found" but user exists in database
**Fix**: Verify email case (should be case-insensitive lookup)

**Issue**: API key authentication fails immediately after creation
**Fix**: Ensure you're using the full key from createApiKey response, not the prefix

**Issue**: Rate limiting triggers too quickly
**Fix**: Check if running multiple server instances (each has own counter)

**Issue**: JWT expires immediately
**Fix**: Check server clock synchronization; JWT uses server time for `iat`

---

## Verification Checklist

After completing all tests:

- [ ] User can be created via CLI
- [ ] Login returns JWT token
- [ ] GraphQL requires authentication
- [ ] Valid JWT grants access
- [ ] Expired token rejected with appropriate message
- [ ] API keys can be created
- [ ] API key auth works for GraphQL
- [ ] API keys can be revoked
- [ ] Revoked keys no longer authenticate
- [ ] `me` query returns user info
- [ ] Rate limiting works on login
- [ ] Introspection works without auth
- [ ] Health endpoints work without auth
