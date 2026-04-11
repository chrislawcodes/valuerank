import type {
  ApiKeysQuery as GeneratedApiKeysQuery,
  CreateApiKeyMutation as GeneratedCreateApiKeyMutation,
  RevokeApiKeyMutation as GeneratedRevokeApiKeyMutation,
} from '../../generated/graphql';

// ============================================================================
// TYPES
// ============================================================================

export type ApiKey = GeneratedApiKeysQuery['apiKeys'][number];

// Manual input type — not in the schema as a standalone type here
export type CreateApiKeyInput = {
  name: string;
};

// ============================================================================
// QUERIES
// ============================================================================

export { ApiKeysDocument as API_KEYS_QUERY } from '../../generated/graphql';

// ============================================================================
// MUTATIONS
// ============================================================================

export { CreateApiKeyDocument as CREATE_API_KEY_MUTATION } from '../../generated/graphql';
export { RevokeApiKeyDocument as REVOKE_API_KEY_MUTATION } from '../../generated/graphql';

// ============================================================================
// RESULT TYPES
// ============================================================================

export type ApiKeysQueryResult = GeneratedApiKeysQuery;
export type CreateApiKeyResult = GeneratedCreateApiKeyMutation;
export type RevokeApiKeyResult = GeneratedRevokeApiKeyMutation;
