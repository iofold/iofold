/**
 * Agents API Endpoints
 *
 * Handles CRUD operations for agents, including manual creation,
 * confirming discovered agents, and retrieving agent details with metrics.
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
  CreateAgentRequest,
  ConfirmAgentRequest,
  AgentWithVersion,
  AgentWithDetails,
  ListAgentsResponse,
  AgentPromptResponse,
} from '../types/agent';

export interface Env {
  DB: D1Database;
}

/**
 * POST /api/agents
 *
 * Create a new agent manually with 'confirmed' status.
 *
 * @param request - HTTP request with name and optional description
 * @param env - Cloudflare environment with D1 database
 * @returns 201 Created with agent details
 */
export async function createAgent(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<CreateAgentRequest>(request);

    if (!body.name || body.name.trim().length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'name is required',
        400
      );
    }

    // Check for duplicate name in workspace
    const existing = await env.DB.prepare(
      'SELECT id FROM agents WHERE workspace_id = ? AND name = ? AND status != ?'
    )
      .bind(workspaceId, body.name.trim(), 'archived')
      .first();

    if (existing) {
      return createErrorResponse(
        'ALREADY_EXISTS',
        'Agent with same name already exists',
        409
      );
    }

    // Create agent
    const agentId = `agent_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO agents (id, workspace_id, name, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        agentId,
        workspaceId,
        body.name.trim(),
        body.description || null,
        'confirmed',
        now,
        now
      )
      .run();

    return createSuccessResponse(
      {
        id: agentId,
        workspace_id: workspaceId,
        name: body.name.trim(),
        description: body.description || null,
        status: 'confirmed',
        active_version_id: null,
        created_at: now,
        updated_at: now,
        active_version: null,
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
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents
 *
 * List all agents with their active versions and pending discoveries count.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment with D1 database
 * @returns 200 OK with list of agents and pending count
 */
export async function listAgents(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Parse query parameters
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    // Build query with optional LIMIT
    let query = `SELECT
        a.id,
        a.workspace_id,
        a.name,
        a.description,
        a.status,
        a.active_version_id,
        a.created_at,
        a.updated_at,
        av.id as version_id,
        av.version as version_number,
        av.prompt_template,
        av.variables,
        av.source,
        av.parent_version_id,
        av.accuracy,
        av.status as version_status,
        av.created_at as version_created_at
      FROM agents a
      LEFT JOIN agent_versions av ON a.active_version_id = av.id
      WHERE a.workspace_id = ? AND a.status != ?
      ORDER BY a.created_at DESC`;

    if (limit && limit > 0) {
      query += ` LIMIT ${limit}`;
    }

    // Get agents with active versions
    const agentsResult = await env.DB.prepare(query)
      .bind(workspaceId, 'archived')
      .all();

    // Count pending discoveries
    const pendingResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM agents WHERE workspace_id = ? AND status = ?'
    )
      .bind(workspaceId, 'discovered')
      .first();

    const agents: AgentWithVersion[] = agentsResult.results.map((row: any) => ({
      id: row.id,
      workspace_id: row.workspace_id,
      name: row.name,
      description: row.description,
      status: row.status,
      active_version_id: row.active_version_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      active_version: row.version_id ? {
        id: row.version_id,
        agent_id: row.id,
        version: row.version_number,
        prompt_template: row.prompt_template,
        variables: row.variables ? JSON.parse(row.variables) : [],
        source: row.source,
        parent_version_id: row.parent_version_id,
        accuracy: row.accuracy,
        status: row.version_status,
        created_at: row.version_created_at,
      } : null,
    }));

    const response: ListAgentsResponse = {
      agents,
      pending_discoveries: (pendingResult?.count as number) || 0,
    };

    return createSuccessResponse(response);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents/:id
 *
 * Get detailed information about an agent including versions, functions, and metrics.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with agent details
 */
export async function getAgentById(request: Request, env: Env, agentId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Get agent with active version
    const agentResult = await env.DB.prepare(
      `SELECT
        a.id,
        a.workspace_id,
        a.name,
        a.description,
        a.status,
        a.active_version_id,
        a.created_at,
        a.updated_at,
        av.id as version_id,
        av.version as version_number,
        av.prompt_template,
        av.variables,
        av.source,
        av.parent_version_id,
        av.accuracy,
        av.status as version_status,
        av.created_at as version_created_at
      FROM agents a
      LEFT JOIN agent_versions av ON a.active_version_id = av.id
      WHERE a.id = ? AND a.workspace_id = ?`
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agentResult) {
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

    // Get functions for this agent
    const functionsResult = await env.DB.prepare(
      `SELECT f.*, af.role
       FROM functions f
       JOIN agent_functions af ON f.id = af.function_id
       WHERE af.agent_id = ? AND f.status = ?`
    )
      .bind(agentId, 'active')
      .all();

    // Get metrics - use feedback.agent_id for direct relationship
    const metricsResult = await env.DB.prepare(
      `SELECT
        COUNT(DISTINCT f.trace_id) as trace_count,
        COUNT(DISTINCT f.id) as feedback_count,
        COUNT(DISTINCT CASE WHEN f.rating = 'positive' THEN f.id END) as positive_feedback_count,
        COUNT(DISTINCT CASE WHEN f.rating = 'negative' THEN f.id END) as negative_feedback_count,
        COUNT(DISTINCT e.id) as eval_count
      FROM agents a
      LEFT JOIN feedback f ON f.agent_id = a.id
      LEFT JOIN evals e ON e.agent_id = a.id
      WHERE a.id = ?`
    )
      .bind(agentId)
      .first();

    // Calculate accuracy and contradiction rate from eval executions if available
    // Use feedback.agent_id directly to filter by agent
    const evalStatsResult = await env.DB.prepare(
      `SELECT
        AVG(CASE WHEN ee.predicted_result = (f.rating = 'positive') THEN 1.0 ELSE 0.0 END) as accuracy,
        AVG(CASE WHEN ee.predicted_result != (f.rating = 'positive') THEN 1.0 ELSE 0.0 END) as contradiction_rate
      FROM eval_executions ee
      JOIN feedback f ON ee.trace_id = f.trace_id AND f.agent_id = ?
      WHERE f.rating IN ('positive', 'negative')`
    )
      .bind(agentId)
      .first();

    const extractor = functionsResult.results.find((f: any) => f.role === 'extractor');
    const injector = functionsResult.results.find((f: any) => f.role === 'injector');

    const response: AgentWithDetails = {
      id: agentResult.id as string,
      workspace_id: agentResult.workspace_id as string,
      name: agentResult.name as string,
      description: agentResult.description as string | null,
      status: agentResult.status as any,
      active_version_id: agentResult.active_version_id as string | null,
      created_at: agentResult.created_at as string,
      updated_at: agentResult.updated_at as string,
      active_version: agentResult.version_id ? {
        id: agentResult.version_id as string,
        agent_id: agentResult.id as string,
        version: agentResult.version_number as number,
        prompt_template: agentResult.prompt_template as string,
        variables: agentResult.variables ? JSON.parse(agentResult.variables as string) : [],
        source: agentResult.source as any,
        parent_version_id: agentResult.parent_version_id as string | null,
        accuracy: agentResult.accuracy as number | null,
        status: agentResult.version_status as any,
        created_at: agentResult.version_created_at as string,
      } : null,
      versions: versionsResult.results.map((v: any) => ({
        id: v.id,
        agent_id: v.agent_id,
        version: v.version,
        prompt_template: v.prompt_template,
        variables: v.variables ? JSON.parse(v.variables) : [],
        source: v.source,
        parent_version_id: v.parent_version_id,
        accuracy: v.accuracy,
        status: v.status,
        created_at: v.created_at,
      })),
      functions: {
        extractor: extractor ? {
          id: extractor.id as string,
          workspace_id: extractor.workspace_id as string,
          type: extractor.type as any,
          name: extractor.name as string,
          code: extractor.code as string,
          input_schema: extractor.input_schema ? JSON.parse(extractor.input_schema as string) : null,
          output_schema: extractor.output_schema ? JSON.parse(extractor.output_schema as string) : null,
          model_used: extractor.model_used as string | null,
          parent_function_id: extractor.parent_function_id as string | null,
          status: extractor.status as any,
          created_at: extractor.created_at as string,
        } : null,
        injector: injector ? {
          id: injector.id as string,
          workspace_id: injector.workspace_id as string,
          type: injector.type as any,
          name: injector.name as string,
          code: injector.code as string,
          input_schema: injector.input_schema ? JSON.parse(injector.input_schema as string) : null,
          output_schema: injector.output_schema ? JSON.parse(injector.output_schema as string) : null,
          model_used: injector.model_used as string | null,
          parent_function_id: injector.parent_function_id as string | null,
          status: injector.status as any,
          created_at: injector.created_at as string,
        } : null,
      },
      metrics: {
        trace_count: (metricsResult?.trace_count as number) || 0,
        feedback_count: (metricsResult?.feedback_count as number) || 0,
        positive_feedback_count: (metricsResult?.positive_feedback_count as number) || 0,
        negative_feedback_count: (metricsResult?.negative_feedback_count as number) || 0,
        eval_count: (metricsResult?.eval_count as number) || 0,
        accuracy: (evalStatsResult?.accuracy as number) || null,
        contradiction_rate: (evalStatsResult?.contradiction_rate as number) || null,
      },
    };

    return createSuccessResponse(response);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/agents/:id/confirm
 *
 * Confirm a discovered agent, optionally renaming it.
 *
 * @param request - HTTP request with optional name
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with updated agent
 */
export async function confirmAgent(request: Request, env: Env, agentId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<ConfirmAgentRequest>(request);

    // Verify agent exists and is in discovered state
    const agent = await env.DB.prepare(
      'SELECT id, name, status FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    if (agent.status !== 'discovered') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Only discovered agents can be confirmed',
        400
      );
    }

    // Update agent status and optionally name
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const params: any[] = ['confirmed', new Date().toISOString()];

    if (body.name && body.name.trim().length > 0) {
      // Check for duplicate name
      const duplicate = await env.DB.prepare(
        'SELECT id FROM agents WHERE workspace_id = ? AND name = ? AND id != ? AND status != ?'
      )
        .bind(workspaceId, body.name.trim(), agentId, 'archived')
        .first();

      if (duplicate) {
        return createErrorResponse('ALREADY_EXISTS', 'Agent with same name already exists', 409);
      }

      updates.push('name = ?');
      params.push(body.name.trim());
    }

    params.push(agentId);
    await env.DB.prepare(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...params)
      .run();

    // Return updated agent
    return getAgentById(request, env, agentId);
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
 * DELETE /api/agents/:id
 *
 * Archive an agent (soft delete).
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 204 No Content
 */
export async function deleteAgent(request: Request, env: Env, agentId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Soft delete by setting status to archived
    await env.DB.prepare(
      'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?'
    )
      .bind('archived', new Date().toISOString(), agentId)
      .run();

    return new Response(null, { status: 204 });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents/:id/prompt
 *
 * Get current active prompt for an agent (supports ETag for polling).
 *
 * @param request - HTTP request with optional If-None-Match header
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with prompt details or 304 Not Modified
 */
export async function getAgentPrompt(request: Request, env: Env, agentId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Get agent with active version
    const result = await env.DB.prepare(
      `SELECT
        av.id as version_id,
        av.version,
        av.prompt_template,
        av.variables,
        av.created_at as updated_at
      FROM agents a
      JOIN agent_versions av ON a.active_version_id = av.id
      WHERE a.id = ? AND a.workspace_id = ?`
    )
      .bind(agentId, workspaceId)
      .first();

    if (!result) {
      return createErrorResponse(
        'NOT_FOUND',
        'Agent not found or has no active version',
        404
      );
    }

    // Generate ETag based on version ID and updated_at
    const etag = `"${result.version_id}-${result.updated_at}"`;
    const ifNoneMatch = request.headers.get('If-None-Match');

    // Check if client has current version
    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: { 'ETag': etag },
      });
    }

    const response: AgentPromptResponse = {
      template: result.prompt_template as string,
      version: result.version as number,
      version_id: result.version_id as string,
      variables: result.variables ? JSON.parse(result.variables as string) : [],
      updated_at: result.updated_at as string,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'ETag': etag,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * PATCH /api/agents/:id
 *
 * Update agent name and/or description.
 *
 * @param request - HTTP request with name and/or description
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with updated agent
 */
export async function updateAgent(request: Request, env: Env, agentId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<{ name?: string; description?: string }>(request);

    // Validate that at least one field is provided
    if (body.name === undefined && body.description === undefined) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'At least one field (name or description) must be provided',
        400
      );
    }

    // Handle name validation early
    if (body.name !== undefined && body.name.trim().length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'name cannot be empty',
        400
      );
    }

    // Verify agent exists and belongs to workspace
    const agent = await env.DB.prepare(
      'SELECT id, name, status FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Build dynamic UPDATE query
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [new Date().toISOString()];

    // Handle name update
    if (body.name !== undefined) {
      // Check for duplicate name (excluding current agent)
      const existing = await env.DB.prepare(
        'SELECT id FROM agents WHERE workspace_id = ? AND name = ? AND id != ? AND status != ?'
      )
        .bind(workspaceId, body.name.trim(), agentId, 'archived')
        .first();

      if (existing) {
        return createErrorResponse(
          'ALREADY_EXISTS',
          'Agent with same name already exists',
          409
        );
      }

      updates.push('name = ?');
      params.push(body.name.trim());
    }

    // Handle description update
    if (body.description !== undefined) {
      updates.push('description = ?');
      params.push(body.description || null);
    }

    // Update agent
    params.push(agentId);
    await env.DB.prepare(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = ?`
    )
      .bind(...params)
      .run();

    // Return updated agent
    return getAgentById(request, env, agentId);
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
 * POST /api/agents/:id/improve
 *
 * Trigger AI-powered prompt improvement for an agent.
 * Creates a new candidate version with improved prompt.
 *
 * @param request - HTTP request with optional custom_instructions
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 201 Created with new candidate version
 */
