/**
 * Agent Versions API Endpoints
 *
 * Handles version management for agents including listing, creating,
 * promoting, and rejecting versions.
 */

/// <reference types="@cloudflare/workers-types" />

import {
  createErrorResponse,
  createSuccessResponse,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
} from './utils';

import type {
  AgentVersion,
  CreateAgentVersionRequest,
} from '../types/agent';

export interface Env {
  DB: D1Database;
}

/**
 * GET /api/agents/:id/versions
 *
 * List all versions for an agent.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with list of versions
 */
export async function listAgentVersions(request: Request, env: Env, agentId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify agent exists and belongs to workspace
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get all versions
    const versionsResult = await env.DB.prepare(
      `SELECT id, agent_id, version, prompt_template, variables, source,
              parent_version_id, accuracy, status, created_at
       FROM agent_versions
       WHERE agent_id = ?
       ORDER BY version DESC`
    )
      .bind(agentId)
      .all();

    const versions: AgentVersion[] = versionsResult.results.map((row: any) => ({
      id: row.id,
      agent_id: row.agent_id,
      version: row.version,
      prompt_template: row.prompt_template,
      variables: row.variables ? JSON.parse(row.variables) : [],
      source: row.source,
      parent_version_id: row.parent_version_id,
      accuracy: row.accuracy,
      status: row.status,
      created_at: row.created_at,
    }));

    return createSuccessResponse({ versions });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents/:id/versions/:version
 *
 * Get a specific version by version number.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @param versionNumber - Version number from URL
 * @returns 200 OK with version details
 */
export async function getAgentVersion(
  request: Request,
  env: Env,
  agentId: string,
  versionNumber: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify agent exists and belongs to workspace
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Parse version number
    const version = parseInt(versionNumber, 10);
    if (isNaN(version)) {
      return createErrorResponse('VALIDATION_ERROR', 'Invalid version number', 400);
    }

    // Get specific version
    const versionResult = await env.DB.prepare(
      `SELECT id, agent_id, version, prompt_template, variables, source,
              parent_version_id, accuracy, status, created_at
       FROM agent_versions
       WHERE agent_id = ? AND version = ?`
    )
      .bind(agentId, version)
      .first();

    if (!versionResult) {
      return createErrorResponse('NOT_FOUND', 'Version not found', 404);
    }

    const versionData: AgentVersion = {
      id: versionResult.id as string,
      agent_id: versionResult.agent_id as string,
      version: versionResult.version as number,
      prompt_template: versionResult.prompt_template as string,
      variables: versionResult.variables ? JSON.parse(versionResult.variables as string) : [],
      source: versionResult.source as any,
      parent_version_id: versionResult.parent_version_id as string | null,
      accuracy: versionResult.accuracy as number | null,
      status: versionResult.status as any,
      created_at: versionResult.created_at as string,
    };

    return createSuccessResponse(versionData);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/agents/:id/versions
 *
 * Create a new version manually.
 *
 * @param request - HTTP request with prompt_template and optional variables
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 201 Created with version details
 */
export async function createAgentVersion(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<CreateAgentVersionRequest>(request);

    if (!body.prompt_template || body.prompt_template.trim().length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'prompt_template is required',
        400
      );
    }

    // Verify agent exists and belongs to workspace
    const agent = await env.DB.prepare(
      'SELECT id, active_version_id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get the next version number
    const maxVersionResult = await env.DB.prepare(
      'SELECT MAX(version) as max_version FROM agent_versions WHERE agent_id = ?'
    )
      .bind(agentId)
      .first();

    const nextVersion = (maxVersionResult?.max_version as number || 0) + 1;

    // Create new version
    const versionId = `ver_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const variables = body.variables || [];

    await env.DB.prepare(
      `INSERT INTO agent_versions (id, agent_id, version, prompt_template, variables, source,
                                    parent_version_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        versionId,
        agentId,
        nextVersion,
        body.prompt_template.trim(),
        JSON.stringify(variables),
        'manual',
        agent.active_version_id || null,
        'candidate',
        now
      )
      .run();

    const newVersion: AgentVersion = {
      id: versionId,
      agent_id: agentId,
      version: nextVersion,
      prompt_template: body.prompt_template.trim(),
      variables,
      source: 'manual',
      parent_version_id: (agent.active_version_id as string) || null,
      accuracy: null,
      status: 'candidate',
      created_at: now,
    };

    return createSuccessResponse(newVersion, 201);
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
 * POST /api/agents/:id/versions/:version/promote
 *
 * Promote a version to active status.
 * - Demotes current active version to 'archived'
 * - Sets new version status to 'active'
 * - Updates agent's active_version_id
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @param versionNumber - Version number from URL
 * @returns 200 OK with updated version
 */
export async function promoteAgentVersion(
  request: Request,
  env: Env,
  agentId: string,
  versionNumber: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify agent exists and belongs to workspace
    const agent = await env.DB.prepare(
      'SELECT id, active_version_id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Parse version number
    const version = parseInt(versionNumber, 10);
    if (isNaN(version)) {
      return createErrorResponse('VALIDATION_ERROR', 'Invalid version number', 400);
    }

    // Get version to promote
    const versionResult = await env.DB.prepare(
      'SELECT id, status FROM agent_versions WHERE agent_id = ? AND version = ?'
    )
      .bind(agentId, version)
      .first();

    if (!versionResult) {
      return createErrorResponse('NOT_FOUND', 'Version not found', 404);
    }

    if (versionResult.status === 'rejected') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Cannot promote rejected version',
        400
      );
    }

    if (versionResult.status === 'active') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Version is already active',
        400
      );
    }

    // Begin transaction-like updates
    // 1. Demote current active version if exists
    if (agent.active_version_id) {
      await env.DB.prepare(
        'UPDATE agent_versions SET status = ? WHERE id = ?'
      )
        .bind('archived', agent.active_version_id)
        .run();
    }

    // 2. Promote new version
    await env.DB.prepare(
      'UPDATE agent_versions SET status = ? WHERE id = ?'
    )
      .bind('active', versionResult.id)
      .run();

    // 3. Update agent's active_version_id
    await env.DB.prepare(
      'UPDATE agents SET active_version_id = ?, updated_at = ? WHERE id = ?'
    )
      .bind(versionResult.id, new Date().toISOString(), agentId)
      .run();

    // Return the promoted version
    return getAgentVersion(request, env, agentId, versionNumber);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/agents/:id/versions/:version/reject
 *
 * Reject a candidate version.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @param versionNumber - Version number from URL
 * @returns 200 OK with updated version
 */
export async function rejectAgentVersion(
  request: Request,
  env: Env,
  agentId: string,
  versionNumber: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify agent exists and belongs to workspace
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Parse version number
    const version = parseInt(versionNumber, 10);
    if (isNaN(version)) {
      return createErrorResponse('VALIDATION_ERROR', 'Invalid version number', 400);
    }

    // Get version to reject
    const versionResult = await env.DB.prepare(
      'SELECT id, status FROM agent_versions WHERE agent_id = ? AND version = ?'
    )
      .bind(agentId, version)
      .first();

    if (!versionResult) {
      return createErrorResponse('NOT_FOUND', 'Version not found', 404);
    }

    if (versionResult.status === 'active') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Cannot reject active version',
        400
      );
    }

    // Reject the version
    await env.DB.prepare(
      'UPDATE agent_versions SET status = ? WHERE id = ?'
    )
      .bind('rejected', versionResult.id)
      .run();

    // Return the rejected version
    return getAgentVersion(request, env, agentId, versionNumber);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
