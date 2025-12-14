/**
 * OAuth Request Validation
 *
 * Validates OAuth requests according to RFC specs
 */

import type {
  AuthorizationRequest,
  TokenRequest,
  ClientRegistrationRequest,
  OAuthError,
} from './types.js';
import {
  ALLOWED_REDIRECT_SCHEMES,
  LOCALHOST_HOSTS,
  CLAUDE_CALLBACK_URLS,
  SUPPORTED_SCOPES,
  DEFAULT_SCOPE,
} from './constants.js';
import { isValidCodeChallenge } from './pkce.js';

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  error?: OAuthError;
  errorDescription?: string;
}

/**
 * Validate a redirect URI
 *
 * - Must be HTTPS, or
 * - HTTP only for localhost
 * - Claude.ai callbacks are always allowed
 */
export function isValidRedirectUri(uri: string): boolean {
  // Allow Claude.ai callbacks
  if (CLAUDE_CALLBACK_URLS.includes(uri as typeof CLAUDE_CALLBACK_URLS[number])) {
    return true;
  }

  try {
    const parsed = new URL(uri);

    // Check scheme
    if (!ALLOWED_REDIRECT_SCHEMES.includes(parsed.protocol.replace(':', '') as typeof ALLOWED_REDIRECT_SCHEMES[number])) {
      return false;
    }

    // HTTP only allowed for localhost
    if (parsed.protocol === 'http:') {
      const hostname = parsed.hostname.toLowerCase();
      if (!LOCALHOST_HOSTS.includes(hostname as typeof LOCALHOST_HOSTS[number])) {
        return false;
      }
    }

    // No fragments allowed
    if (parsed.hash) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a resource URI (RFC 8707)
 */
export function isValidResourceUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);

    // Must have scheme
    if (!parsed.protocol) {
      return false;
    }

    // No fragments
    if (parsed.hash) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate scope string
 */
export function validateScope(scope: string | undefined): string {
  if (!scope) {
    return DEFAULT_SCOPE;
  }

  const requestedScopes = scope.split(' ').filter(Boolean);
  const validScopes = requestedScopes.filter((s) =>
    SUPPORTED_SCOPES.includes(s as typeof SUPPORTED_SCOPES[number])
  );

  return validScopes.length > 0 ? validScopes.join(' ') : DEFAULT_SCOPE;
}

/**
 * Validate authorization request parameters
 */
export function validateAuthorizationRequest(
  params: Record<string, unknown>
): ValidationResult<AuthorizationRequest> {
  // Required: response_type
  if (params.response_type !== 'code') {
    return {
      valid: false,
      error: 'invalid_request',
      errorDescription: 'response_type must be "code"',
    };
  }

  // Required: client_id
  if (!params.client_id || typeof params.client_id !== 'string') {
    return {
      valid: false,
      error: 'invalid_request',
      errorDescription: 'client_id is required',
    };
  }

  // Required: redirect_uri
  if (!params.redirect_uri || typeof params.redirect_uri !== 'string') {
    return {
      valid: false,
      error: 'invalid_request',
      errorDescription: 'redirect_uri is required',
    };
  }

  if (!isValidRedirectUri(params.redirect_uri)) {
    return {
      valid: false,
      error: 'invalid_request',
      errorDescription: 'redirect_uri must be HTTPS or localhost',
    };
  }

  // Required: code_challenge (PKCE)
  if (!params.code_challenge || typeof params.code_challenge !== 'string') {
    return {
      valid: false,
      error: 'invalid_request',
      errorDescription: 'code_challenge is required (PKCE)',
    };
  }

  if (!isValidCodeChallenge(params.code_challenge)) {
    return {
      valid: false,
      error: 'invalid_request',
      errorDescription: 'code_challenge must be valid BASE64URL (43 chars for S256)',
    };
  }

  // Required: code_challenge_method
  if (params.code_challenge_method !== 'S256') {
    return {
      valid: false,
      error: 'invalid_request',
      errorDescription: 'code_challenge_method must be "S256"',
    };
  }

  // Required: resource (RFC 8707)
  if (!params.resource || typeof params.resource !== 'string') {
    return {
      valid: false,
      error: 'invalid_request',
      errorDescription: 'resource parameter is required (RFC 8707)',
    };
  }

  if (!isValidResourceUri(params.resource)) {
    return {
      valid: false,
      error: 'invalid_request',
      errorDescription: 'resource must be a valid URI without fragments',
    };
  }

  return {
    valid: true,
    data: {
      response_type: 'code',
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      scope: typeof params.scope === 'string' ? params.scope : undefined,
      state: typeof params.state === 'string' ? params.state : undefined,
      code_challenge: params.code_challenge,
      code_challenge_method: 'S256',
      resource: params.resource,
    },
  };
}

/**
 * Validate token request parameters
 */
export function validateTokenRequest(
  params: Record<string, unknown>
): ValidationResult<TokenRequest> {
  // Required: grant_type
  const grantType = params.grant_type;
  if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
    return {
      valid: false,
      error: 'unsupported_grant_type',
      errorDescription: 'grant_type must be "authorization_code" or "refresh_token"',
    };
  }

  // Required: client_id
  if (!params.client_id || typeof params.client_id !== 'string') {
    return {
      valid: false,
      error: 'invalid_request',
      errorDescription: 'client_id is required',
    };
  }

  if (grantType === 'authorization_code') {
    // Required: code
    if (!params.code || typeof params.code !== 'string') {
      return {
        valid: false,
        error: 'invalid_request',
        errorDescription: 'code is required for authorization_code grant',
      };
    }

    // Required: redirect_uri
    if (!params.redirect_uri || typeof params.redirect_uri !== 'string') {
      return {
        valid: false,
        error: 'invalid_request',
        errorDescription: 'redirect_uri is required for authorization_code grant',
      };
    }

    // Required: code_verifier (PKCE)
    if (!params.code_verifier || typeof params.code_verifier !== 'string') {
      return {
        valid: false,
        error: 'invalid_request',
        errorDescription: 'code_verifier is required (PKCE)',
      };
    }
  }

  if (grantType === 'refresh_token') {
    // Required: refresh_token
    if (!params.refresh_token || typeof params.refresh_token !== 'string') {
      return {
        valid: false,
        error: 'invalid_request',
        errorDescription: 'refresh_token is required for refresh_token grant',
      };
    }
  }

  return {
    valid: true,
    data: {
      grant_type: grantType,
      client_id: params.client_id,
      client_secret: typeof params.client_secret === 'string' ? params.client_secret : undefined,
      code: typeof params.code === 'string' ? params.code : undefined,
      redirect_uri: typeof params.redirect_uri === 'string' ? params.redirect_uri : undefined,
      code_verifier: typeof params.code_verifier === 'string' ? params.code_verifier : undefined,
      refresh_token: typeof params.refresh_token === 'string' ? params.refresh_token : undefined,
      resource: typeof params.resource === 'string' ? params.resource : undefined,
    },
  };
}