export async function improveAgent(request: Request, env: Env, agentId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Parse optional request body
    let customInstructions: string | undefined;
    try {
      const body = await request.json() as { custom_instructions?: string };
      customInstructions = body.custom_instructions;
    } catch {
      // Empty body is fine
    }

    // Verify agent exists and belongs to workspace
    const agent = await env.DB.prepare(
      `SELECT a.*, av.prompt_template, av.version as active_version
       FROM agents a
       LEFT JOIN agent_versions av ON a.active_version_id = av.id
       WHERE a.id = ? AND a.workspace_id = ?`
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    if (!agent.prompt_template) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Agent has no active version with prompt template',
        400
      );
    }

    // Get next version number
    const versionResult = await env.DB.prepare(
      'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM agent_versions WHERE agent_id = ?'
    )
      .bind(agentId)
      .first();
    const nextVersion = (versionResult?.next_version as number) || 1;

    // For now, create a placeholder improved version
    // In production, this would call an LLM to improve the prompt
    const versionId = `av_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Create improved prompt (placeholder - in production would use LLM)
    const improvedPrompt = customInstructions
      ? `${agent.prompt_template}\n\n[Improvement guidance: ${customInstructions}]`
      : agent.prompt_template;

    await env.DB.prepare(
      `INSERT INTO agent_versions (id, agent_id, version, prompt_template, source, parent_version_id, status, created_at)
       VALUES (?, ?, ?, ?, 'ai_improved', ?, 'candidate', ?)`
    )
      .bind(
        versionId,
        agentId,
        nextVersion,
        improvedPrompt,
        agent.active_version_id,
        now
      )
      .run();

    // Return the new version
    const newVersion = await env.DB.prepare(
      'SELECT * FROM agent_versions WHERE id = ?'
    )
      .bind(versionId)
      .first();

    return createSuccessResponse({
      id: newVersion!.id,
      agent_id: newVersion!.agent_id,
      version: newVersion!.version,
      prompt_template: newVersion!.prompt_template,
      source: newVersion!.source,
      status: newVersion!.status,
      created_at: newVersion!.created_at,
      message: 'New candidate version created. Review and promote to activate.'
    }, 201);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
