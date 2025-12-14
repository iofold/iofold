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
import { createDb, Database } from '../db/client';
import { eq, and, desc } from 'drizzle-orm';
import { integrations } from '../db/schema/integrations';
import type { Integration, NewIntegration } from '../db/schema/integrations';

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

    // TypeScript null check after validation
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

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

    const config = { base_url: baseUrl };

    const drizzle = createDb(env.DB);
    await drizzle.insert(integrations).values({
      id: integrationId,
      workspaceId: workspaceId,
      platform: body.platform,
      name: name,
      apiKeyEncrypted: encryptApiKey(body.api_key),
      config: config,
      status: 'active',
      createdAt: now,
    });

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

    // TypeScript null check after validation
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const drizzle = createDb(env.DB);
    const result = await drizzle
      .select({
        id: integrations.id,
        platform: integrations.platform,
        name: integrations.name,
        config: integrations.config,
        status: integrations.status,
        lastSyncedAt: integrations.lastSyncedAt,
        createdAt: integrations.createdAt,
      })
      .from(integrations)
      .where(eq(integrations.workspaceId, workspaceId))
      .orderBy(desc(integrations.createdAt));

    const integrationsData = result.map((row) => {
      // Use the stored name, or generate a default if missing
      const defaultName = `${row.platform.charAt(0).toUpperCase() + row.platform.slice(1)} Integration`;

      return {
        id: row.id,
        platform: row.platform,
        name: row.name || defaultName,
        status: row.status,
        error_message: row.status === 'error' ? 'Connection error' : null,
        last_synced_at: row.lastSyncedAt,
      };
    });

    return createSuccessResponse({ integrations: integrationsData });
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

    // TypeScript null check after validation
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const drizzle = createDb(env.DB);
    const result = await drizzle
      .select()
      .from(integrations)
      .where(and(
        eq(integrations.id, integrationId),
        eq(integrations.workspaceId, workspaceId)
      ))
      .limit(1);

    const integration = result[0];

    if (!integration) {
      return createErrorResponse('NOT_FOUND', 'Integration not found', 404);
    }

    // Parse config if present
    let baseUrl = null;
    if (integration.config) {
      try {
        const config = integration.config as Record<string, unknown>;
        baseUrl = config.base_url;
      } catch {}
    }

    return createSuccessResponse({
      id: integration.id,
      platform: integration.platform,
      name: integration.name,
      base_url: baseUrl,
      status: integration.status,
      last_synced_at: integration.lastSyncedAt,
      created_at: integration.createdAt,
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

    // TypeScript null check after validation
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const drizzle = createDb(env.DB);

    // Verify integration exists
    const existingResult = await drizzle
      .select({
        id: integrations.id,
        name: integrations.name,
        config: integrations.config,
      })
      .from(integrations)
      .where(and(
        eq(integrations.id, integrationId),
        eq(integrations.workspaceId, workspaceId)
      ))
      .limit(1);

    const existing = existingResult[0];

    if (!existing) {
      return createErrorResponse('NOT_FOUND', 'Integration not found', 404);
    }

    const body = await parseJsonBody<{
      name?: string;
      base_url?: string;
      api_key?: string;
    }>(request);

    // Build update object dynamically
    const updateData: Partial<NewIntegration> = {};

    if (body.name !== undefined) {
      updateData.name = body.name;
    }

    if (body.base_url !== undefined) {
      // Merge with existing config
      let config: Record<string, unknown> = {};
      if (existing.config) {
        try {
          config = existing.config as Record<string, unknown>;
        } catch {}
      }
      config.base_url = body.base_url;
      updateData.config = config;
    }

    if (body.api_key !== undefined) {
      updateData.apiKeyEncrypted = encryptApiKey(body.api_key);
    }

    if (Object.keys(updateData).length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'No fields to update', 400);
    }

    await drizzle
      .update(integrations)
      .set(updateData)
      .where(eq(integrations.id, integrationId));

    // Fetch and return updated integration
    const updatedResult = await drizzle
      .select()
      .from(integrations)
      .where(eq(integrations.id, integrationId))
      .limit(1);

    const updated = updatedResult[0];

    // Parse config if present
    let baseUrl = null;
    if (updated.config) {
      try {
        const config = updated.config as Record<string, unknown>;
        baseUrl = config.base_url;
      } catch {}
    }

    return createSuccessResponse({
      id: updated.id,
      platform: updated.platform,
      name: updated.name,
      base_url: baseUrl,
      status: updated.status,
      last_synced_at: updated.lastSyncedAt,
      created_at: updated.createdAt,
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

    // TypeScript null check after validation
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const drizzle = createDb(env.DB);

    // Get integration
    const result = await drizzle
      .select({
        id: integrations.id,
        platform: integrations.platform,
        apiKeyEncrypted: integrations.apiKeyEncrypted,
        config: integrations.config,
      })
      .from(integrations)
      .where(and(
        eq(integrations.id, integrationId),
        eq(integrations.workspaceId, workspaceId)
      ))
      .limit(1);

    const integration = result[0];

    if (!integration) {
      return createErrorResponse('NOT_FOUND', 'Integration not found', 404);
    }

    const apiKey = decryptApiKey(integration.apiKeyEncrypted);
    const platform = integration.platform;

    // Parse config for base_url
    let baseUrl = 'https://cloud.langfuse.com';
    if (integration.config) {
      try {
        const config = integration.config as Record<string, unknown>;
        baseUrl = (config.base_url as string) || baseUrl;
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
      await drizzle
        .update(integrations)
        .set({ status: 'active' })
        .where(eq(integrations.id, integrationId));

      return createSuccessResponse({
        success: true,
      });
    } else {
      // Update status to error
      await drizzle
        .update(integrations)
        .set({ status: 'error' })
        .where(eq(integrations.id, integrationId));

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

    // TypeScript null check after validation
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing X-Workspace-Id header', 400);
    }

    const drizzle = createDb(env.DB);

    // Verify integration exists
    const result = await drizzle
      .select({ id: integrations.id })
      .from(integrations)
      .where(and(
        eq(integrations.id, integrationId),
        eq(integrations.workspaceId, workspaceId)
      ))
      .limit(1);

    const integration = result[0];

    if (!integration) {
      return createErrorResponse('NOT_FOUND', 'Integration not found', 404);
    }

    // Delete integration
    await drizzle
      .delete(integrations)
      .where(eq(integrations.id, integrationId));

    return new Response(null, { status: 204 });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
