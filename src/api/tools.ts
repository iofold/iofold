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
import { createDb, Database } from '../db/client';
import { eq, and, asc } from 'drizzle-orm';
import { tools, agentTools, agents } from '../db/schema';

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

    const db = createDb(env.DB);

    // Parse optional category filter
    const url = new URL(request.url);
    const category = url.searchParams.get('category');

    let query = db
      .select({
        id: tools.id,
        name: tools.name,
        description: tools.description,
        parameters_schema: tools.parametersSchema,
        handler_key: tools.handlerKey,
        category: tools.category,
        created_at: tools.createdAt,
      })
      .from(tools);

    if (category) {
      query = query.where(eq(tools.category, category as any));
    }

    const results = await query.orderBy(asc(tools.category), asc(tools.name));

    const toolsList: Tool[] = results.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      parameters_schema: row.parameters_schema,
      handler_key: row.handler_key,
      category: row.category || undefined,
      created_at: row.created_at,
    }));

    return createSuccessResponse({ tools: toolsList });
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

    const db = createDb(env.DB);

    const result = await db
      .select({
        id: tools.id,
        name: tools.name,
        description: tools.description,
        parameters_schema: tools.parametersSchema,
        handler_key: tools.handlerKey,
        category: tools.category,
        created_at: tools.createdAt,
      })
      .from(tools)
      .where(eq(tools.id, toolId))
      .limit(1);

    const tool = result[0];

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

    const db = createDb(env.DB);

    // Verify agent exists and belongs to workspace
    const agentResult = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get tools for this agent
    const results = await db
      .select({
        id: tools.id,
        name: tools.name,
        description: tools.description,
        parameters_schema: tools.parametersSchema,
        handler_key: tools.handlerKey,
        category: tools.category,
        created_at: tools.createdAt,
        config: agentTools.config,
      })
      .from(tools)
      .innerJoin(agentTools, eq(tools.id, agentTools.toolId))
      .where(eq(agentTools.agentId, agentId))
      .orderBy(asc(tools.category), asc(tools.name));

    const toolsList = results.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      parameters_schema: row.parameters_schema,
      handler_key: row.handler_key,
      category: row.category,
      created_at: row.created_at,
      config: row.config || null,
    }));

    return createSuccessResponse({ tools: toolsList });
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

    const db = createDb(env.DB);

    // Verify agent exists and belongs to workspace
    const agentResult = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Verify tool exists
    const toolResult = await db
      .select({ id: tools.id })
      .from(tools)
      .where(eq(tools.id, body.tool_id))
      .limit(1);

    if (toolResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Tool not found', 404);
    }

    // Check if already attached
    const existingResult = await db
      .select({ agentId: agentTools.agentId })
      .from(agentTools)
      .where(and(eq(agentTools.agentId, agentId), eq(agentTools.toolId, body.tool_id)))
      .limit(1);

    if (existingResult.length > 0) {
      return createErrorResponse('ALREADY_EXISTS', 'Tool already attached to agent', 409);
    }

    // Attach tool to agent
    await db.insert(agentTools).values({
      agentId,
      toolId: body.tool_id,
      config: body.config || null,
    });

    // Return the attached tool with config
    const attachedToolResult = await db
      .select({
        id: tools.id,
        name: tools.name,
        description: tools.description,
        parameters_schema: tools.parametersSchema,
        handler_key: tools.handlerKey,
        category: tools.category,
        created_at: tools.createdAt,
      })
      .from(tools)
      .where(eq(tools.id, body.tool_id))
      .limit(1);

    const attachedTool = attachedToolResult[0];

    return createSuccessResponse(
      {
        id: attachedTool.id,
        name: attachedTool.name,
        description: attachedTool.description,
        parameters_schema: attachedTool.parameters_schema,
        handler_key: attachedTool.handler_key,
        category: attachedTool.category,
        created_at: attachedTool.created_at,
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

    const db = createDb(env.DB);

    // Verify agent exists and belongs to workspace
    const agentResult = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Verify tool is attached to agent
    const existingResult = await db
      .select({ agentId: agentTools.agentId })
      .from(agentTools)
      .where(and(eq(agentTools.agentId, agentId), eq(agentTools.toolId, toolId)))
      .limit(1);

    if (existingResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Tool not attached to agent', 404);
    }

    // Detach tool
    await db
      .delete(agentTools)
      .where(and(eq(agentTools.agentId, agentId), eq(agentTools.toolId, toolId)));

    return new Response(null, { status: 204 });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
