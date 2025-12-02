# Playground Full Implementation Plan

**Date:** 2025-12-01
**Status:** Planning
**Estimated Effort:** 8-12 hours across multiple parallel workstreams

## Executive Summary

Transform the placeholder playground into a production-ready LLM-powered agent testing environment with:
- Real streaming LLM calls (Claude, GPT-4o, Gemini)
- Tool execution with timeout handling
- Error handling with retry UI
- Agent variant creation from playground
- Navigation restructure (Playground top-level, Resources under System)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                       │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Playground Page (/playground or /agents/:id/playground)          │  │
│  │  - useChat hook (AI SDK) or custom SSE reader                     │  │
│  │  - Message streaming with tool call display                       │  │
│  │  - Error states with retry buttons                                │  │
│  │  - Agent variant creation UI                                      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ SSE Stream
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND API                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  POST /api/agents/:id/playground/chat                             │  │
│  │  - Parse request → Get agent/version                              │  │
│  │  - Initialize LLM (Claude/GPT/Gemini)                             │  │
│  │  - Stream response with tool loop                                 │  │
│  │  - Persist session & steps to D1                                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│       LLM Providers          │   │      Tool Execution          │
│  - Anthropic SDK             │   │  - D1Backend (files)         │
│  - OpenAI SDK                │   │  - PythonRunner (sandbox)    │
│  - Google GenAI SDK          │   │  - Timeout handling          │
└──────────────────────────────┘   └──────────────────────────────┘
```

---

## Phase 1: Backend LLM Integration (3-4 hours)

### 1.1 Install Missing Dependencies
```bash
# Backend - install AI SDK providers for direct streaming
pnpm add @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google-vertex
```

### 1.2 Create LLM Streaming Module
**File:** `src/playground/llm/streaming.ts`

```typescript
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google-vertex';

export interface StreamConfig {
  provider: 'anthropic' | 'openai' | 'google';
  modelId: string;
  systemPrompt: string;
  messages: Message[];
  tools?: Tool[];
  env: Env;
}

export async function createLLMStream(config: StreamConfig) {
  const model = getProviderModel(config.provider, config.modelId, config.env);

  return streamText({
    model,
    system: config.systemPrompt,
    messages: config.messages,
    tools: config.tools,
    maxTokens: 4096,
    onFinish: async (result) => {
      // Track token usage
    }
  });
}

