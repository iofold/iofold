'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';

// API base URL from environment
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

// TypeScript interfaces
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  state: 'pending' | 'executing' | 'completed' | 'error';
  latencyMs?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  error?: string;
  errorCode?: RecoverableErrorCode;  // Code identifying the error type
  isRecoverableError?: boolean;       // True if user can continue conversation after error
  isStreaming?: boolean;
  traceId?: string; // Trace ID for feedback association
  feedbackRating?: 'positive' | 'negative' | 'neutral';
  feedbackId?: string;
}

export interface SendMessageOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  modelProvider?: 'anthropic' | 'openai' | 'google';
  modelId?: string;
  variables?: Record<string, string>;
  [key: string]: unknown;
}

// Error codes for recoverable errors (matches backend RecoverableErrorCode)
export type RecoverableErrorCode =
  | 'recursion_limit'
  | 'tool_timeout'
  | 'tool_error'
  | 'rate_limit'
  | 'context_overflow';

// LangGraph SSE event types (AI SDK Stream Protocol v1)
interface SSEEvent {
  type:
    | 'message-start'
    | 'text-delta'
    | 'tool-call'           // Legacy event type (kept for compatibility)
    | 'tool-call-start'     // Backend sends this when tool call begins
    | 'tool-call-args'
    | 'tool-call-end'
    | 'tool-result'
    | 'finish'
    | 'message-end'         // Backend sends this as completion signal
    | 'session-info'
    | 'error'
    | 'recoverable-error'; // Error that allows conversation to continue
  // text-delta
  text?: string;
  // message events
  messageId?: string;
  // tool events
  toolCallId?: string;
  toolName?: string;
  args?: string;
  result?: string;
  // session-info
  sessionId?: string;
  traceId?: string;
  // error / recoverable-error
  errorText?: string;
  errorCategory?: string;
  retryable?: boolean;
  error?: string;           // Alternative error message field
  errorCode?: RecoverableErrorCode; // Code for recoverable errors
  recoverable?: boolean;    // Indicates if conversation can continue
}

