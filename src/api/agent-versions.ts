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

import { createDb } from '../db/client';
import { eq, and, desc, max, sql } from 'drizzle-orm';
import { agents, agentVersions } from '../db/schema';

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
    const db = createDb(env.DB);

    // Verify agent exists and belongs to workspace
    const agent = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1)
      .then(r => r[0] ?? null);

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get all versions
    const versions = await db
      .select()
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId))
      .orderBy(desc(agentVersions.version));

    const formattedVersions: AgentVersion[] = versions.map((v) => ({
      id: v.id,
      agent_id: v.agentId,
      version: v.version,
      prompt_template: v.promptTemplate,
      variables: Array.isArray(v.variables) ? v.variables : [],
      source: v.source,
      parent_version_id: v.parentVersionId,
      accuracy: v.accuracy,
      status: v.status,
      created_at: v.createdAt,
    }));

    return createSuccessResponse({ versions: formattedVersions });
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
    const db = createDb(env.DB);

    // Verify agent exists and belongs to workspace
    const agent = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1)
      .then(r => r[0] ?? null);

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Parse version number
    const version = parseInt(versionNumber, 10);
    if (isNaN(version)) {
      return createErrorResponse('VALIDATION_ERROR', 'Invalid version number', 400);
    }

    // Get specific version
    const versionResult = await db
      .select()
      .from(agentVersions)
      .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.version, version)))
      .limit(1)
      .then(r => r[0] ?? null);

    if (!versionResult) {
      return createErrorResponse('NOT_FOUND', 'Version not found', 404);
    }

    const versionData: AgentVersion = {
      id: versionResult.id,
      agent_id: versionResult.agentId,
      version: versionResult.version,
      prompt_template: versionResult.promptTemplate,
      variables: Array.isArray(versionResult.variables) ? versionResult.variables : [],
      source: versionResult.source,
      parent_version_id: versionResult.parentVersionId,
      accuracy: versionResult.accuracy,
      status: versionResult.status,
      created_at: versionResult.createdAt,
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
    const db = createDb(env.DB);

    const body = await parseJsonBody<CreateAgentVersionRequest>(request);

    if (!body.prompt_template || body.prompt_template.trim().length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'prompt_template is required',
        400
      );
    }

    // Verify agent exists and belongs to workspace
    const agent = await db
      .select({ id: agents.id, activeVersionId: agents.activeVersionId })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1)
      .then(r => r[0] ?? null);

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get the next version number
    const maxVersionResult = await db
      .select({ maxVersion: max(agentVersions.version) })
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId))
      .then(r => r[0] ?? null);

    const nextVersion = (maxVersionResult?.maxVersion ?? 0) + 1;

    // Create new version
    const versionId = `ver_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const variables = body.variables || [];

    await db.insert(agentVersions).values({
      id: versionId,
      agentId: agentId,
      version: nextVersion,
      promptTemplate: body.prompt_template.trim(),
      variables: variables as any,
      source: 'manual',
      parentVersionId: agent.activeVersionId,
      status: 'candidate',
      createdAt: now,
    });

    const newVersion: AgentVersion = {
      id: versionId,
      agent_id: agentId,
      version: nextVersion,
      prompt_template: body.prompt_template.trim(),
      variables,
      source: 'manual',
      parent_version_id: agent.activeVersionId,
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
    const db = createDb(env.DB);

    // Verify agent exists and belongs to workspace
    const agent = await db
      .select({ id: agents.id, activeVersionId: agents.activeVersionId })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1)
      .then(r => r[0] ?? null);

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Parse version number
    const version = parseInt(versionNumber, 10);
    if (isNaN(version)) {
      return createErrorResponse('VALIDATION_ERROR', 'Invalid version number', 400);
    }

    // Get version to promote
    const versionResult = await db
      .select({ id: agentVersions.id, status: agentVersions.status })
      .from(agentVersions)
      .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.version, version)))
      .limit(1)
      .then(r => r[0] ?? null);

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
    if (agent.activeVersionId) {
      await db
        .update(agentVersions)
        .set({ status: 'archived' })
        .where(eq(agentVersions.id, agent.activeVersionId));
    }

    // 2. Promote new version
    await db
      .update(agentVersions)
      .set({ status: 'active' })
      .where(eq(agentVersions.id, versionResult.id));

    // 3. Update agent's active_version_id
    await db
      .update(agents)
      .set({
        activeVersionId: versionResult.id,
        updatedAt: new Date().toISOString()
      })
      .where(eq(agents.id, agentId));

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
    const db = createDb(env.DB);

    // Verify agent exists and belongs to workspace
    const agent = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1)
      .then(r => r[0] ?? null);

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Parse version number
    const version = parseInt(versionNumber, 10);
    if (isNaN(version)) {
      return createErrorResponse('VALIDATION_ERROR', 'Invalid version number', 400);
    }

    // Get version to reject
    const versionResult = await db
      .select({ id: agentVersions.id, status: agentVersions.status })
      .from(agentVersions)
      .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.version, version)))
      .limit(1)
      .then(r => r[0] ?? null);

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
    await db
      .update(agentVersions)
      .set({ status: 'rejected' })
      .where(eq(agentVersions.id, versionResult.id));

    // Return the rejected version
    return getAgentVersion(request, env, agentId, versionNumber);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