function getProviderModel(provider: string, modelId: string, env: Env) {
  switch (provider) {
    case 'anthropic':
      return anthropic(modelId, { apiKey: env.ANTHROPIC_API_KEY });
    case 'openai':
      return openai(modelId, { apiKey: env.OPENAI_API_KEY });
    case 'google':
      return google(modelId, { apiKey: env.GOOGLE_API_KEY });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

### 1.3 Update Playground Chat Endpoint
**File:** `src/api/playground.ts` (lines 195-280)

Replace mock streaming with real LLM calls:

```typescript
// Inside playgroundChat function, replace mock response section:

// Create LLM stream
const stream = await createLLMStream({
  provider: currentSession.modelProvider,
  modelId: currentSession.modelId,
  systemPrompt,
  messages: buildLLMMessages(currentSession.messages, body.messages),
  tools: createPlaygroundTools(env, currentSession.id),
  env
});

// Stream to SSE
for await (const chunk of stream.textStream) {
  await writer.write(
    encoder.encode(`data: ${JSON.stringify({
      type: 'text-delta',
      id: messageId,
      delta: chunk,
    })}\n\n`)
  );
}

// Handle tool calls if any
if (stream.toolCalls?.length > 0) {
  for (const toolCall of stream.toolCalls) {
    await writer.write(encoder.encode(`data: ${JSON.stringify({
      type: 'tool-input-available',
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input: toolCall.args,
    })}\n\n`));

    // Execute tool with timeout
    const result = await executeToolWithTimeout(toolCall, env, 10000);

    await writer.write(encoder.encode(`data: ${JSON.stringify({
      type: 'tool-output-available',
      toolCallId: toolCall.toolCallId,
      output: result,
    })}\n\n`));
  }
}
```

### 1.4 Tool Execution with Timeout
**File:** `src/playground/tools/executor.ts`

```typescript
export async function executeToolWithTimeout(
  toolCall: ToolCall,
  env: Env,
  timeoutMs: number = 10000
): Promise<ToolResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startTime = Date.now();

    let result: unknown;
    let error: string | undefined;

    switch (toolCall.toolName) {
      case 'execute_python':
        const runner = new PythonRunner({
          sandboxBinding: env.SANDBOX,
          timeout: Math.min(timeoutMs - 500, 5000) // Leave buffer
        });
        const execution = await runner.execute(toolCall.args.code as string);
        result = execution.success ? execution.output : undefined;
        error = execution.success ? undefined : execution.error;
        break;

      case 'read_file':
      case 'write_file':
      case 'list_files':
        // D1Backend operations...
        break;

      default:
        error = `Unknown tool: ${toolCall.toolName}`;
    }

    const latencyMs = Date.now() - startTime;

    return { result, error, latencyMs };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: `Tool execution timed out after ${timeoutMs}ms`, latencyMs: timeoutMs };
    }
    return { error: String(err), latencyMs: Date.now() - startTime };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### 1.5 Add LLM-Specific Error Types
**File:** `src/errors/llm-errors.ts`

```typescript
export type LLMErrorCategory =
  | 'llm_rate_limit'
  | 'llm_context_overflow'
  | 'llm_invalid_key'
  | 'llm_model_unavailable'
  | 'llm_safety_filter'
  | 'llm_timeout';

export function classifyLLMError(error: unknown): LLMErrorCategory | null {
  const message = String(error).toLowerCase();

  if (message.includes('rate limit') || message.includes('429')) {
    return 'llm_rate_limit';
  }
  if (message.includes('context') || message.includes('token limit')) {
    return 'llm_context_overflow';
  }
  if (message.includes('invalid api key') || message.includes('401')) {
    return 'llm_invalid_key';
  }
  if (message.includes('model') && message.includes('not found')) {
    return 'llm_model_unavailable';
  }
  if (message.includes('safety') || message.includes('content policy')) {
    return 'llm_safety_filter';
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'llm_timeout';
  }

  return null;
}

export function getLLMErrorRetryConfig(category: LLMErrorCategory) {
  switch (category) {
    case 'llm_rate_limit':
      return { retryable: true, initialDelayMs: 30000, maxRetries: 3 };
    case 'llm_timeout':
      return { retryable: true, initialDelayMs: 1000, maxRetries: 2 };
    case 'llm_context_overflow':
    case 'llm_invalid_key':
    case 'llm_model_unavailable':
    case 'llm_safety_filter':
      return { retryable: false };
  }
}
```

---

## Phase 2: Tool Execution Integration (2-3 hours)

### 2.1 Define Playground Tool Set
**File:** `src/playground/tools/definitions.ts`

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export function createPlaygroundTools(env: Env, sessionId: string) {
  const backend = new D1Backend(env.DB, sessionId);

  return [
    // Execute Python code
    tool(
      async ({ code }) => {
        const runner = new PythonRunner({
          sandboxBinding: env.SANDBOX,
          timeout: 5000
        });
        const result = await runner.execute(code);
        return result.success
          ? result.output || '(no output)'
          : `Error: ${result.error}`;
      },
      {
        name: 'execute_python',
        description: 'Execute Python code in a sandboxed environment. Only json, re, typing imports allowed.',
        schema: z.object({
          code: z.string().describe('Python code to execute')
        })
      }
    ),

    // Read file
    tool(
      async ({ path }) => {
        try {
          return await backend.read(path);
        } catch (err) {
          return `Error reading file: ${err}`;
        }
      },
      {
        name: 'read_file',
        description: 'Read contents of a file from the virtual filesystem',
        schema: z.object({
          path: z.string().describe('Absolute path starting with /')
        })
      }
    ),

    // Write file
    tool(
      async ({ path, content }) => {
        const result = await backend.write(path, content);
        return result.error || `File written: ${path}`;
      },
      {
        name: 'write_file',
        description: 'Write content to a file in the virtual filesystem',
        schema: z.object({
          path: z.string().describe('Absolute path starting with /'),
          content: z.string().describe('Content to write')
        })
      }
    ),

    // List files
    tool(
      async ({ path }) => {
        const files = await backend.lsInfo(path || '/');
        return files.map(f => `${f.is_dir ? '[dir] ' : ''}${f.path}`).join('\n');
      },
      {
        name: 'list_files',
        description: 'List files and directories in the virtual filesystem',
        schema: z.object({
          path: z.string().optional().describe('Directory path, defaults to /')
        })
      }
    )
  ];
}
```

### 2.2 Track Tool Execution Steps
**File:** `src/playground/tracing/step-recorder.ts`

```typescript
export async function recordToolStep(
  db: D1Database,
  sessionId: string,
  traceId: string,
  step: {
    stepIndex: number;
    stepType: 'llm_call' | 'tool_call' | 'tool_result';
    toolName?: string;
    toolArgs?: unknown;
    toolResult?: unknown;
    toolError?: string;
    latencyMs?: number;
    tokensInput?: number;
    tokensOutput?: number;
  }
) {
  const stepId = `step_${crypto.randomUUID()}`;

  await db.prepare(`
    INSERT INTO playground_steps (
      id, session_id, trace_id, step_index, step_type,
      tool_name, tool_args, tool_result, tool_error,
      latency_ms, tokens_input, tokens_output
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    stepId,
    sessionId,
    traceId,
    step.stepIndex,
    step.stepType,
    step.toolName || null,
    step.toolArgs ? JSON.stringify(step.toolArgs) : null,
    step.toolResult ? JSON.stringify(step.toolResult) : null,
    step.toolError || null,
    step.latencyMs || null,
    step.tokensInput || null,
    step.tokensOutput || null
  ).run();

  return stepId;
}
```

---

## Phase 3: Frontend Streaming Integration (2-3 hours)

### 3.1 Create Custom SSE Hook
**File:** `frontend/hooks/use-playground-chat.ts`

```typescript
import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  error?: string;
  isStreaming?: boolean;
}

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  state: 'pending' | 'executing' | 'completed' | 'error';
  latencyMs?: number;
}

