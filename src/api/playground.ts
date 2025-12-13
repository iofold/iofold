/**
 * Playground API Endpoints
 *
 * Handles real-time chat interactions with agents in the playground.
 * Uses LangGraph for agent orchestration with AI SDK UI-compatible streaming.
 */

/// <reference types="@cloudflare/workers-types" />

import {
  createErrorResponse,
  createSuccessResponse,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
} from './utils';
import { createPlaygroundDeepAgent, type StreamEvent } from '../playground/agent-deepagents';
import { D1TraceCollector } from '../playground/tracing/d1-collector';

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

interface PlaygroundEnv {
  DB: D1Database;
  BENCHMARKS_DB?: D1Database;
  SANDBOX?: unknown;
  CF_ACCOUNT_ID?: string;
  CF_AI_GATEWAY_ID?: string;
  CF_AI_GATEWAY_TOKEN?: string;
}

/**
 * Convert internal StreamEvent to AI SDK Stream Protocol format
 *
 * AI SDK Stream Protocol v1 expects these event types:
 * - message-start: Start of a new message
 * - text-delta: Streaming text content
 * - tool-call: Tool invocation with name and args
 * - tool-result: Result from tool execution
 * - finish: End of message
 * - error: Error during processing
 */
function formatAISDKEvent(event: StreamEvent): string {
  switch (event.type) {
    case 'message-start':
      return JSON.stringify({ type: 'message-start', messageId: event.messageId });

    case 'text-delta':
      return JSON.stringify({ type: 'text-delta', text: event.text });

    case 'tool-call-start':
      return JSON.stringify({
        type: 'tool-call',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
      });

    case 'tool-call-args':
      return JSON.stringify({
        type: 'tool-call-args',
        toolCallId: event.toolCallId,
        args: event.args,
      });

    case 'tool-call-end':
      return JSON.stringify({
        type: 'tool-call-end',
        toolCallId: event.toolCallId,
      });

    case 'tool-result':
      return JSON.stringify({
        type: 'tool-result',
        toolCallId: event.toolCallId,
        result: event.result,
      });

    case 'message-end':
      return JSON.stringify({ type: 'finish', messageId: event.messageId });

    case 'error':
      return JSON.stringify({
        type: 'error',
        errorText: event.error,
        errorCategory: 'llm_unknown',
        retryable: true,
      });

    default:
      return JSON.stringify(event);
  }
}

/**
 * POST /api/agents/:agentId/playground/chat
 *
 * Main chat endpoint with SSE streaming using LangGraph.
 * Creates or resumes a playground session and streams LLM responses.
 *
 * @param request - HTTP request with messages and session config
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns SSE stream with AI SDK protocol
 */
