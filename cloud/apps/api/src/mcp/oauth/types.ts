/**
 * OAuth 2.1 Types for MCP Authentication
 *
 * Implements types for:
 * - RFC 8414: Authorization Server Metadata
 * - RFC 9728: Protected Resource Metadata
 * - RFC 7591: Dynamic Client Registration
 * - RFC 8707: Resource Indicators
 */

/** OAuth 2.1 Grant Types */
export type GrantType = 'authorization_code' | 'refresh_token';

/** OAuth 2.1 Response Types */
export type ResponseType = 'code';

/** OAuth 2.1 Token Endpoint Auth Methods */
export type TokenEndpointAuthMethod = 'none' | 'client_secret_post' | 'client_secret_basic';

/** Code Challenge Methods (PKCE) */
export type CodeChallengeMethod = 'S256';

/**
 * Authorization Server Metadata (RFC 8414)
 */
export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported: string[];
  response_types_supported: ResponseType[];
  grant_types_supported: GrantType[];
  token_endpoint_auth_methods_supported: TokenEndpointAuthMethod[];
  code_challenge_methods_supported: CodeChallengeMethod[];
  service_documentation?: string;
}

/**
 * Protected Resource Metadata (RFC 9728)
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  resource_documentation?: string;
}

/**
 * Dynamic Client Registration Request (RFC 7591)
 */
export interface ClientRegistrationRequest {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: TokenEndpointAuthMethod;
  grant_types?: GrantType[];
  response_types?: ResponseType[];
  scope?: string;
}

/**
 * Dynamic Client Registration Response (RFC 7591)
 */
export interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_id_issued_at: number;
  client_secret_expires_at?: number;
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method: TokenEndpointAuthMethod;
  grant_types: GrantType[];
  response_types: ResponseType[];
  scope?: string;
}

/**
 * Authorization Request Parameters
 */
export interface AuthorizationRequest {
  response_type: ResponseType;
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: CodeChallengeMethod;
  resource: string;
}

/**
 * Token Request Parameters
 */
export interface TokenRequest {
  grant_type: GrantType;
  code?: string;
  redirect_uri?: string;
  client_id: string;
  client_secret?: string;
  code_verifier?: string;
  refresh_token?: string;
  resource?: string;
}

/**
 * Token Response
 */
export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Token Error Response (RFC 6749)
 */
export interface TokenErrorResponse {
  error: OAuthError;
  error_description?: string;
  error_uri?: string;
}

/** OAuth Error Codes */
export type OAuthError =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'server_error';

/**
 * Stored Authorization Code
 */
export interface StoredAuthCode {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: CodeChallengeMethod;
  resource: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Stored OAuth Client (Dynamic Registration)
 */
export interface StoredOAuthClient {
  clientId: string;
  clientSecret?: string;
  clientSecretHash?: string;
  clientName?: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  grantTypes: GrantType[];
  responseTypes: ResponseType[];
  scope: string;
  createdAt: Date;
  clientSecretExpiresAt?: Date;
}

/**
 * Stored Refresh Token
 */
export interface StoredRefreshToken {
  token: string;
  tokenHash: string;
  clientId: string;
  userId: string;
  scope: string;
  resource: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * JWT Access Token Payload
 */
export interface AccessTokenPayload {
  /** Subject - user ID */
  sub: string;
  /** Audience - MCP server resource URI */
  aud: string;
  /** Issuer - authorization server */
  iss: string;
  /** Expiration time */
  exp: number;
  /** Issued at */
  iat: number;
  /** Scope */
  scope: string;
  /** Client ID */
  client_id: string;
}
