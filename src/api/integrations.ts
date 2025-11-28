/**
 * Integrations API Endpoints
 *
 * Handles connecting, listing, testing, and deleting external platform integrations.
 */

/// <reference types="@cloudflare/workers-types" />

import {
  createErrorResponse,
  createSuccessResponse,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
} from './utils';

export interface Env {
  DB: D1Database;
}

/**
 * Simple encryption for API keys (NOT production-ready, use Cloudflare Workers KV or Secrets in prod)
 * For MVP, we'll just use base64 encoding. In production, use proper encryption.
 */
function encryptApiKey(apiKey: string): string {
  // TODO: Implement proper encryption using Cloudflare Workers Crypto API
  return Buffer.from(apiKey).toString('base64');
}

function decryptApiKey(encrypted: string): string {
  // TODO: Implement proper decryption
  return Buffer.from(encrypted, 'base64').toString('utf-8');
}

/**
 * POST /api/integrations
 *
 * Connect an external platform (Langfuse, Langsmith, or OpenAI) for trace import.
 *
 * @param request - HTTP request with platform, api_key, base_url, and name
 * @param env - Cloudflare environment with D1 database
 * @returns 201 Created with integration details
 */
export async function createIntegration(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<{
      platform: 'langfuse' | 'langsmith' | 'openai';
      api_key: string;
      base_url?: string;
      name?: string;
    }>(request);

    // Validate required fields
    if (!body.platform || !body.api_key || !body.name) {
      return createErrorResponse(
        'MISSING_REQUIRED_FIELD',
        'platform, api_key, and name are required',
        400
      );
    }

    // Validate name is not empty
    if (body.name.trim().length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'name cannot be empty',
        400
      );
    }

    // Validate platform
    if (!['langfuse', 'langsmith', 'openai'].includes(body.platform)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'platform must be langfuse, langsmith, or openai',
        400
      );
    }

    // TODO: Validate API key by making a test request to the platform
    // For now, we'll just check that it's not empty
    if (body.api_key.trim().length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'api_key cannot be empty',
        400
      );
    }

    // Create integration
    const integrationId = `int_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const name = body.name.trim();
    const baseUrl = body.base_url || 'https://cloud.langfuse.com';

    const config = JSON.stringify({ base_url: baseUrl });

    await env.DB.prepare(
      `INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, config, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        integrationId,
        workspaceId,
        body.platform,
        name,
        encryptApiKey(body.api_key),
        config,
        'active',
        now
      )
      .run();

    return createSuccessResponse(
      {
        id: integrationId,
        platform: body.platform,
        name: name,
        base_url: baseUrl,
        status: 'active',
        last_synced_at: null,
        created_at: now,
      },
      201
    );
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    if (error.message === 'Invalid JSON in request body') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }

    // Check if it's an API validation error (422)
    if (error.message && error.message.includes('API key validation failed')) {
      return createErrorResponse('INTEGRATION_ERROR', error.message, 422);
    }

    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/integrations
 *
 * List all connected platforms for the workspace.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment with D1 database
 * @returns 200 OK with list of integrations
 */
