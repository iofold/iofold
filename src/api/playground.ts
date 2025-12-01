/**
 * Playground API Endpoints
 *
 * Handles real-time chat interactions with agents in the playground.
 * Implements SSE streaming compatible with Vercel AI SDK protocol.
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
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  SANDBOX?: any;
}

export type ModelProvider = 'anthropic' | 'openai' | 'google';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface PlaygroundChatRequest {
  messages: Message[];
  sessionId?: string;
  variables?: Record<string, string>;
  modelProvider?: ModelProvider;
  modelId?: string;
}

export interface PlaygroundSession {
  id: string;
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
  messages: Message[];
  variables: Record<string, string>;
  files: Record<string, string>;
  modelProvider: ModelProvider;
  modelId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * POST /api/agents/:agentId/playground/chat
 *
 * Main chat endpoint with SSE streaming.
 * Creates or resumes a playground session and streams LLM responses.
 *
 * @param request - HTTP request with messages and session config
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns SSE stream with AI SDK protocol
 */
export async function playgroundChat(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request)!;
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<PlaygroundChatRequest>(request);

    if (!body.messages || body.messages.length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'messages array is required', 400);
    }

    // Get agent with active version
    const agent = await env.DB.prepare(
      `SELECT a.id, a.name, a.active_version_id, av.prompt_template, av.variables
       FROM agents a
       JOIN agent_versions av ON a.active_version_id = av.id
       WHERE a.id = ? AND a.workspace_id = ?`
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse(
        'NOT_FOUND',
        'Agent not found or has no active version',
        404
      );
    }

    // Get or create session
    let session: PlaygroundSession | null = null;
    if (body.sessionId) {
      const existingSession = await env.DB.prepare(
        'SELECT * FROM playground_sessions WHERE id = ? AND agent_id = ? AND workspace_id = ?'
      )
        .bind(body.sessionId, agentId, workspaceId)
        .first();

      if (existingSession) {
        session = {
          id: existingSession.id as string,
          workspaceId: existingSession.workspace_id as string,
          agentId: existingSession.agent_id as string,
          agentVersionId: existingSession.agent_version_id as string,
          messages: JSON.parse(existingSession.messages as string),
          variables: JSON.parse(existingSession.variables as string),
          files: JSON.parse(existingSession.files as string),
          modelProvider: existingSession.model_provider as ModelProvider,
          modelId: existingSession.model_id as string,
          createdAt: existingSession.created_at as string,
          updatedAt: existingSession.updated_at as string,
        };
      }
    }

    // Create new session if needed
    if (!session) {
      const sessionId = `sess_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const modelProvider = body.modelProvider || 'anthropic';
      const modelId = body.modelId || 'claude-sonnet-4-5-20250929';
      const activeVersionId = agent.active_version_id as string;

      await env.DB.prepare(
        `INSERT INTO playground_sessions (
          id, workspace_id, agent_id, agent_version_id,
          messages, variables, files, model_provider, model_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          sessionId,
          workspaceId,
          agentId,
          activeVersionId,
          JSON.stringify([]),
          JSON.stringify(body.variables || {}),
          JSON.stringify({}),
          modelProvider,
          modelId,
          now,
          now
        )
        .run();

      session = {
        id: sessionId,
        workspaceId,
        agentId,
        agentVersionId: activeVersionId,
        messages: [],
        variables: body.variables || {},
        files: {},
        modelProvider,
        modelId,
        createdAt: now,
        updatedAt: now,
      };
    }

    // At this point, session is guaranteed to be set
    const currentSession = session!;

    // Fill system prompt with variables
    let systemPrompt = agent.prompt_template as string;
    const variables = body.variables || currentSession.variables;
    Object.entries(variables).forEach(([key, value]) => {
      systemPrompt = systemPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });

    // Create SSE stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Start streaming in background
    (async () => {
      try {
        const messageId = crypto.randomUUID();

        // Send start event
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: 'start', messageId })}\n\n`)
        );

        // For MVP, we'll simulate streaming with mock response
        // In production, this would call the actual LLM API
        const mockResponse = `This is a mock response from the ${currentSession.modelProvider} model. In production, this would stream real LLM responses using the agent's system prompt:\n\n${systemPrompt.substring(0, 100)}...`;

        // Stream text deltas
        const words = mockResponse.split(' ');
        for (const word of words) {
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'text-delta',
                id: messageId,
                delta: word + ' ',
              })}\n\n`
            )
          );
          // Small delay to simulate streaming
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        // Create trace for this interaction
        const traceId = `trace_${crypto.randomUUID()}`;
        await env.DB.prepare(
          `INSERT INTO traces (
            id, workspace_id, integration_id, trace_id, source, timestamp,
            steps, input_preview, output_preview, step_count, has_errors, imported_at
          ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            traceId,
            workspaceId,
            `playground_${currentSession.id}`,
            'playground',
            new Date().toISOString(),
            JSON.stringify([
              {
                type: 'llm_call',
                input: body.messages[body.messages.length - 1].content,
                output: mockResponse,
              },
            ]),
            body.messages[body.messages.length - 1].content.substring(0, 200),
            mockResponse.substring(0, 200),
            1,
            0,
            new Date().toISOString()
          )
          .run();

        // Update session with new messages
        const updatedMessages = [
          ...currentSession.messages,
          body.messages[body.messages.length - 1],
          { role: 'assistant' as const, content: mockResponse },
        ];

        await env.DB.prepare(
          'UPDATE playground_sessions SET messages = ?, updated_at = ? WHERE id = ?'
        )
          .bind(JSON.stringify(updatedMessages), new Date().toISOString(), currentSession.id)
          .run();

        // Send finish event
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'finish',
              sessionId: currentSession.id,
              traceId,
            })}\n\n`
          )
        );

        // Send done signal
        await writer.write(encoder.encode('data: [DONE]\n\n'));
      } catch (error: any) {
        // Send error event
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              errorText: error.message || 'Unknown error',
            })}\n\n`
          )
        );
      } finally {
        await writer.close();
      }
    })();

    // Return SSE response
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'x-vercel-ai-ui-message-stream': 'v1',
        'Access-Control-Allow-Origin': '*',
      },
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
 * GET /api/agents/:agentId/playground/sessions/:sessionId
 *
 * Get a specific playground session.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @param sessionId - Session ID from URL
 * @returns 200 OK with session details
 */
