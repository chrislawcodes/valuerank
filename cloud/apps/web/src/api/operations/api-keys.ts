import { gql } from 'urql';

// List all API keys for current user
export const API_KEYS_QUERY = gql`
  query ApiKeys {
    apiKeys {
      id
      name
      keyPrefix
      lastUsedAt
      expiresAt
      createdAt
    }
  }
`;

// Create a new API key
export const CREATE_API_KEY_MUTATION = gql`
  mutation CreateApiKey($input: CreateApiKeyInput!) {
    createApiKey(input: $input) {
      apiKey {
        id
        name
        keyPrefix
        lastUsedAt
        expiresAt
        createdAt
      }
      key
    }
  }
`;

// Revoke (delete) an API key
export const REVOKE_API_KEY_MUTATION = gql`
  mutation RevokeApiKey($id: ID!) {
    revokeApiKey(id: $id)
  }
`;

// Types
export type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type ApiKeysQueryResult = {
  apiKeys: ApiKey[];
};

export type CreateApiKeyInput = {
  name: string;
};

export type CreateApiKeyResult = {
  createApiKey: {
    apiKey: ApiKey;
    key: string; // Full key value - only returned at creation
  };
};

export type RevokeApiKeyResult = {
  revokeApiKey: boolean;
};