export async function playgroundChat(
  request: Request,
  env: PlaygroundEnv,
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
          modelProvider: (existingSession.model_provider as ModelProvider) || 'anthropic',
          modelId: (existingSession.model_id as string) || 'anthropic/claude-sonnet-4-5',
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
      const modelId = body.modelId || 'anthropic/claude-sonnet-4-5';
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

    // Update session model if request specifies a different model
    const effectiveModelProvider = body.modelProvider || currentSession.modelProvider;
    const effectiveModelId = body.modelId || currentSession.modelId;

    // If model changed, update the session
    if (effectiveModelProvider !== currentSession.modelProvider || effectiveModelId !== currentSession.modelId) {
      await env.DB.prepare(
        'UPDATE playground_sessions SET model_provider = ?, model_id = ?, updated_at = ? WHERE id = ?'
      )
        .bind(effectiveModelProvider, effectiveModelId, new Date().toISOString(), currentSession.id)
        .run();
      currentSession.modelProvider = effectiveModelProvider;
      currentSession.modelId = effectiveModelId;
    }

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
        // Create the DeepAgents playground agent
        const playgroundAgent = await createPlaygroundDeepAgent({
          db: env.DB,
          sandbox: env.SANDBOX,
          sessionId: currentSession.id,
          systemPrompt,
          modelProvider: currentSession.modelProvider,
          modelId: currentSession.modelId,
          agentId, // Pass agent ID to enable tool registry lookup
          benchmarksDb: env.BENCHMARKS_DB, // For email tools (Enron dataset)
          env: {
            CF_ACCOUNT_ID: env.CF_ACCOUNT_ID || '',
            CF_AI_GATEWAY_ID: env.CF_AI_GATEWAY_ID || '',
            CF_AI_GATEWAY_TOKEN: env.CF_AI_GATEWAY_TOKEN,
          },
        });

        // Prepare messages for the agent
        const agentMessages = body.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        // Track assistant response for session update
        let assistantResponse = '';

        // Generate traceId early so we can include it in stored messages
        const traceId = `trace_${crypto.randomUUID()}`;
        // Generate unique message IDs for tracking
        const userMessageId = `msg_${crypto.randomUUID()}`;
        const assistantMessageId = `msg_${crypto.randomUUID()}`;

        // Get or create playground integration for this workspace
        let playgroundIntegration = await env.DB.prepare(
          "SELECT id FROM integrations WHERE workspace_id = ? AND platform = 'playground'"
        )
          .bind(workspaceId)
          .first();

        if (!playgroundIntegration) {
          const integrationId = `int_playground_${crypto.randomUUID()}`;
          await env.DB.prepare(
            `INSERT INTO integrations (id, workspace_id, name, platform, api_key_encrypted, status)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
            .bind(integrationId, workspaceId, 'Playground', 'playground', 'none', 'active')
            .run();
          playgroundIntegration = { id: integrationId };
        }

        // Initialize trace collector
        const collector = new D1TraceCollector(env.DB);
        try {
          collector.startTrace(traceId, {
            workspaceId,
            sessionId: currentSession.id,
            agentId,
            agentVersionId: currentSession.agentVersionId,
            modelProvider: currentSession.modelProvider,
            modelId: currentSession.modelId,
            integrationId: playgroundIntegration.id as string,
          } as any);
        } catch (collectorError) {
          console.warn('Failed to start trace collector:', collectorError);
        }

        // Track active tool call spans
        const toolSpans = new Map<string, string>();
        // Track tool calls for persistence
        interface ToolCallRecord {
          id: string;
          name: string;
          args: string;
          result?: string;
        }
        const toolCallRecords = new Map<string, ToolCallRecord>();

        // Create a main LLM generation span to capture input/output
        let mainSpanId: string | undefined;
        try {
          mainSpanId = collector.startSpan({
            traceId,
            name: 'LLM Generation',
            input: {
              messages: agentMessages,
              model: currentSession.modelId,
              provider: currentSession.modelProvider,
            },
          });
          // Log as generation event
          collector.logGeneration({
            traceId,
            spanId: mainSpanId,
            name: 'LLM Generation',
            input: { messages: agentMessages },
          });
        } catch (collectorError) {
          console.warn('Failed to create main generation span:', collectorError);
        }

        // Stream events from the agent
        for await (const event of playgroundAgent.stream(agentMessages)) {
          // Track text for session update
          if (event.type === 'text-delta' && event.text) {
            assistantResponse += event.text;
          }

          // Track tool calls in collector and for persistence
          try {
            if (event.type === 'tool-call-start' && event.toolCallId && event.toolName) {
              const spanId = collector.startSpan({
                traceId,
                parentSpanId: mainSpanId,
                name: event.toolName,
                input: { toolName: event.toolName },
              });
              toolSpans.set(event.toolCallId, spanId);
              // Track for persistence
              toolCallRecords.set(event.toolCallId, {
                id: event.toolCallId,
                name: event.toolName,
                args: '',
              });
            } else if (event.type === 'tool-call-args' && event.toolCallId && event.args) {
              // Update args for persistence
              const record = toolCallRecords.get(event.toolCallId);
              if (record) {
                record.args = event.args;
              }
              const spanId = toolSpans.get(event.toolCallId);
              if (spanId) {
                // Get toolName from the record (saved during tool-call-start), not from event
                const toolName = record?.name || 'unknown';
                // Log tool call with parsed args
                try {
                  const parsedArgs = JSON.parse(event.args);
                  collector.logToolCall({
                    traceId,
                    spanId,
                    toolName,
                    input: parsedArgs,
                  });
                } catch (parseError) {
                  // If args aren't valid JSON, log as string
                  collector.logToolCall({
                    traceId,
                    spanId,
                    toolName,
                    input: { raw: event.args },
                  });
                }
              }
            } else if (event.type === 'tool-result' && event.toolCallId && event.result) {
              // Update result for persistence
              const record = toolCallRecords.get(event.toolCallId);
              if (record) {
                record.result = event.result;
              }
              const spanId = toolSpans.get(event.toolCallId);
              if (spanId) {
                // Parse result if possible
                let resultData: unknown;
                try {
                  resultData = JSON.parse(event.result);
                } catch {
                  resultData = event.result;
                }
                collector.logToolResult(spanId, resultData);
                collector.endSpan(spanId, resultData);
                toolSpans.delete(event.toolCallId);
              }
            }
          } catch (collectorError) {
            console.warn('Error tracking event in collector:', collectorError);
          }

          // Format and send the event
          const formattedEvent = formatAISDKEvent(event);
          await writer.write(encoder.encode(`data: ${formattedEvent}\n\n`));
        }

        // End the main LLM generation span with the response
        if (mainSpanId) {
          try {
            collector.endSpan(mainSpanId, { content: assistantResponse });
          } catch (collectorError) {
            console.warn('Failed to end main generation span:', collectorError);
          }
        }

        // End trace and flush to DB
        try {
          await collector.endTrace(traceId, assistantResponse);
        } catch (collectorError) {
          console.warn('Failed to end trace collector:', collectorError);
        }

        // Update session with new messages, including traceId and tool calls for the assistant message
        const userMessage = body.messages[body.messages.length - 1];
        // Convert tool call records to array for storage
        const toolCalls = Array.from(toolCallRecords.values());
        const updatedMessages = [
          ...currentSession.messages,
          {
            id: userMessageId,
            role: userMessage.role,
            content: userMessage.content,
            timestamp: new Date().toISOString(),
          },
          {
            id: assistantMessageId,
            role: 'assistant' as const,
            content: assistantResponse,
            traceId, // Include traceId so feedback UI shows when session is loaded
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined, // Include tool calls if any
            timestamp: new Date().toISOString(),
          },
        ];

        await env.DB.prepare(
          'UPDATE playground_sessions SET messages = ?, updated_at = ? WHERE id = ?'
        )
          .bind(JSON.stringify(updatedMessages), new Date().toISOString(), currentSession.id)
          .run();

        // Send session info in a custom event
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'session-info',
              sessionId: currentSession.id,
              traceId,
            })}\n\n`
          )
        );

        // Send done signal
        await writer.write(encoder.encode('data: [DONE]\n\n'));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              errorText: errorMessage,
              errorCategory: 'llm_unknown',
              retryable: true,
            })}\n\n`
          )
        );
      } finally {
        await writer.close();
      }
    })();

    // Return SSE response with AI SDK headers
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'x-vercel-ai-ui-message-stream': 'v1',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', errorMessage, 400);
    }
    if (errorMessage === 'Invalid JSON in request body') {
      return createErrorResponse('VALIDATION_ERROR', errorMessage, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', errorMessage || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents/:agentId/playground/sessions/:sessionId
 *
 * Get a specific playground session.
 */
export async function getPlaygroundSession(
  request: Request,
  env: PlaygroundEnv,
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', errorMessage, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', errorMessage || 'Internal server error', 500);
  }
}

/**
 * DELETE /api/agents/:agentId/playground/sessions/:sessionId
 *
 * Delete a playground session.
 */
export async function deletePlaygroundSession(
  request: Request,
  env: PlaygroundEnv,
  agentId: string,
  sessionId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request)!;
    validateWorkspaceAccess(workspaceId);

    const session = await env.DB.prepare(
      'SELECT id FROM playground_sessions WHERE id = ? AND agent_id = ? AND workspace_id = ?'
    )
      .bind(sessionId, agentId, workspaceId)
      .first();

    if (!session) {
      return createErrorResponse('NOT_FOUND', 'Session not found', 404);
    }

    await env.DB.prepare('DELETE FROM playground_sessions WHERE id = ?')
      .bind(sessionId)
      .run();

    return new Response(null, { status: 204 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', errorMessage, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', errorMessage || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents/:agentId/playground/sessions
 *
 * List all playground sessions for an agent with pagination support.
 * Query parameters:
 * - limit: Number of sessions to return (default 50, max 200)
 * - offset: Number of sessions to skip (default 0)
 */
export async function listPlaygroundSessions(
  request: Request,
  env: PlaygroundEnv,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request)!;
    validateWorkspaceAccess(workspaceId);

    // Parse pagination parameters from query string
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    // Validate and set defaults
    let limit = limitParam ? parseInt(limitParam, 10) : 50;
    let offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    // Enforce constraints
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;
    if (isNaN(offset) || offset < 0) offset = 0;

    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get total count
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM playground_sessions WHERE agent_id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    const total = (countResult?.total as number) || 0;

    // Get paginated sessions
    const result = await env.DB.prepare(
      `SELECT id, agent_version_id, model_provider, model_id, created_at, updated_at,
              json_array_length(messages) as message_count
       FROM playground_sessions
       WHERE agent_id = ? AND workspace_id = ?
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(agentId, workspaceId, limit, offset)
      .all();

    const sessions = result.results.map((row: Record<string, unknown>) => ({
      id: row.id,
      agentVersionId: row.agent_version_id,
      modelProvider: row.model_provider,
      modelId: row.model_id,
      messageCount: row.message_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return createSuccessResponse({
      sessions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + sessions.length < total,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', errorMessage, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', errorMessage || 'Internal server error', 500);
  }
}

/**
 * List all playground sessions across all agents
 * GET /api/playground/sessions
 */
export async function listAllPlaygroundSessions(
  request: Request,
  env: PlaygroundEnv
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request)!;
    validateWorkspaceAccess(workspaceId);

    // Parse pagination parameters from query string
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    // Validate and set defaults
    let limit = limitParam ? parseInt(limitParam, 10) : 50;
    let offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    // Enforce constraints
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;
    if (isNaN(offset) || offset < 0) offset = 0;

    // Get total count
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM playground_sessions WHERE workspace_id = ?'
    )
      .bind(workspaceId)
      .first();

    const total = (countResult?.total as number) || 0;

    // Get paginated sessions with agent info
    const result = await env.DB.prepare(
      `SELECT ps.id, ps.agent_id, ps.agent_version_id, ps.model_provider, ps.model_id,
              ps.created_at, ps.updated_at,
              json_array_length(ps.messages) as message_count,
              a.name as agent_name
       FROM playground_sessions ps
       LEFT JOIN agents a ON ps.agent_id = a.id
       WHERE ps.workspace_id = ?
       ORDER BY ps.updated_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(workspaceId, limit, offset)
      .all();

    const sessions = result.results.map((row: Record<string, unknown>) => ({
      id: row.id,
      agentId: row.agent_id,
      agentName: row.agent_name || 'Unknown Agent',
      agentVersionId: row.agent_version_id,
      modelProvider: row.model_provider,
      modelId: row.model_id,
      messageCount: row.message_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return createSuccessResponse({
      sessions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + sessions.length < total,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', errorMessage, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', errorMessage || 'Internal server error', 500);
  }
}