export function usePlaygroundChat(agentId: string, workspaceId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (
    content: string,
    options: {
      modelProvider?: string;
      modelId?: string;
      variables?: Record<string, string>;
    } = {}
  ) => {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      toolCalls: []
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/agents/${agentId}/playground/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Id': workspaceId
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          sessionId,
          ...options
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Request failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            handleSSEEvent(event, assistantMessage.id, setMessages, setSessionId);
          } catch (e) {
            console.warn('Failed to parse SSE event:', data);
          }
        }
      }

      // Mark streaming complete
      setMessages(prev => prev.map(m =>
        m.id === assistantMessage.id
          ? { ...m, isStreaming: false }
          : m
      ));

    } catch (err) {
      if (err.name === 'AbortError') return;

      setError(err as Error);
      setMessages(prev => prev.map(m =>
        m.id === assistantMessage.id
          ? { ...m, error: (err as Error).message, isStreaming: false }
          : m
      ));
      toast.error(`Failed to send message: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [agentId, workspaceId, messages, sessionId]);

  const retry = useCallback((messageId: string) => {
    const failedIndex = messages.findIndex(m => m.id === messageId);
    if (failedIndex === -1) return;

    // Find the user message before this assistant message
    const userMessage = messages[failedIndex - 1];
    if (!userMessage || userMessage.role !== 'user') return;

    // Remove failed message and retry
    setMessages(prev => prev.slice(0, failedIndex));
    sendMessage(userMessage.content);
  }, [messages, sendMessage]);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    error,
    sessionId,
    retry,
    stop,
    clearMessages
  };
}

function handleSSEEvent(
  event: any,
  messageId: string,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  setSessionId: React.Dispatch<React.SetStateAction<string | undefined>>
) {
  switch (event.type) {
    case 'text-delta':
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, content: m.content + event.delta }
          : m
      ));
      break;

    case 'tool-input-available':
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? {
              ...m,
              toolCalls: [
                ...(m.toolCalls || []),
                {
                  id: event.toolCallId,
                  name: event.toolName,
                  args: event.input,
                  state: 'executing'
                }
              ]
            }
          : m
      ));
      break;

    case 'tool-output-available':
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? {
              ...m,
              toolCalls: m.toolCalls?.map(tc =>
                tc.id === event.toolCallId
                  ? {
                      ...tc,
                      result: event.output,
                      state: event.error ? 'error' : 'completed',
                      error: event.error
                    }
                  : tc
              )
            }
          : m
      ));
      break;

    case 'finish':
      setSessionId(event.sessionId);
      break;

    case 'error':
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, error: event.errorText, isStreaming: false }
          : m
      ));
      break;
  }
}
```

### 3.2 Update Playground Page
**File:** `frontend/app/agents/[id]/playground/page.tsx`

Key changes:
1. Replace manual fetch with `usePlaygroundChat` hook
2. Add retry button for failed messages
3. Add tool execution display with status
4. Add "Save as Variant" button for agent editing

### 3.3 Message Component with Retry
**File:** `frontend/components/playground/message-bubble.tsx`

```tsx
interface MessageBubbleProps {
  message: Message;
  onRetry?: () => void;
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  return (
    <div className={cn(
      'flex gap-3 p-4 rounded-lg',
      message.role === 'user' ? 'bg-muted' : 'bg-background'
    )}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        {message.role === 'user' ? (
          <User className="w-6 h-6" />
        ) : (
          <Bot className="w-6 h-6" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-2">
        <div className="prose prose-sm dark:prose-invert">
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
          )}
        </div>

        {/* Tool Calls */}
        {message.toolCalls?.map(tc => (
          <ToolCallDisplay key={tc.id} toolCall={tc} />
        ))}

        {/* Error with Retry */}
        {message.error && (
          <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive" />
            <span className="text-sm text-destructive">{message.error}</span>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCw className="w-3 h-3 mr-1" />
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallDisplay({ toolCall }: { toolCall: ToolCall }) {
  return (
    <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
      <div className="flex items-center gap-2">
        <Terminal className="w-4 h-4" />
        <span className="font-mono text-sm">{toolCall.name}</span>
        {toolCall.state === 'executing' && (
          <Loader2 className="w-3 h-3 animate-spin" />
        )}
        {toolCall.state === 'completed' && (
          <CheckCircle className="w-3 h-3 text-green-500" />
        )}
        {toolCall.state === 'error' && (
          <XCircle className="w-3 h-3 text-destructive" />
        )}
        {toolCall.latencyMs && (
          <span className="text-xs text-muted-foreground">
            {toolCall.latencyMs}ms
          </span>
        )}
      </div>

      {/* Args */}
      <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
        {JSON.stringify(toolCall.args, null, 2)}
      </pre>

      {/* Result */}
      {toolCall.result && (
        <pre className="text-xs bg-background p-2 rounded overflow-x-auto text-green-600">
          {typeof toolCall.result === 'string'
            ? toolCall.result
            : JSON.stringify(toolCall.result, null, 2)}
        </pre>
      )}

      {/* Error */}
      {toolCall.error && (
        <div className="text-xs text-destructive p-2 bg-destructive/10 rounded">
          {toolCall.error}
        </div>
      )}
    </div>
  );
}
```

---

## Phase 4: Agent Variant Creation (1-2 hours)

### 4.1 Add "Save as Variant" Button
**In Playground Page:**

```tsx
const [showSaveVariant, setShowSaveVariant] = useState(false);
const [editedPrompt, setEditedPrompt] = useState(activeVersion?.prompt_template || '');

const handleSaveVariant = async () => {
  const variables = extractVariables(editedPrompt);

  const response = await fetch(`/api/agents/${agentId}/versions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': workspaceId
    },
    body: JSON.stringify({
      prompt_template: editedPrompt,
      variables
    })
  });

  if (response.ok) {
    const newVersion = await response.json();
    toast.success(`Created version ${newVersion.version} (candidate)`);
    setShowSaveVariant(false);
    // Optionally switch to new version for testing
  }
};