export async function listIntegrations(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const result = await env.DB.prepare(
      `SELECT
        id,
        platform,
        name,
        config,
        status,
        last_synced_at,
        created_at
      FROM integrations
      WHERE workspace_id = ?
      ORDER BY created_at DESC`
    )
      .bind(workspaceId)
      .all();

    const integrations = result.results.map((row: any) => {
      // Use the stored name, or generate a default if missing
      const defaultName = `${row.platform.charAt(0).toUpperCase() + row.platform.slice(1)} Integration`;

      return {
        id: row.id,
        platform: row.platform,
        name: row.name || defaultName,
        status: row.status,
        error_message: row.status === 'error' ? 'Connection error' : null,
        last_synced_at: row.last_synced_at,
      };
    });

    return createSuccessResponse({ integrations });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/integrations/:id
 *
 * Get a specific integration by ID.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param integrationId - Integration ID from URL
 * @returns 200 OK with integration details
 */
export async function getIntegrationById(request: Request, env: Env, integrationId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const integration = await env.DB.prepare(
      `SELECT
        id,
        platform,
        name,
        config,
        status,
        last_synced_at,
        created_at
      FROM integrations
      WHERE id = ? AND workspace_id = ?`
    )
      .bind(integrationId, workspaceId)
      .first();

    if (!integration) {
      return createErrorResponse('NOT_FOUND', 'Integration not found', 404);
    }

    // Parse config if present
    let baseUrl = null;
    if (integration.config) {
      try {
        const config = JSON.parse(integration.config as string);
        baseUrl = config.base_url;
      } catch {}
    }

    return createSuccessResponse({
      id: integration.id,
      platform: integration.platform,
      name: integration.name,
      base_url: baseUrl,
      status: integration.status,
      last_synced_at: integration.last_synced_at,
      created_at: integration.created_at,
      // API key is masked for security
      api_key: '********',
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * PATCH /api/integrations/:id
 *
 * Update an existing integration.
 *
 * @param request - HTTP request with fields to update
 * @param env - Cloudflare environment
 * @param integrationId - Integration ID from URL
 * @returns 200 OK with updated integration
 */
export async function updateIntegration(request: Request, env: Env, integrationId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify integration exists
    const existing = await env.DB.prepare(
      'SELECT id, name, config FROM integrations WHERE id = ? AND workspace_id = ?'
    )
      .bind(integrationId, workspaceId)
      .first();

    if (!existing) {
      return createErrorResponse('NOT_FOUND', 'Integration not found', 404);
    }

    const body = await parseJsonBody<{
      name?: string;
      base_url?: string;
      api_key?: string;
    }>(request);

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      updates.push('name = ?');
      values.push(body.name);
    }

    if (body.base_url !== undefined) {
      // Merge with existing config
      let config: any = {};
      if (existing.config) {
        try {
          config = JSON.parse(existing.config as string);
        } catch {}
      }
      config.base_url = body.base_url;
      updates.push('config = ?');
      values.push(JSON.stringify(config));
    }

    if (body.api_key !== undefined) {
      updates.push('api_key_encrypted = ?');
      values.push(encryptApiKey(body.api_key));
    }

    if (updates.length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'No fields to update', 400);
    }

    values.push(integrationId);
    await env.DB.prepare(
      `UPDATE integrations SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...values)
      .run();

    // Fetch and return updated integration
    const updated = await env.DB.prepare(
      `SELECT
        id,
        platform,
        name,
        config,
        status,
        last_synced_at,
        created_at
      FROM integrations
      WHERE id = ?`
    )
      .bind(integrationId)
      .first();

    // Parse config if present
    let baseUrl = null;
    if (updated!.config) {
      try {
        const config = JSON.parse(updated!.config as string);
        baseUrl = config.base_url;
      } catch {}
    }

    return createSuccessResponse({
      id: updated!.id,
      platform: updated!.platform,
      name: updated!.name,
      base_url: baseUrl,
      status: updated!.status,
      last_synced_at: updated!.last_synced_at,
      created_at: updated!.created_at,
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    if (error.message === 'Invalid JSON in request body') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/integrations/:id/test
 *
 * Test integration credentials to verify they're still valid.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param integrationId - Integration ID from URL
 * @returns 200 OK with status
 */
export async function testIntegration(request: Request, env: Env, integrationId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Get integration
    const integration = await env.DB.prepare(
      'SELECT id, platform, api_key_encrypted, config FROM integrations WHERE id = ? AND workspace_id = ?'
    )
      .bind(integrationId, workspaceId)
      .first();

    if (!integration) {
      return createErrorResponse('NOT_FOUND', 'Integration not found', 404);
    }

    const apiKey = decryptApiKey(integration.api_key_encrypted as string);
    const platform = integration.platform as string;

    // Parse config for base_url
    let baseUrl = 'https://cloud.langfuse.com';
    if (integration.config) {
      try {
        const config = JSON.parse(integration.config as string);
        baseUrl = config.base_url || baseUrl;
      } catch {}
    }

    // Actually test the credentials against the platform API
    let testSuccess = false;
    let errorMessage = 'Unknown error';

    if (platform === 'langfuse') {
      // Parse API key (format: publicKey:secretKey)
      const [publicKey, secretKey] = apiKey.split(':');

      if (!publicKey || !secretKey) {
        errorMessage = 'Invalid API key format. Expected format: publicKey:secretKey';
      } else {
        try {
          // Make a test request to Langfuse API to validate credentials
          // Using the traces endpoint with limit=1 as a lightweight validation
          const authHeader = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
          const response = await fetch(`${baseUrl}/api/public/traces?limit=1`, {
            method: 'GET',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            testSuccess = true;
          } else if (response.status === 401 || response.status === 403) {
            errorMessage = 'Invalid credentials: Authentication failed';
          } else {
            errorMessage = `API error: HTTP ${response.status}`;
          }
        } catch (fetchError: any) {
          errorMessage = `Connection error: ${fetchError.message || 'Failed to reach Langfuse API'}`;
        }
      }
    } else {
      // For other platforms (langsmith, openai), just check key format for now
      testSuccess = apiKey.length > 0;
      if (!testSuccess) {
        errorMessage = 'API key is empty';
      }
    }

    if (testSuccess) {
      // Update status to active
      await env.DB.prepare(
        'UPDATE integrations SET status = ? WHERE id = ?'
      )
        .bind('active', integrationId)
        .run();

      return createSuccessResponse({
        success: true,
      });
    } else {
      // Update status to error
      await env.DB.prepare(
        'UPDATE integrations SET status = ? WHERE id = ?'
      )
        .bind('error', integrationId)
        .run();

      return createSuccessResponse({
        success: false,
        error: errorMessage,
      });
    }
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * DELETE /api/integrations/:id
 *
 * Remove connected platform integration.
 * Note: This does NOT delete imported traces, only the connection.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param integrationId - Integration ID from URL
 * @returns 204 No Content
 */
export async function deleteIntegration(request: Request, env: Env, integrationId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify integration exists
    const integration = await env.DB.prepare(
      'SELECT id FROM integrations WHERE id = ? AND workspace_id = ?'
    )
      .bind(integrationId, workspaceId)
      .first();

    if (!integration) {
      return createErrorResponse('NOT_FOUND', 'Integration not found', 404);
    }

    // Delete integration
    await env.DB.prepare('DELETE FROM integrations WHERE id = ?')
      .bind(integrationId)
      .run();

    return new Response(null, { status: 204 });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