/**
 * Validate client registration request
 */
export function validateClientRegistrationRequest(
  body: Record<string, unknown>
): ValidationResult<ClientRegistrationRequest> {
  // Required: redirect_uris
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    return {
      valid: false,
      error: 'invalid_request',
      errorDescription: 'redirect_uris array is required',
    };
  }

  // Validate each redirect URI
  for (const uri of body.redirect_uris) {
    if (typeof uri !== 'string' || !isValidRedirectUri(uri)) {
      return {
        valid: false,
        error: 'invalid_request',
        errorDescription: `Invalid redirect_uri: ${uri}`,
      };
    }
  }

  return {
    valid: true,
    data: {
      redirect_uris: body.redirect_uris as string[],
      client_name: typeof body.client_name === 'string' ? body.client_name : undefined,
      token_endpoint_auth_method:
        body.token_endpoint_auth_method === 'none' ||
        body.token_endpoint_auth_method === 'client_secret_post' ||
        body.token_endpoint_auth_method === 'client_secret_basic'
          ? body.token_endpoint_auth_method
          : undefined,
      grant_types: Array.isArray(body.grant_types) ? (body.grant_types as string[]).filter(
        (g) => g === 'authorization_code' || g === 'refresh_token'
      ) : undefined,
      response_types: Array.isArray(body.response_types) ? (body.response_types as string[]).filter(
        (r) => r === 'code'
      ) : undefined,
      scope: typeof body.scope === 'string' ? body.scope : undefined,
    },
  };
}