export function usePlaygroundChat(agentId: string, workspaceId: string, initialSessionId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);

  const abortControllerRef = useRef<AbortController | null>(null);
  // Flag to prevent auto-loading session after intentional clear
  const sessionClearedRef = useRef(false);

  // Helper function to generate unique IDs
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Track tool call args accumulation
  const toolArgsAccumulator = useRef<Record<string, string>>({});

  // Debug logging flag
  const DEBUG = false;

  // Helper function to handle SSE events (LangGraph format)
  const handleSSEEvent = useCallback((event: SSEEvent, assistantMessageId: string) => {
    if (DEBUG && event.type !== 'text-delta') {
      console.log('[FRONTEND] SSE Event:', event.type, event);
    }

    // Handle session-info event separately - update sessionId and associate traceId with message
    if (event.type === 'session-info') {
      if (event.sessionId) {
        setSessionId(event.sessionId);
      }
      // Associate traceId with the assistant message for feedback
      if (event.traceId) {
        setMessages((prev) => {
          const messageIndex = prev.findIndex((m) => m.id === assistantMessageId);
          if (messageIndex === -1) return prev;
          const updated = [...prev];
          updated[messageIndex] = { ...updated[messageIndex], traceId: event.traceId };
          return updated;
        });
      }
      return;
    }

    setMessages((prev) => {
      const messageIndex = prev.findIndex((m) => m.id === assistantMessageId);
      if (messageIndex === -1) return prev;

      const updatedMessages = [...prev];
      const message = { ...updatedMessages[messageIndex] };

      switch (event.type) {
        case 'message-start':
          // Message started, nothing to update yet
          break;

        case 'text-delta':
          if (event.text) {
            message.content += event.text;
          }
          break;

        case 'tool-call':
        case 'tool-call-start': // Backend sends 'tool-call-start'
          // New tool call starting
          if (event.toolCallId && event.toolName) {
            if (!message.toolCalls) {
              message.toolCalls = [];
            }
            // Check if this tool call already exists (avoid duplicates)
            const existingToolIndex = message.toolCalls.findIndex((t) => t.id === event.toolCallId);
            if (existingToolIndex === -1) {
              // Initialize args accumulator for this tool call
              toolArgsAccumulator.current[event.toolCallId] = '';
              message.toolCalls.push({
                id: event.toolCallId,
                name: event.toolName,
                args: {},
                state: 'pending',
              });
              if (DEBUG) console.log('[FRONTEND] Tool call created:', event.toolCallId, event.toolName, 'state: pending');
            } else {
              if (DEBUG) console.log('[FRONTEND] Tool call already exists, skipping:', event.toolCallId);
            }
          }
          break;

        case 'tool-call-args':
          // Accumulate tool arguments (may come in chunks)
          if (event.toolCallId && event.args) {
            toolArgsAccumulator.current[event.toolCallId] =
              (toolArgsAccumulator.current[event.toolCallId] || '') + event.args;

            // Try to parse the accumulated args
            if (message.toolCalls) {
              const toolIndex = message.toolCalls.findIndex((t) => t.id === event.toolCallId);
              if (toolIndex !== -1) {
                try {
                  const parsedArgs = JSON.parse(toolArgsAccumulator.current[event.toolCallId]);
                  message.toolCalls[toolIndex] = {
                    ...message.toolCalls[toolIndex],
                    args: parsedArgs,
                    state: 'executing',
                  };
                } catch {
                  // Args not yet complete, will parse when complete
                }
              }
            }
          }
          break;

        case 'tool-call-end':
          // Tool call arguments are complete
          if (event.toolCallId && message.toolCalls) {
            const toolIndex = message.toolCalls.findIndex((t) => t.id === event.toolCallId);
            if (toolIndex !== -1) {
              try {
                const parsedArgs = JSON.parse(toolArgsAccumulator.current[event.toolCallId] || '{}');
                message.toolCalls[toolIndex] = {
                  ...message.toolCalls[toolIndex],
                  args: parsedArgs,
                  state: 'executing',
                };
                if (DEBUG) console.log('[FRONTEND] Tool call args complete:', event.toolCallId, 'state: executing');
              } catch {
                // Keep current args
                if (DEBUG) console.log('[FRONTEND] Tool call args parse error:', event.toolCallId);
              }
            } else {
              if (DEBUG) console.log('[FRONTEND] Tool call not found for tool-call-end:', event.toolCallId);
            }
          }
          break;

        case 'tool-result':
          // Tool execution result
          if (event.toolCallId) {
            if (!message.toolCalls) {
              message.toolCalls = [];
            }
            const toolIndex = message.toolCalls.findIndex((t) => t.id === event.toolCallId);
            let parsedResult = event.result;
            try {
              parsedResult = JSON.parse(event.result || '{}');
            } catch {
              // Keep as string
            }
            if (toolIndex !== -1) {
              message.toolCalls[toolIndex] = {
                ...message.toolCalls[toolIndex],
                result: parsedResult,
                state: 'completed',
              };
              if (DEBUG) console.log('[FRONTEND] Tool result received:', event.toolCallId, 'state: completed');
            } else {
              // Tool call not found - create it with the result (handles out-of-order events)
              if (DEBUG) console.log('[FRONTEND] Tool call not found, creating with result:', event.toolCallId);
              message.toolCalls.push({
                id: event.toolCallId,
                name: event.toolName || 'unknown',
                args: {},
                result: parsedResult,
                state: 'completed',
              });
            }
          }
          break;

        case 'finish':
        case 'message-end': // Backend sends 'message-end' instead of 'finish'
          message.isStreaming = false;
          // Clean up tool args accumulator
          toolArgsAccumulator.current = {};
          if (DEBUG) {
            const pendingTools = message.toolCalls?.filter(t => t.state !== 'completed') || [];
            console.log('[FRONTEND] Message complete. Pending tools:', pendingTools.length, pendingTools.map(t => `${t.id}:${t.state}`));
          }
          break;

        case 'recoverable-error':
          // Recoverable error - conversation can continue
          // Don't mark isStreaming as false yet - wait for message-end
          message.error = event.error || event.errorText || 'An error occurred';
          message.errorCode = event.errorCode;
          message.isRecoverableError = true;
          // Add error message to content so user can see it
          if (message.content && !message.content.endsWith('\n')) {
            message.content += '\n\n';
          }
          message.content += `⚠️ ${message.error}`;
          // Clean up tool args accumulator
          toolArgsAccumulator.current = {};
          if (DEBUG) console.log('[FRONTEND] Recoverable error:', event.errorCode, event.error);
          break;

        case 'error':
          message.isStreaming = false;
          message.error = event.errorText || event.error || 'An error occurred';
          message.isRecoverableError = event.recoverable === true;
          message.errorCode = event.errorCode;
          // Clean up tool args accumulator
          toolArgsAccumulator.current = {};
          break;
      }

      updatedMessages[messageIndex] = message;
      return updatedMessages;
    });
  }, []);

  // Parse SSE stream
  const parseSSEStream = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    assistantMessageId: string
  ) => {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);

            // Handle special SSE messages
            if (data === '[DONE]') {
              handleSSEEvent({ type: 'finish' }, assistantMessageId);
              continue;
            }

            try {
              const event: SSEEvent = JSON.parse(data);
              handleSSEEvent(event, assistantMessageId);
            } catch (parseError) {
              console.error('Failed to parse SSE event:', parseError, data);
            }
          }
        }
      }
    } catch (streamError) {
      if (streamError instanceof Error && streamError.name !== 'AbortError') {
        console.error('Stream reading error:', streamError);
        handleSSEEvent(
          { type: 'error', errorText: streamError.message },
          assistantMessageId
        );
      }
    }
  };

  // Send message function
  const sendMessage = useCallback(
    async (content: string, options?: SendMessageOptions) => {
      if (!content.trim()) return;

      setIsLoading(true);
      setError(null);

      // Create user message
      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      // Create assistant message placeholder
      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      // Create abort controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        // Build request body matching backend PlaygroundChatRequest
        const requestBody: Record<string, unknown> = {
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        };

        // Add optional fields
        if (sessionId) {
          requestBody.sessionId = sessionId;
        }
        if (options?.modelProvider) {
          requestBody.modelProvider = options.modelProvider;
        }
        if (options?.modelId) {
          requestBody.modelId = options.modelId;
        }
        if (options?.variables) {
          requestBody.variables = options.variables;
        }

        const response = await fetch(
          `${API_BASE_URL}/api/agents/${agentId}/playground/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Workspace-Id': workspaceId,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`
          );
        }

        // Read SSE stream
        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        await parseSSEStream(reader, assistantMessage.id);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';

        if (err instanceof Error && err.name === 'AbortError') {
          // Handle abort gracefully
          handleSSEEvent({ type: 'error', errorText: 'Request cancelled' }, assistantMessage.id);
        } else {
          setError(err instanceof Error ? err : new Error(errorMessage));
          handleSSEEvent({ type: 'error', errorText: errorMessage }, assistantMessage.id);
          toast.error('Failed to send message', {
            description: errorMessage,
          });
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [agentId, workspaceId, messages, sessionId, handleSSEEvent, parseSSEStream]
  );

  // Retry failed message
  const retry = useCallback(
    async (messageId: string) => {
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      // Find the user message before this failed assistant message
      let userMessageIndex = messageIndex - 1;
      while (userMessageIndex >= 0 && messages[userMessageIndex].role !== 'user') {
        userMessageIndex--;
      }

      if (userMessageIndex < 0) {
        toast.error('Cannot retry', {
          description: 'No user message found to retry',
        });
        return;
      }

      const userMessage = messages[userMessageIndex];

      // Remove failed message and all messages after it
      setMessages((prev) => prev.slice(0, messageIndex));

      // Resend the user message
      await sendMessage(userMessage.content);
    },
    [messages, sendMessage]
  );

  // Stop current request
  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Clear messages
  const clearMessages = useCallback(() => {
    sessionClearedRef.current = true; // Prevent auto-loading session
    setMessages([]);
    setError(null);
    setSessionId(undefined);
  }, []);

  // Submit feedback for a message
  const submitFeedback = useCallback(
    async (
      messageId: string,
      rating: 'positive' | 'negative' | 'neutral',
      notes?: string
    ) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message?.traceId) {
        toast.error('Cannot submit feedback', {
          description: 'No trace ID associated with this message',
        });
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/feedback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Workspace-Id': workspaceId,
          },
          body: JSON.stringify({
            trace_id: message.traceId,
            agent_id: agentId,
            rating,
            notes,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to submit feedback');
        }

        const data = await response.json();

        // Update message with feedback info
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, feedbackRating: rating, feedbackId: data.id }
              : m
          )
        );

        toast.success('Feedback submitted');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        toast.error('Failed to submit feedback', {
          description: errorMessage,
        });
      }
    },
    [agentId, workspaceId, messages]
  );

  // Load a session from the backend
  const loadSession = useCallback(
    async (loadSessionId: string) => {
      try {
        sessionClearedRef.current = false; // Reset flag when loading a session
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `${API_BASE_URL}/api/agents/${agentId}/playground/sessions/${loadSessionId}`,
          {
            method: 'GET',
            headers: {
              'X-Workspace-Id': workspaceId,
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const sessionData = await response.json();

        // Convert stored messages to Message format
        const loadedMessages: Message[] = (sessionData.messages || []).map((msg: any) => {
          // Transform tool calls from backend format to frontend format
          let toolCalls: ToolCall[] | undefined = undefined;
          if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
            toolCalls = msg.toolCalls.map((tc: any) => {
              // Parse args if stored as JSON string
              let parsedArgs: Record<string, unknown> = {};
              if (typeof tc.args === 'string') {
                try {
                  parsedArgs = JSON.parse(tc.args);
                } catch {
                  parsedArgs = { raw: tc.args };
                }
              } else if (typeof tc.args === 'object') {
                parsedArgs = tc.args;
              }
              // Parse result if stored as JSON string
              let parsedResult: unknown = tc.result;
              if (typeof tc.result === 'string') {
                try {
                  parsedResult = JSON.parse(tc.result);
                } catch {
                  parsedResult = tc.result;
                }
              }
              return {
                id: tc.id,
                name: tc.name,
                args: parsedArgs,
                result: parsedResult,
                state: 'completed' as const, // Historical tool calls are always completed
              };
            });
          }
          return {
            id: msg.id || generateId(),
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
            toolCalls,
            error: msg.error,
            traceId: msg.traceId,
            feedbackRating: msg.feedbackRating,
            feedbackId: msg.feedbackId,
            isStreaming: false, // Loaded messages are never streaming
          };
        });

        // Update state with loaded messages and session ID
        setMessages(loadedMessages);
        setSessionId(loadSessionId);

        toast.success('Session loaded successfully');

        return sessionData;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(err instanceof Error ? err : new Error(errorMessage));
        toast.error('Failed to load session', {
          description: errorMessage,
        });
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [agentId, workspaceId]
  );

  // Set session ID (useful for switching sessions or starting a new one)
  const changeSession = useCallback((newSessionId: string | undefined) => {
    setSessionId(newSessionId);
  }, []);

  // Load initial session if provided (but not after intentional clear)
  useEffect(() => {
    if (initialSessionId && messages.length === 0 && !sessionClearedRef.current) {
      loadSession(initialSessionId).catch((err) => {
        console.error('Failed to load initial session:', err);
      });
    }
  }, [initialSessionId, loadSession, messages.length]);

  return {
    messages,
    sendMessage,
    isLoading,
    error,
    sessionId,
    retry,
    stop,
    clearMessages,
    submitFeedback,
    loadSession,
    changeSession,
  };
}
