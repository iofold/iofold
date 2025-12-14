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

import { QueueProducer, type Queue } from '../queue/producer';
import { createDb, type Database } from '../db/client';
import { eq, and, desc, sql, count, ne } from 'drizzle-orm';
import {
  agents,
  agentVersions,
  functions,
  agentFunctions,
  traces,
  evals,
  feedback,
  tasksets,
  evalCandidates,
} from '../db/schema';

export interface Env {
  DB: D1Database;
  JOB_QUEUE?: Queue;
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

    const drizzle = createDb(env.DB);

    // Check for duplicate name in workspace
    const existing = await drizzle
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, workspaceId),
          eq(agents.name, body.name.trim()),
          ne(agents.status, 'archived')
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return createErrorResponse(
        'ALREADY_EXISTS',
        'Agent with same name already exists',
        409
      );
    }

    // Create agent
    const agentId = `agent_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await drizzle.insert(agents).values({
      id: agentId,
      workspaceId: workspaceId,
      name: body.name.trim(),
      description: body.description || null,
      status: 'confirmed',
      createdAt: now,
      updatedAt: now,
    });

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
    // Pass error object for full stack trace logging
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500, undefined, error);
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

    const drizzle = createDb(env.DB);

    // Note: Complex query with subqueries for counts - keeping as raw SQL for now
    // since Drizzle subqueries would be too verbose. This could be optimized with separate queries.
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
        av.created_at as version_created_at,
        (SELECT COUNT(*) FROM traces t JOIN agent_versions av2 ON t.agent_version_id = av2.id WHERE av2.agent_id = a.id) as trace_count,
        (SELECT COUNT(*) FROM evals e WHERE e.agent_id = a.id) as eval_count,
        (SELECT COUNT(*) FROM feedback f WHERE f.agent_id = a.id) as feedback_count,
        (SELECT COALESCE(SUM(ts.task_count), 0) FROM tasksets ts WHERE ts.agent_id = a.id AND ts.status = 'active') as task_count
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
    const pendingResult = await drizzle
      .select({ count: count() })
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, workspaceId),
          eq(agents.status, 'discovered')
        )
      );

    const agentsList: AgentWithVersion[] = agentsResult.results.map((row: any) => ({
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
      counts: {
        traces: row.trace_count || 0,
        evals: row.eval_count || 0,
        feedback: row.feedback_count || 0,
        tasks: row.task_count || 0,
      },
    }));

    const response: ListAgentsResponse = {
      agents: agentsList,
      pending_discoveries: pendingResult[0]?.count || 0,
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

    const drizzle = createDb(env.DB);

    // Get agent with active version
    const agentResult = await drizzle
      .select({
        id: agents.id,
        workspaceId: agents.workspaceId,
        name: agents.name,
        description: agents.description,
        status: agents.status,
        activeVersionId: agents.activeVersionId,
        createdAt: agents.createdAt,
        updatedAt: agents.updatedAt,
        versionId: agentVersions.id,
        versionNumber: agentVersions.version,
        promptTemplate: agentVersions.promptTemplate,
        variables: agentVersions.variables,
        source: agentVersions.source,
        parentVersionId: agentVersions.parentVersionId,
        accuracy: agentVersions.accuracy,
        versionStatus: agentVersions.status,
        versionCreatedAt: agentVersions.createdAt,
      })
      .from(agents)
      .leftJoin(agentVersions, eq(agents.activeVersionId, agentVersions.id))
      .where(
        and(
          eq(agents.id, agentId),
          eq(agents.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    const agent = agentResult[0];

    // Get all versions
    const versionsResult = await drizzle
      .select({
        id: agentVersions.id,
        agentId: agentVersions.agentId,
        version: agentVersions.version,
        promptTemplate: agentVersions.promptTemplate,
        variables: agentVersions.variables,
        source: agentVersions.source,
        parentVersionId: agentVersions.parentVersionId,
        accuracy: agentVersions.accuracy,
        status: agentVersions.status,
        createdAt: agentVersions.createdAt,
      })
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId))
      .orderBy(desc(agentVersions.version));

    // Get functions for this agent
    const functionsResult = await drizzle
      .select({
        id: functions.id,
        workspaceId: functions.workspaceId,
        type: functions.type,
        name: functions.name,
        code: functions.code,
        inputSchema: functions.inputSchema,
        outputSchema: functions.outputSchema,
        modelUsed: functions.modelUsed,
        parentFunctionId: functions.parentFunctionId,
        status: functions.status,
        createdAt: functions.createdAt,
        role: agentFunctions.role,
      })
      .from(functions)
      .innerJoin(agentFunctions, eq(functions.id, agentFunctions.functionId))
      .where(
        and(
          eq(agentFunctions.agentId, agentId),
          eq(functions.status, 'active')
        )
      );

    // Get metrics - use direct agent_id where available, join via agent_versions for traces
    // Note: Complex query with multiple subqueries - keeping as raw SQL for simplicity
    const metricsResult = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM traces t
         JOIN agent_versions av ON t.agent_version_id = av.id
         WHERE av.agent_id = ?) as trace_count,
        (SELECT COUNT(*) FROM feedback WHERE agent_id = ?) as feedback_count,
        (SELECT COUNT(*) FROM feedback WHERE agent_id = ? AND rating = 'positive') as positive_feedback_count,
        (SELECT COUNT(*) FROM feedback WHERE agent_id = ? AND rating = 'negative') as negative_feedback_count,
        (SELECT COUNT(*) FROM evals WHERE agent_id = ?) as eval_count`
    )
      .bind(agentId, agentId, agentId, agentId, agentId)
      .first();

    // Calculate accuracy from active eval candidate if available
    // Note: The eval_executions table schema changed for GEPA - using eval_candidates metrics now
    let evalStatsResult: { accuracy: number | null; contradiction_rate: number | null } | null = null;
    try {
      const activeEvalResult = await drizzle
        .select({ accuracy: evalCandidates.accuracy })
        .from(evalCandidates)
        .where(
          and(
            eq(evalCandidates.agentId, agentId),
            eq(evalCandidates.status, 'active')
          )
        )
        .limit(1);

      if (activeEvalResult.length > 0 && activeEvalResult[0].accuracy !== null) {
        evalStatsResult = {
          accuracy: activeEvalResult[0].accuracy,
          contradiction_rate: 1 - activeEvalResult[0].accuracy
        };
      }
    } catch {
      // Table may not exist yet, that's fine
      evalStatsResult = null;
    }

    const extractor = functionsResult.find((f: any) => f.role === 'extractor');
    const injector = functionsResult.find((f: any) => f.role === 'injector');

    const response: AgentWithDetails = {
      id: agent.id,
      workspace_id: agent.workspaceId,
      name: agent.name,
      description: agent.description,
      status: agent.status as any,
      active_version_id: agent.activeVersionId,
      created_at: agent.createdAt,
      updated_at: agent.updatedAt,
      active_version: agent.versionId ? {
        id: agent.versionId,
        agent_id: agent.id,
        version: agent.versionNumber!,
        prompt_template: agent.promptTemplate!,
        variables: agent.variables as any[] || [],
        source: agent.source as any,
        parent_version_id: agent.parentVersionId,
        accuracy: agent.accuracy,
        status: agent.versionStatus as any,
        created_at: agent.versionCreatedAt!,
      } : null,
      versions: versionsResult.map((v: any) => ({
        id: v.id,
        agent_id: v.agentId,
        version: v.version,
        prompt_template: v.promptTemplate,
        variables: v.variables || [],
        source: v.source,
        parent_version_id: v.parentVersionId,
        accuracy: v.accuracy,
        status: v.status,
        created_at: v.createdAt,
      })),
      functions: {
        extractor: extractor ? {
          id: extractor.id,
          workspace_id: extractor.workspaceId,
          type: extractor.type as any,
          name: extractor.name,
          code: extractor.code,
          input_schema: extractor.inputSchema || null,
          output_schema: extractor.outputSchema || null,
          model_used: extractor.modelUsed,
          parent_function_id: extractor.parentFunctionId,
          status: extractor.status as any,
          created_at: extractor.createdAt,
        } : null,
        injector: injector ? {
          id: injector.id,
          workspace_id: injector.workspaceId,
          type: injector.type as any,
          name: injector.name,
          code: injector.code,
          input_schema: injector.inputSchema || null,
          output_schema: injector.outputSchema || null,
          model_used: injector.modelUsed,
          parent_function_id: injector.parentFunctionId,
          status: injector.status as any,
          created_at: injector.createdAt,
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

    const drizzle = createDb(env.DB);

    // Verify agent exists and is in discovered state
    const agent = await drizzle
      .select({
        id: agents.id,
        name: agents.name,
        status: agents.status,
      })
      .from(agents)
      .where(
        and(
          eq(agents.id, agentId),
          eq(agents.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (agent.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    if (agent[0].status !== 'discovered') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Only discovered agents can be confirmed',
        400
      );
    }

    // Build update values
    const updateValues: any = {
      status: 'confirmed',
      updatedAt: new Date().toISOString(),
    };

    if (body.name && body.name.trim().length > 0) {
      // Check for duplicate name
      const duplicate = await drizzle
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.workspaceId, workspaceId),
            eq(agents.name, body.name.trim()),
            ne(agents.id, agentId),
            ne(agents.status, 'archived')
          )
        )
        .limit(1);

      if (duplicate.length > 0) {
        return createErrorResponse('ALREADY_EXISTS', 'Agent with same name already exists', 409);
      }

      updateValues.name = body.name.trim();
    }

    await drizzle
      .update(agents)
      .set(updateValues)
      .where(eq(agents.id, agentId));

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

    const drizzle = createDb(env.DB);

    // Verify agent exists
    const agent = await drizzle
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.id, agentId),
          eq(agents.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (agent.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Soft delete by setting status to archived
    await drizzle
      .update(agents)
      .set({
        status: 'archived',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agents.id, agentId));

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

    const drizzle = createDb(env.DB);

    // Get agent with active version
    const result = await drizzle
      .select({
        versionId: agentVersions.id,
        version: agentVersions.version,
        promptTemplate: agentVersions.promptTemplate,
        variables: agentVersions.variables,
        updatedAt: agentVersions.createdAt,
      })
      .from(agents)
      .innerJoin(agentVersions, eq(agents.activeVersionId, agentVersions.id))
      .where(
        and(
          eq(agents.id, agentId),
          eq(agents.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (result.length === 0) {
      return createErrorResponse(
        'NOT_FOUND',
        'Agent not found or has no active version',
        404
      );
    }

    const row = result[0];

    // Generate ETag based on version ID and updated_at
    const etag = `"${row.versionId}-${row.updatedAt}"`;
    const ifNoneMatch = request.headers.get('If-None-Match');

    // Check if client has current version
    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: { 'ETag': etag },
      });
    }

    const response: AgentPromptResponse = {
      template: row.promptTemplate,
      version: row.version,
      version_id: row.versionId,
      variables: row.variables || [],
      updated_at: row.updatedAt,
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

    const drizzle = createDb(env.DB);

    // Verify agent exists and belongs to workspace
    const agent = await drizzle
      .select({
        id: agents.id,
        name: agents.name,
        status: agents.status,
      })
      .from(agents)
      .where(
        and(
          eq(agents.id, agentId),
          eq(agents.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (agent.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Build update values
    const updateValues: any = {
      updatedAt: new Date().toISOString(),
    };

    // Handle name update
    if (body.name !== undefined) {
      // Check for duplicate name (excluding current agent)
      const existing = await drizzle
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.workspaceId, workspaceId),
            eq(agents.name, body.name.trim()),
            ne(agents.id, agentId),
            ne(agents.status, 'archived')
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return createErrorResponse(
          'ALREADY_EXISTS',
          'Agent with same name already exists',
          409
        );
      }

      updateValues.name = body.name.trim();
    }

    // Handle description update
    if (body.description !== undefined) {
      updateValues.description = body.description || null;
    }

    // Update agent
    await drizzle
      .update(agents)
      .set(updateValues)
      .where(eq(agents.id, agentId));

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
 * POST /api/agents/discover
 *
 * Manually trigger agent discovery job to cluster unassigned traces.
 * Processes traces with assignment_status = 'unassigned' and creates agents from clusters.
 *
 * @param request - HTTP request with optional configuration
 * @param env - Cloudflare environment
 * @returns 202 Accepted with job details
 */
export async function discoverAgents(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Parse optional configuration
    let config: {
      similarity_threshold?: number;
      min_cluster_size?: number;
      max_traces?: number;
    } = {};

    try {
      config = await parseJsonBody(request);
    } catch {
      // Empty body is fine, use defaults
    }

    // Validate configuration if provided
    if (config.similarity_threshold !== undefined) {
      if (config.similarity_threshold < 0 || config.similarity_threshold > 1) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'similarity_threshold must be between 0 and 1',
          400
        );
      }
    }

    if (config.min_cluster_size !== undefined) {
      if (config.min_cluster_size < 1 || config.min_cluster_size > 100) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'min_cluster_size must be between 1 and 100',
          400
        );
      }
    }

    if (config.max_traces !== undefined) {
      if (config.max_traces < 1 || config.max_traces > 1000) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'max_traces must be between 1 and 1000',
          400
        );
      }
    }

    const drizzle = createDb(env.DB);

    // Check if there are unassigned traces
    const unassignedCount = await drizzle
      .select({ count: count() })
      .from(traces)
      .where(
        and(
          eq(traces.workspaceId, workspaceId),
          eq(traces.assignmentStatus, 'unassigned')
        )
      );

    const traceCount = unassignedCount[0]?.count || 0;

    if (traceCount === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'No unassigned traces found. Import traces first.',
        400
      );
    }

    // Enqueue agent discovery job
    if (!env.JOB_QUEUE) {
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Job queue not configured',
        500
      );
    }

    const producer = new QueueProducer({
      queue: env.JOB_QUEUE,
      db: env.DB
    });

    const result = await producer.enqueueAgentDiscoveryJob(workspaceId ?? 'workspace_default', {
      similarityThreshold: config.similarity_threshold,
      minClusterSize: config.min_cluster_size,
      maxTraces: config.max_traces
    });

    if (!result.success) {
      return createErrorResponse(
        'INTERNAL_ERROR',
        result.error || 'Failed to enqueue agent discovery job',
        500
      );
    }

    return createSuccessResponse(
      {
        job_id: result.job_id,
        status: 'queued',
        unassigned_traces: traceCount,
        config: {
          similarity_threshold: config.similarity_threshold || 0.85,
          min_cluster_size: config.min_cluster_size || 5,
          max_traces: config.max_traces || 100
        }
      },
      202
    );
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
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

    const drizzle = createDb(env.DB);

    // Verify agent exists and belongs to workspace
    const agent = await drizzle
      .select({
        id: agents.id,
        activeVersionId: agents.activeVersionId,
        promptTemplate: agentVersions.promptTemplate,
        activeVersion: agentVersions.version,
      })
      .from(agents)
      .leftJoin(agentVersions, eq(agents.activeVersionId, agentVersions.id))
      .where(
        and(
          eq(agents.id, agentId),
          eq(agents.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (agent.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    if (!agent[0].promptTemplate) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Agent has no active version with prompt template',
        400
      );
    }

    // Get next version number
    const versionResult = await drizzle
      .select({ nextVersion: sql<number>`COALESCE(MAX(${agentVersions.version}), 0) + 1` })
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agentId));
    const nextVersion = versionResult[0]?.nextVersion || 1;

    // For now, create a placeholder improved version
    // In production, this would call an LLM to improve the prompt
    const versionId = `av_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Create improved prompt (placeholder - in production would use LLM)
    const improvedPrompt = customInstructions
      ? `${agent[0].promptTemplate}\n\n[Improvement guidance: ${customInstructions}]`
      : agent[0].promptTemplate;

    await drizzle.insert(agentVersions).values({
      id: versionId,
      agentId: agentId,
      version: nextVersion,
      promptTemplate: improvedPrompt,
      source: 'ai_improved',
      parentVersionId: agent[0].activeVersionId,
      status: 'candidate',
      createdAt: now,
    });

    // Return the new version
    const newVersion = await drizzle
      .select()
      .from(agentVersions)
      .where(eq(agentVersions.id, versionId))
      .limit(1);

    return createSuccessResponse({
      id: newVersion[0].id,
      agent_id: newVersion[0].agentId,
      version: newVersion[0].version,
      prompt_template: newVersion[0].promptTemplate,
      source: newVersion[0].source,
      status: newVersion[0].status,
      created_at: newVersion[0].createdAt,
      message: 'New candidate version created. Review and promote to activate.'
    }, 201);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
