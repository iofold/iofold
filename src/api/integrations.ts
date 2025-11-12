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
    if (!body.platform || !body.api_key) {
      return createErrorResponse(
        'MISSING_REQUIRED_FIELD',
        'platform and api_key are required',
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
    const name = body.name || `${body.platform.charAt(0).toUpperCase() + body.platform.slice(1)} Integration`;

    const config = body.base_url ? JSON.stringify({ base_url: body.base_url }) : null;

    await env.DB.prepare(
      `INSERT INTO integrations (id, workspace_id, platform, api_key_encrypted, config, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        integrationId,
        workspaceId,
        body.platform,
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
        config,
        status,
        last_sync as last_synced_at,
        created_at
      FROM integrations
      WHERE workspace_id = ?
      ORDER BY created_at DESC`
    )
      .bind(workspaceId)
      .all();

    const integrations = result.results.map((row: any) => {
      const config = row.config ? JSON.parse(row.config) : {};
      const name = `${row.platform.charAt(0).toUpperCase() + row.platform.slice(1)} Integration`;

      return {
        id: row.id,
        platform: row.platform,
        name: config.name || name,
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

    // TODO: Make actual test request to the platform API
    // For now, just return success
    const apiKey = decryptApiKey(integration.api_key_encrypted as string);

    // Simulate test (in production, actually call the API)
    const testSuccess = apiKey.length > 0; // Simple check

    if (testSuccess) {
      // Update status to active
      await env.DB.prepare(
        'UPDATE integrations SET status = ? WHERE id = ?'
      )
        .bind('active', integrationId)
        .run();

      return createSuccessResponse({
        status: 'success',
      });
    } else {
      // Update status to error
      await env.DB.prepare(
        'UPDATE integrations SET status = ? WHERE id = ?'
      )
        .bind('error', integrationId)
        .run();

      return createSuccessResponse({
        status: 'error',
        error_message: 'API key expired',
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
