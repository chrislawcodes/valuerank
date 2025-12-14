/**
 * OAuth 2.1 Metadata Endpoints
 *
 * Implements:
 * - RFC 8414: Authorization Server Metadata
 * - RFC 9728: Protected Resource Metadata
 */

import type { Request, Response } from 'express';
import { createLogger } from '@valuerank/shared';
import type { AuthorizationServerMetadata, ProtectedResourceMetadata } from './types.js';
import { SUPPORTED_SCOPES } from './constants.js';

const log = createLogger('mcp:oauth:metadata');

/**
 * Get the base URL from request, handling proxies
 */
export function getBaseUrl(req: Request): string {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}`;
}

/**
 * GET /.well-known/oauth-authorization-server
 *
 * Returns OAuth 2.0 Authorization Server Metadata (RFC 8414)
 */
export function authorizationServerMetadata(req: Request, res: Response): void {
  const baseUrl = getBaseUrl(req);

  log.debug({ baseUrl }, 'Authorization server metadata requested');

  const metadata: AuthorizationServerMetadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    scopes_supported: [...SUPPORTED_SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    code_challenge_methods_supported: ['S256'],
    service_documentation: `${baseUrl}/docs/oauth`,
  };

  res.json(metadata);
}

/**
 * GET /.well-known/resource.json (at MCP server path)
 *
 * Returns Protected Resource Metadata (RFC 9728)
 * This tells clients which authorization server to use
 */
export function protectedResourceMetadata(req: Request, res: Response): void {
  const baseUrl = getBaseUrl(req);
  const resourceUri = `${baseUrl}/mcp`;

  log.debug({ baseUrl, resourceUri }, 'Protected resource metadata requested');

  const metadata: ProtectedResourceMetadata = {
    resource: resourceUri,
    authorization_servers: [baseUrl],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ['header'],
    resource_documentation: `${baseUrl}/docs/mcp`,
  };

  res.json(metadata);
}

/**
 * Build WWW-Authenticate header for 401 responses
 */
export function buildWwwAuthenticateHeader(req: Request, error?: string, errorDescription?: string): string {
  const baseUrl = getBaseUrl(req);
  const resourceUri = `${baseUrl}/mcp`;

  let header = `Bearer resource="${resourceUri}"`;

  if (error) {
    header += `, error="${error}"`;
  }

  if (errorDescription) {
    header += `, error_description="${errorDescription}"`;
  }

  return header;
}