export async function getPlaygroundSession(
  request: Request,
  env: Env,
  agentId: string,
  sessionId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request)!;
    validateWorkspaceAccess(workspaceId);

    const session = await env.DB.prepare(
      'SELECT * FROM playground_sessions WHERE id = ? AND agent_id = ? AND workspace_id = ?'
    )
      .bind(sessionId, agentId, workspaceId)
      .first();

    if (!session) {
      return createErrorResponse('NOT_FOUND', 'Session not found', 404);
    }

    return createSuccessResponse({
      id: session.id,
      workspaceId: session.workspace_id,
      agentId: session.agent_id,
      agentVersionId: session.agent_version_id,
      messages: JSON.parse(session.messages as string),
      variables: JSON.parse(session.variables as string),
      files: JSON.parse(session.files as string),
      modelProvider: session.model_provider,
      modelId: session.model_id,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * DELETE /api/agents/:agentId/playground/sessions/:sessionId
 *
 * Delete a playground session.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @param sessionId - Session ID from URL
 * @returns 204 No Content
 */
export async function deletePlaygroundSession(
  request: Request,
  env: Env,
  agentId: string,
  sessionId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request)!;
    validateWorkspaceAccess(workspaceId);

    // Verify session exists
    const session = await env.DB.prepare(
      'SELECT id FROM playground_sessions WHERE id = ? AND agent_id = ? AND workspace_id = ?'
    )
      .bind(sessionId, agentId, workspaceId)
      .first();

    if (!session) {
      return createErrorResponse('NOT_FOUND', 'Session not found', 404);
    }

    // Delete session (cascading deletes will handle steps)
    await env.DB.prepare('DELETE FROM playground_sessions WHERE id = ?')
      .bind(sessionId)
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
 * GET /api/agents/:agentId/playground/sessions
 *
 * List all playground sessions for an agent.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with sessions list
 */
export async function listPlaygroundSessions(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request)!;
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

    // Get sessions
    const result = await env.DB.prepare(
      `SELECT id, agent_version_id, model_provider, model_id, created_at, updated_at
       FROM playground_sessions
       WHERE agent_id = ? AND workspace_id = ?
       ORDER BY updated_at DESC
       LIMIT 50`
    )
      .bind(agentId, workspaceId)
      .all();

    const sessions = result.results.map((row: any) => ({
      id: row.id,
      agentVersionId: row.agent_version_id,
      modelProvider: row.model_provider,
      modelId: row.model_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return createSuccessResponse({ sessions });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
