/**
 * Tools API Endpoints
 *
 * Manages CRUD operations for tools and agent-tool associations.
 * Part of Stream 2 of Tool Registry & ART-E Integration.
 *
 * See: docs/plans/2025-12-10-tool-registry-art-e-design.md
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
 * Tool from database
 */
export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters_schema: string; // JSON Schema as string
  handler_key: string;
  category?: string;
  created_at: string;
}

/**
 * Agent-Tool association
 */
export interface AgentTool {
  agent_id: string;
  tool_id: string;
  config?: string; // Tool-specific config JSON
}

/**
 * Request body for attaching tool to agent
 */
export interface AttachToolRequest {
  tool_id: string;
  config?: Record<string, unknown>;
}

/**
 * GET /api/tools
 *
 * List all available tools in the registry.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment with D1 database
 * @returns 200 OK with list of tools
 */
export async function listTools(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Parse optional category filter
    const url = new URL(request.url);
    const category = url.searchParams.get('category');

    let query = `SELECT id, name, description, parameters_schema, handler_key, category, created_at
                 FROM tools`;
    const params: string[] = [];

    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }

    query += ' ORDER BY category, name';

    const result = await (params.length > 0
      ? env.DB.prepare(query).bind(...params)
      : env.DB.prepare(query)
    ).all();

    const tools: Tool[] = result.results.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      parameters_schema: row.parameters_schema,
      handler_key: row.handler_key,
      category: row.category,
      created_at: row.created_at,
    }));

    return createSuccessResponse({ tools });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/tools/:id
 *
 * Get details of a specific tool.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param toolId - Tool ID from URL
 * @returns 200 OK with tool details
 */
export async function getToolById(request: Request, env: Env, toolId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const tool = await env.DB.prepare(
      `SELECT id, name, description, parameters_schema, handler_key, category, created_at
       FROM tools
       WHERE id = ?`
    )
      .bind(toolId)
      .first();

    if (!tool) {
      return createErrorResponse('NOT_FOUND', 'Tool not found', 404);
    }

    return createSuccessResponse({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      parameters_schema: tool.parameters_schema,
      handler_key: tool.handler_key,
      category: tool.category,
      created_at: tool.created_at,
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents/:agentId/tools
 *
 * Get all tools attached to an agent.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with list of tools for the agent
 */
export async function getAgentTools(request: Request, env: Env, agentId: string): Promise<Response> {
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

    // Get tools for this agent
    const result = await env.DB.prepare(
      `SELECT t.id, t.name, t.description, t.parameters_schema, t.handler_key, t.category, t.created_at, at.config
       FROM tools t
       JOIN agent_tools at ON t.id = at.tool_id
       WHERE at.agent_id = ?
       ORDER BY t.category, t.name`
    )
      .bind(agentId)
      .all();

    const tools = result.results.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      parameters_schema: row.parameters_schema,
      handler_key: row.handler_key,
      category: row.category,
      created_at: row.created_at,
      config: row.config ? JSON.parse(row.config) : null,
    }));

    return createSuccessResponse({ tools });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/agents/:agentId/tools
 *
 * Attach a tool to an agent.
 *
 * @param request - HTTP request with tool_id and optional config
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 201 Created with the attached tool details
 */
export async function attachToolToAgent(request: Request, env: Env, agentId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<AttachToolRequest>(request);

    if (!body.tool_id || typeof body.tool_id !== 'string') {
      return createErrorResponse('VALIDATION_ERROR', 'tool_id is required', 400);
    }

    // Verify agent exists and belongs to workspace
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Verify tool exists
    const tool = await env.DB.prepare(
      'SELECT id FROM tools WHERE id = ?'
    )
      .bind(body.tool_id)
      .first();

    if (!tool) {
      return createErrorResponse('NOT_FOUND', 'Tool not found', 404);
    }

    // Check if already attached
    const existing = await env.DB.prepare(
      'SELECT agent_id FROM agent_tools WHERE agent_id = ? AND tool_id = ?'
    )
      .bind(agentId, body.tool_id)
      .first();

    if (existing) {
      return createErrorResponse('ALREADY_EXISTS', 'Tool already attached to agent', 409);
    }

    // Attach tool to agent
    const configJson = body.config ? JSON.stringify(body.config) : null;

    await env.DB.prepare(
      `INSERT INTO agent_tools (agent_id, tool_id, config)
       VALUES (?, ?, ?)`
    )
      .bind(agentId, body.tool_id, configJson)
      .run();

    // Return the attached tool with config
    const attachedTool = await env.DB.prepare(
      `SELECT t.id, t.name, t.description, t.parameters_schema, t.handler_key, t.category, t.created_at
       FROM tools t
       WHERE t.id = ?`
    )
      .bind(body.tool_id)
      .first();

    return createSuccessResponse(
      {
        id: attachedTool!.id,
        name: attachedTool!.name,
        description: attachedTool!.description,
        parameters_schema: attachedTool!.parameters_schema,
        handler_key: attachedTool!.handler_key,
        category: attachedTool!.category,
        created_at: attachedTool!.created_at,
        config: body.config || null,
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
 * DELETE /api/agents/:agentId/tools/:toolId
 *
 * Detach a tool from an agent.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @param toolId - Tool ID from URL
 * @returns 204 No Content on success
 */
export async function detachToolFromAgent(
  request: Request,
  env: Env,
  agentId: string,
  toolId: string
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

    // Verify tool is attached to agent
    const existing = await env.DB.prepare(
      'SELECT agent_id FROM agent_tools WHERE agent_id = ? AND tool_id = ?'
    )
      .bind(agentId, toolId)
      .first();

    if (!existing) {
      return createErrorResponse('NOT_FOUND', 'Tool not attached to agent', 404);
    }

    // Detach tool
    await env.DB.prepare(
      'DELETE FROM agent_tools WHERE agent_id = ? AND tool_id = ?'
    )
      .bind(agentId, toolId)
      .run();

    return new Response(null, { status: 204 });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
