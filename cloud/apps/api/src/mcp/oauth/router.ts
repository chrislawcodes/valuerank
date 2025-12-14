/**
 * OAuth 2.1 Router for MCP Authentication
 *
 * Implements:
 * - Dynamic Client Registration (RFC 7591)
 * - Authorization Endpoint
 * - Token Endpoint
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createLogger } from '@valuerank/shared';
import {
  validateAuthorizationRequest,
  validateTokenRequest,
  validateClientRegistrationRequest,
  validateScope,
} from './validation.js';
import {
  createOAuthClient,
  getOAuthClient,
  validateClientCredentials,
  storeAuthCode,
  consumeAuthCode,
  createRefreshToken,
  consumeRefreshToken,
  getUserByApiKey,
} from './storage.js';
import { validatePkce } from './pkce.js';
import { generateAccessToken } from './tokens.js';
import { getBaseUrl } from './metadata.js';
import { DEFAULT_SCOPE, ACCESS_TOKEN_EXPIRY_SECONDS, CLIENT_SECRET_EXPIRY_SECONDS } from './constants.js';
import type { ClientRegistrationResponse, TokenResponse, TokenErrorResponse } from './types.js';

const log = createLogger('mcp:oauth:router');

export function createOAuthRouter(): Router {
  const router = Router();

  /**
   * POST /oauth/register - Dynamic Client Registration (RFC 7591)
   */
  router.post('/register', async (req: Request, res: Response) => {
    log.debug({ body: req.body }, 'Client registration request');

    const validation = validateClientRegistrationRequest(req.body || {});
    if (!validation.valid || !validation.data) {
      res.status(400).json({
        error: validation.error,
        error_description: validation.errorDescription,
      });
      return;
    }

    const data = validation.data;

    try {
      const { client, clientSecret } = await createOAuthClient({
        clientName: data.client_name,
        redirectUris: data.redirect_uris,
        tokenEndpointAuthMethod: data.token_endpoint_auth_method || 'client_secret_post',
        grantTypes: data.grant_types || ['authorization_code', 'refresh_token'],
        responseTypes: data.response_types || ['code'],
        scope: validateScope(data.scope),
      });

      const response: ClientRegistrationResponse = {
        client_id: client.clientId,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_secret_expires_at: CLIENT_SECRET_EXPIRY_SECONDS,
        redirect_uris: client.redirectUris,
        client_name: client.clientName,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        scope: client.scope,
      };

      log.info({ clientId: client.clientId, clientName: client.clientName }, 'Client registered');
      res.status(201).json(response);
    } catch (err) {
      log.error({ err }, 'Client registration failed');
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to register client',
      });
    }
  });

  /**
   * GET /oauth/authorize - Authorization Endpoint
   *
   * This endpoint requires the user to authenticate with their API key.
   * In a browser flow, this would show a login page.
   * For Claude.ai, we check for an API key in the X-API-Key header.
   */
  router.get('/authorize', async (req: Request, res: Response) => {
    log.debug({ query: req.query }, 'Authorization request');

    const validation = validateAuthorizationRequest(req.query);
    if (!validation.valid || !validation.data) {
      // For authorization errors, we redirect with error if redirect_uri is valid
      const redirectUri = req.query.redirect_uri as string;
      const state = req.query.state as string;

      if (redirectUri && typeof redirectUri === 'string') {
        try {
          const errorUrl = new URL(redirectUri);
          errorUrl.searchParams.set('error', validation.error || 'invalid_request');
          if (validation.errorDescription) {
            errorUrl.searchParams.set('error_description', validation.errorDescription);
          }
          if (state) {
            errorUrl.searchParams.set('state', state);
          }
          res.redirect(errorUrl.toString());
          return;
        } catch {
          // Invalid redirect_uri, return error directly
        }
      }

      res.status(400).json({
        error: validation.error,
        error_description: validation.errorDescription,
      });
      return;
    }

    const authReq = validation.data;

    // Validate client exists and redirect_uri matches
    const client = await getOAuthClient(authReq.client_id);
    if (!client) {
      log.debug({ clientId: authReq.client_id }, 'Unknown client');
      res.status(400).json({
        error: 'invalid_client',
        error_description: 'Unknown client_id',
      });
      return;
    }

    if (!client.redirectUris.includes(authReq.redirect_uri)) {
      log.debug({ clientId: authReq.client_id, redirectUri: authReq.redirect_uri }, 'Redirect URI mismatch');
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'redirect_uri does not match registered URIs',
      });
      return;
    }

    // Check for API key authentication
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      // No API key - return an HTML page for user to enter API key
      // For Claude.ai, this shouldn't happen as they send credentials
      const baseUrl = getBaseUrl(req);
      res.status(401).send(`
<!DOCTYPE html>
<html>
<head>
  <title>ValueRank MCP Authorization</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
    h1 { color: #333; }
    form { margin-top: 20px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input[type="text"] { width: 100%; padding: 10px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 4px; }
    button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0056b3; }
    .info { background: #f0f0f0; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h1>Authorize ValueRank MCP</h1>
  <div class="info">
    <p><strong>Client:</strong> ${client.clientName || authReq.client_id}</p>
    <p><strong>Scope:</strong> ${authReq.scope || DEFAULT_SCOPE}</p>
  </div>
  <form method="POST" action="${baseUrl}/oauth/authorize">
    <input type="hidden" name="response_type" value="${authReq.response_type}">
    <input type="hidden" name="client_id" value="${authReq.client_id}">
    <input type="hidden" name="redirect_uri" value="${authReq.redirect_uri}">
    <input type="hidden" name="scope" value="${authReq.scope || ''}">
    <input type="hidden" name="state" value="${authReq.state || ''}">
    <input type="hidden" name="code_challenge" value="${authReq.code_challenge}">
    <input type="hidden" name="code_challenge_method" value="${authReq.code_challenge_method}">
    <input type="hidden" name="resource" value="${authReq.resource}">
    <label for="api_key">API Key:</label>
    <input type="text" id="api_key" name="api_key" placeholder="vr_..." required>
    <button type="submit">Authorize</button>
  </form>
</body>
</html>
      `);
      return;
    }

    // Validate API key
    const user = await getUserByApiKey(apiKey);
    if (!user) {
      log.debug({ clientId: authReq.client_id }, 'Invalid API key');
      res.status(401).json({
        error: 'access_denied',
        error_description: 'Invalid API key',
      });
      return;
    }

    // Generate authorization code
    const scope = validateScope(authReq.scope);
    const code = storeAuthCode({
      clientId: authReq.client_id,
      userId: user.id,
      redirectUri: authReq.redirect_uri,
      scope,
      codeChallenge: authReq.code_challenge,
      codeChallengeMethod: authReq.code_challenge_method,
      resource: authReq.resource,
    });

    // Redirect with code
    const redirectUrl = new URL(authReq.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (authReq.state) {
      redirectUrl.searchParams.set('state', authReq.state);
    }

    log.info({ clientId: authReq.client_id, userId: user.id }, 'Authorization code issued');
    res.redirect(redirectUrl.toString());
  });

  /**
   * POST /oauth/authorize - Authorization Endpoint (form submission)
   */
  router.post('/authorize', async (req: Request, res: Response) => {
    const body = req.body || {};
    log.info({ body: { ...body, api_key: body.api_key ? '[redacted]' : undefined }, contentType: req.headers['content-type'] }, 'Authorization POST request');

    // Reconstruct auth request from form data
    const validation = validateAuthorizationRequest({
      response_type: body.response_type,
      client_id: body.client_id,
      redirect_uri: body.redirect_uri,
      scope: body.scope,
      state: body.state,
      code_challenge: body.code_challenge,
      code_challenge_method: body.code_challenge_method,
      resource: body.resource,
    });

    if (!validation.valid || !validation.data) {
      res.status(400).json({
        error: validation.error,
        error_description: validation.errorDescription,
      });
      return;
    }

    const authReq = validation.data;

    // Validate client
    const client = await getOAuthClient(authReq.client_id);
    if (!client || !client.redirectUris.includes(authReq.redirect_uri)) {
      res.status(400).json({
        error: 'invalid_client',
        error_description: 'Invalid client or redirect_uri',
      });
      return;
    }

    // Validate API key from form
    const apiKey = body.api_key;
    if (!apiKey) {
      res.status(400).json({
        error: 'access_denied',
        error_description: 'API key required',
      });
      return;
    }

    const user = await getUserByApiKey(apiKey);
    if (!user) {
      res.status(401).json({
        error: 'access_denied',
        error_description: 'Invalid API key',
      });
      return;
    }

    // Generate authorization code
    const scope = validateScope(authReq.scope);
    const code = storeAuthCode({
      clientId: authReq.client_id,
      userId: user.id,
      redirectUri: authReq.redirect_uri,
      scope,
      codeChallenge: authReq.code_challenge,
      codeChallengeMethod: authReq.code_challenge_method,
      resource: authReq.resource,
    });

    // Redirect with code
    const redirectUrl = new URL(authReq.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (authReq.state) {
      redirectUrl.searchParams.set('state', authReq.state);
    }

    log.info({ clientId: authReq.client_id, userId: user.id }, 'Authorization code issued via form');
    res.redirect(redirectUrl.toString());
  });

  /**
   * POST /oauth/token - Token Endpoint
   */
  router.post('/token', async (req: Request, res: Response) => {
    // Parse body - support both JSON and form-urlencoded
    const body = req.body || {};
    log.debug({ grantType: body.grant_type, clientId: body.client_id }, 'Token request');

    const validation = validateTokenRequest(body);
    if (!validation.valid || !validation.data) {
      const errorResponse: TokenErrorResponse = {
        error: validation.error || 'invalid_request',
        error_description: validation.errorDescription,
      };
      res.status(400).json(errorResponse);
      return;
    }

    const tokenReq = validation.data;

    // Get client - might need credentials depending on auth method
    let client = await getOAuthClient(tokenReq.client_id);
    if (!client) {
      res.status(401).json({
        error: 'invalid_client',
        error_description: 'Unknown client',
      });
      return;
    }

    // Validate client credentials if required
    if (client.tokenEndpointAuthMethod !== 'none') {
      // Check for client_secret in body or Basic auth header
      let clientSecret = tokenReq.client_secret;

      // Check Basic auth header
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Basic ')) {
        const encoded = authHeader.slice(6);
        const decoded = Buffer.from(encoded, 'base64').toString();
        const [basicClientId, basicSecret] = decoded.split(':');
        if (basicClientId === tokenReq.client_id) {
          clientSecret = basicSecret;
        }
      }

      if (!clientSecret) {
        res.status(401).json({
          error: 'invalid_client',
          error_description: 'Client authentication required',
        });
        return;
      }

      const validatedClient = await validateClientCredentials(tokenReq.client_id, clientSecret);
      if (!validatedClient) {
        res.status(401).json({
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        });
        return;
      }
      client = validatedClient;
    }

    // Handle authorization_code grant
    if (tokenReq.grant_type === 'authorization_code') {
      const authCode = consumeAuthCode(tokenReq.code!);
      if (!authCode) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code',
        });
        return;
      }

      // Validate client matches
      if (authCode.clientId !== tokenReq.client_id) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Authorization code was not issued to this client',
        });
        return;
      }

      // Validate redirect_uri matches
      if (authCode.redirectUri !== tokenReq.redirect_uri) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'redirect_uri does not match',
        });
        return;
      }

      // Validate PKCE
      if (!validatePkce(tokenReq.code_verifier!, authCode.codeChallenge, authCode.codeChallengeMethod)) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid code_verifier (PKCE validation failed)',
        });
        return;
      }

      // Generate tokens
      const accessToken = generateAccessToken(
        req,
        authCode.userId,
        authCode.clientId,
        authCode.scope,
        authCode.resource
      );

      const refreshToken = await createRefreshToken({
        clientId: authCode.clientId,
        userId: authCode.userId,
        scope: authCode.scope,
        resource: authCode.resource,
      });

      const response: TokenResponse = {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
        refresh_token: refreshToken,
        scope: authCode.scope,
      };

      log.info({ clientId: authCode.clientId, userId: authCode.userId }, 'Access token issued');
      res.json(response);
      return;
    }

    // Handle refresh_token grant
    if (tokenReq.grant_type === 'refresh_token') {
      const storedToken = await consumeRefreshToken(tokenReq.refresh_token!, tokenReq.client_id);
      if (!storedToken) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired refresh token',
        });
        return;
      }

      // Generate new tokens (rotation)
      const accessToken = generateAccessToken(
        req,
        storedToken.userId,
        storedToken.clientId,
        storedToken.scope,
        storedToken.resource
      );

      const newRefreshToken = await createRefreshToken({
        clientId: storedToken.clientId,
        userId: storedToken.userId,
        scope: storedToken.scope,
        resource: storedToken.resource,
      });

      const response: TokenResponse = {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
        refresh_token: newRefreshToken,
        scope: storedToken.scope,
      };

      log.info({ clientId: storedToken.clientId, userId: storedToken.userId }, 'Access token refreshed');
      res.json(response);
      return;
    }

    // Unknown grant type (shouldn't reach here due to validation)
    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Unknown grant type',
    });
  });

  return router;
}
