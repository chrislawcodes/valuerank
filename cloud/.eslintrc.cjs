module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./apps/*/tsconfig.json', './packages/*/tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  rules: {
    // No any types (per CLAUDE.md)
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',

    // Strict null checks
    '@typescript-eslint/strict-boolean-expressions': 'warn',

    // No console.log (per CLAUDE.md - use logger)
    'no-console': 'error',

    // Consistent imports
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

    // Unused vars - ignore if prefixed with _
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      destructuredArrayIgnorePattern: '^_',
    }],
  },
  overrides: [
    {
      // React-specific rules for web app
      files: ['apps/web/**/*.{ts,tsx}'],
      env: {
        browser: true,
      },
      extends: [
        'plugin:react/recommended',
        'plugin:react/jsx-runtime',
        'plugin:react-hooks/recommended',
      ],
      settings: {
        react: {
          version: 'detect',
        },
      },
      rules: {
        // React onClick handlers are commonly async
        '@typescript-eslint/no-misused-promises': ['warn', {
          checksVoidReturn: { attributes: false },
        }],
        // Allow console in development (should use proper logging in production)
        'no-console': 'warn',
        // Floating promises in React components (refetch patterns, etc.)
        '@typescript-eslint/no-floating-promises': 'warn',
        // Monaco editor and other external libs use any types
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        '@typescript-eslint/no-unsafe-call': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
        '@typescript-eslint/no-unsafe-return': 'warn',
        // Await on non-thenable can happen with complex Promise patterns
        '@typescript-eslint/await-thenable': 'warn',
        // Redundant type constituents in union types
        '@typescript-eslint/no-redundant-type-constituents': 'warn',
        // Disable strict-boolean-expressions for React code - patterns like
        // `if (userId)` instead of `if (userId != null)` are idiomatic
        '@typescript-eslint/strict-boolean-expressions': 'off',
      },
    },
    {
      // Allow console in CLI tools
      files: ['apps/api/src/cli/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      // Allow console in test files
      files: ['**/tests/**/*.ts', '**/*.test.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    // ============================================================================
    // API Server Overrides
    // Note: Some files appear in multiple overrides - this is intentional.
    // ESLint merges rules from all matching overrides, so a file can get
    // rules from multiple blocks. This is used to layer concerns:
    // - One block handles Express async patterns (misused-promises)
    // - Another handles external API data (unsafe-* rules)
    // ============================================================================
    {
      // Express routes use async callbacks which are technically misused promises
      // This is idiomatic Express code and safe when errors are handled
      files: [
        'apps/api/src/routes/**/*.ts',
        'apps/api/src/auth/routes.ts',
        'apps/api/src/auth/middleware.ts',
        'apps/api/src/mcp/**/*.ts',
        'apps/api/src/server.ts',
      ],
      rules: {
        '@typescript-eslint/no-misused-promises': 'off',
      },
    },
    {
      // OAuth middleware deals with external API responses that have any types
      files: [
        'apps/api/src/auth/**/*.ts',
        'apps/api/src/mcp/auth.ts',
        'apps/api/src/mcp/oauth/**/*.ts',
      ],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
      },
    },
    {
      // Queue handlers and services may use setInterval patterns
      files: [
        'apps/api/src/queue/**/*.ts',
        'apps/api/src/services/**/*.ts',
      ],
      rules: {
        '@typescript-eslint/no-misused-promises': 'warn',
      },
    },
    {
      // Services dealing with JSON data from database may have any types
      files: [
        'apps/api/src/services/**/*.ts',
        'packages/db/src/**/*.ts',
      ],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
        '@typescript-eslint/no-unsafe-return': 'warn',
      },
    },
    {
      // Prisma raw queries and JSON fields may require explicit any
      files: [
        'packages/db/src/queries/**/*.ts',
        'packages/db/src/schema-migration.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      },
    },
    {
      // MCP tools deal with dynamic data from external models and GraphQL
      files: [
        'apps/api/src/mcp/tools/**/*.ts',
        'apps/api/src/mcp/oauth/**/*.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
        '@typescript-eslint/restrict-template-expressions': 'warn',
      },
    },
    {
      // Express middleware and entry points deal with middleware chains and dynamic configuration
      files: [
        'apps/api/src/middleware/**/*.ts',
        'apps/api/src/index.ts',
      ],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
      },
    },
    {
      // Queue spawn deals with process output and dynamic configurations
      files: [
        'apps/api/src/queue/spawn.ts',
      ],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        '@typescript-eslint/restrict-template-expressions': 'warn',
      },
    },
    {
      // GraphQL utils and audited mutations deal with dynamic resolver data
      files: [
        'apps/api/src/graphql/utils/**/*.ts',
      ],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
      },
    },
  ],
  ignorePatterns: ['dist', 'node_modules', '*.js', '*.cjs'],
};