function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{([^}]+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/[{}]/g, '').trim()))];
}
```

### 4.2 Editable System Prompt Panel

```tsx
{/* In config panel */}
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <Label>System Prompt</Label>
    <Button
      size="sm"
      variant="ghost"
      onClick={() => setIsEditingPrompt(!isEditingPrompt)}
    >
      {isEditingPrompt ? 'Preview' : 'Edit'}
    </Button>
  </div>

  {isEditingPrompt ? (
    <Textarea
      value={editedPrompt}
      onChange={(e) => setEditedPrompt(e.target.value)}
      className="font-mono text-sm min-h-[200px]"
    />
  ) : (
    <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
      {filledPrompt}
    </div>
  )}

  {isEditingPrompt && editedPrompt !== activeVersion?.prompt_template && (
    <div className="flex gap-2">
      <Button size="sm" onClick={handleSaveVariant}>
        Save as Variant
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setEditedPrompt(activeVersion?.prompt_template || '')}
      >
        Reset
      </Button>
    </div>
  )}
</div>
```

---

## Phase 5: Navigation Restructure (1 hour)

### 5.1 Update Sidebar Navigation
**File:** `frontend/components/sidebar/sidebar.tsx`

```tsx
import {
  LayoutDashboard, Bot, Search, BarChart3, Activity,
  Gamepad2, Settings, DollarSign  // Add Gamepad2 for Playground
} from 'lucide-react';

const navSections: NavSection[] = [
  {
    title: 'NAVIGATION',
    defaultExpanded: true,
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard },
      { href: '/playground', label: 'Playground', icon: Gamepad2 },  // NEW - Top level
      { href: '/agents', label: 'Agents', icon: Bot },
      { href: '/traces', label: 'Traces', icon: Search },
      { href: '/evals', label: 'Evals', icon: BarChart3 },
      { href: '/system', label: 'System', icon: Activity },
      // Resources removed from here
    ],
  },
  {
    title: 'SYSTEM',
    defaultExpanded: false,
    items: [
      { href: '/system/monitoring', label: 'Monitoring', icon: Activity },
      { href: '/system/resources', label: 'Resources', icon: DollarSign },  // Nested
      { href: '/system/jobs', label: 'Job Queue', icon: Settings },
    ],
  },
  {
    title: 'WORKFLOWS',
    defaultExpanded: false,
    items: [
      { href: '/setup', label: 'Setup Guide', icon: Compass },
      { href: '/review', label: 'Quick Review', icon: MessageSquare },
      { href: '/matrix', label: 'Matrix Analysis', icon: Grid3X3 },
      { href: '/integrations', label: 'IOFold Integration', icon: Puzzle },
    ],
  },
];
```

### 5.2 Create Top-Level Playground Page
**File:** `frontend/app/playground/page.tsx`

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import Link from 'next/link';

export default function PlaygroundPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.getAgents()
  });

  // If agent selected, redirect to agent playground
  if (selectedAgentId) {
    return <Link href={`/agents/${selectedAgentId}/playground`} />;
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Playground</h1>
        <p className="text-muted-foreground">
          Test and interact with your agents in real-time
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select an Agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select onValueChange={setSelectedAgentId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an agent to test..." />
            </SelectTrigger>
            <SelectContent>
              {agents?.agents?.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Recent sessions */}
          <div className="pt-4 border-t">
            <h3 className="font-medium mb-2">Recent Sessions</h3>
            {/* TODO: List recent sessions across all agents */}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 5.3 Move Resources Route
**File:** `frontend/app/system/resources/page.tsx`

Move content from `/resources/page.tsx` to `/system/resources/page.tsx`.

---

## Phase 6: Testing & Polish (1-2 hours)

### 6.1 E2E Tests
**File:** `frontend/e2e/05-playground/playground-streaming.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Playground Streaming', () => {
  test('should stream LLM response', async ({ page }) => {
    await page.goto('/agents/agent_test/playground');

    await page.fill('[data-testid="chat-input"]', 'Hello, what can you do?');
    await page.click('[data-testid="send-button"]');

    // Should show loading state
    await expect(page.locator('[data-testid="message-streaming"]')).toBeVisible();

    // Should eventually show response
    await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({
      timeout: 30000
    });
  });

  test('should display tool execution', async ({ page }) => {
    await page.goto('/agents/agent_test/playground');

    await page.fill('[data-testid="chat-input"]', 'Run this Python code: print("hello")');
    await page.click('[data-testid="send-button"]');

    // Should show tool call
    await expect(page.locator('[data-testid="tool-call"]')).toBeVisible({
      timeout: 30000
    });

    // Should show tool result
    await expect(page.locator('[data-testid="tool-result"]')).toContainText('hello');
  });

  test('should allow retry on error', async ({ page }) => {
    // Simulate error by disconnecting network
    await page.route('**/playground/chat', route => route.abort());

    await page.goto('/agents/agent_test/playground');
    await page.fill('[data-testid="chat-input"]', 'Test message');
    await page.click('[data-testid="send-button"]');

    // Should show error with retry button
    await expect(page.locator('[data-testid="message-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
  });
});
```

### 6.2 Unit Tests for Tool Executor
**File:** `src/playground/tools/executor.test.ts`

```typescript
describe('executeToolWithTimeout', () => {
  it('should execute python code within timeout', async () => {
    const result = await executeToolWithTimeout({
      toolName: 'execute_python',
      toolCallId: 'test',
      args: { code: 'print("hello")' }
    }, mockEnv, 5000);

    expect(result.error).toBeUndefined();
    expect(result.result).toContain('hello');
  });

  it('should return error on timeout', async () => {
    const result = await executeToolWithTimeout({
      toolName: 'execute_python',
      toolCallId: 'test',
      args: { code: 'import time; time.sleep(10)' }  // Will be blocked
    }, mockEnv, 100);

    expect(result.error).toContain('timeout');
  });
});
```

---

## Implementation Checklist

### Phase 1: Backend LLM Integration
- [ ] Install AI SDK provider packages
- [ ] Create `src/playground/llm/streaming.ts`
- [ ] Update `src/api/playground.ts` with real LLM calls
- [ ] Add tool loop for multi-turn tool use
- [ ] Create `src/errors/llm-errors.ts`
- [ ] Add retry logic for transient LLM errors

### Phase 2: Tool Execution
- [ ] Create `src/playground/tools/definitions.ts`
- [ ] Create `src/playground/tools/executor.ts` with timeout
- [ ] Create `src/playground/tracing/step-recorder.ts`
- [ ] Wire tools into streaming endpoint
- [ ] Add tool execution tests

### Phase 3: Frontend Streaming
- [ ] Create `frontend/hooks/use-playground-chat.ts`
- [ ] Create `frontend/components/playground/message-bubble.tsx`
- [ ] Update playground page with new hook
- [ ] Add error display with retry buttons
- [ ] Add tool call visualization

### Phase 4: Agent Variants
- [ ] Add "Save as Variant" button
- [ ] Add editable system prompt panel
- [ ] Add variable extraction utility
- [ ] Add version selector in playground

### Phase 5: Navigation
- [ ] Update sidebar with Playground top-level
- [ ] Create `/playground` landing page
- [ ] Move Resources under System
- [ ] Update active route highlighting

### Phase 6: Testing
- [ ] Add E2E tests for streaming
- [ ] Add E2E tests for tool execution
- [ ] Add E2E tests for retry
- [ ] Add unit tests for tool executor
- [ ] Manual testing across providers

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LLM API rate limits | Implement exponential backoff, show clear error messages |
| Tool execution hangs | Hard timeout with AbortController, sandbox 5s limit |
| Large context overflow | Pre-check token count, truncate old messages if needed |
| SSE connection drops | Frontend reconnection logic, session persistence |
| Cost runaway | Token counting, optional spending limits per session |

---

## Success Criteria

1. **Streaming works** - User sees tokens appear in real-time
2. **Tools execute** - Python code runs in sandbox with results displayed
3. **Errors are recoverable** - Retry button works for transient failures
4. **Variants can be created** - User can edit prompt and save as new version
5. **Navigation is intuitive** - Playground is top-level, Resources under System
6. **Performance** - First token <2s, tool execution <10s
