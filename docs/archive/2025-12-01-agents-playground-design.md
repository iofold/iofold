# Agents Playground Design

**Date:** 2025-12-01
**Status:** Draft
**Author:** Claude + Human collaboration

## Overview

Implement a real agents playground that enables users to interact with LLM-powered agents using system prompts from their agent versions. This replaces the current mock response system with actual LLM API calls, tool execution, and trace capture.

## Goals

1. **Real LLM interactions** - Replace mocked responses with actual API calls
2. **Tool execution** - Sandboxed Python execution + virtual filesystem
3. **Trace capture** - Ingest playground runs into our trace system for eval generation
4. **Multi-model support** - Claude, GPT-4o, Gemini with platform-managed keys
5. **Session persistence** - Resume conversations across page refreshes

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ Playground UI   │  │ useChat hook    │  │ Session Manager     │ │
│  │ (existing)      │  │ (AI SDK)        │  │ (load/save state)   │ │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘ │
└───────────┼─────────────────────┼─────────────────────┼────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker (API)                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              POST /api/agents/{id}/playground/chat           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │   │
│  │  │ DeepAgentsJS │  │ Tool Router  │  │ TraceCollector   │   │   │
│  │  │ ReAct Agent  │──│ (sandbox,fs) │  │ (D1 adapter)     │   │   │
│  │  └──────────────┘  └──────┬───────┘  └────────┬─────────┘   │   │
│  └───────────────────────────┼───────────────────┼─────────────┘   │
│                              │                   │                  │
│  ┌───────────────────────────▼───────────────────▼─────────────┐   │
│  │                      D1 Database                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│  │  │ playground_ │  │ playground_ │  │ traces              │  │   │
│  │  │ sessions    │  │ steps       │  │ (source=playground) │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│  ┌───────────────────────────▼──────────────────────────────────┐  │
│  │              Cloudflare Sandbox SDK (existing)                │  │
│  │              PythonRunner for code execution                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend runtime | Cloudflare Worker (TypeScript) | Existing infra, low latency |
| Agent framework | `deepagentsjs` + LangGraph.js | Built-in tools, production-ready |
| Tools | DeepAgents built-in + custom execute | Leverage existing, customize sandbox |
| Storage backend | Custom D1Backend | Persistent sessions in our DB |
| Streaming | Vercel AI SDK protocol | `useChat` hook, industry standard |
| Models | Claude, GPT-4o, Gemini | Platform keys only (MVP) |
| Tracing | Modular TraceCollector | D1 adapter, swappable for Langfuse |
| Sessions | Persistent in D1 | Required for debugging agent runs |

## Data Models

### New Tables

```sql
-- Playground sessions (agent state persistence)
CREATE TABLE playground_sessions (
  id TEXT PRIMARY KEY,                    -- sess_<uuid>
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_version_id TEXT NOT NULL,

  -- LangGraph state (serialized)
  messages TEXT NOT NULL DEFAULT '[]',    -- JSON: conversation history
  variables TEXT NOT NULL DEFAULT '{}',   -- JSON: template variable values

  -- Virtual filesystem state
  files TEXT NOT NULL DEFAULT '{}',       -- JSON: { path: content }

  -- Model configuration
  model_provider TEXT NOT NULL,           -- 'anthropic' | 'openai' | 'google'
  model_id TEXT NOT NULL,                 -- 'claude-sonnet-4-5-20250929'

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (agent_version_id) REFERENCES agent_versions(id)
);

-- Playground execution steps (granular tracing)
CREATE TABLE playground_steps (
  id TEXT PRIMARY KEY,                    -- step_<uuid>
  session_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,                 -- Links to traces table

  step_index INTEGER NOT NULL,
  step_type TEXT NOT NULL,                -- 'llm_call' | 'tool_call' | 'tool_result'

  -- Content
  input TEXT,                             -- JSON
  output TEXT,                            -- JSON

  -- Tool-specific
  tool_name TEXT,
  tool_args TEXT,                         -- JSON
  tool_result TEXT,                       -- JSON
  tool_error TEXT,

  -- Metrics
  latency_ms INTEGER,
  tokens_input INTEGER,
  tokens_output INTEGER,

  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (session_id) REFERENCES playground_sessions(id),
  FOREIGN KEY (trace_id) REFERENCES traces(id)
);

CREATE INDEX idx_playground_sessions_agent ON playground_sessions(agent_id);
CREATE INDEX idx_playground_steps_session ON playground_steps(session_id);
CREATE INDEX idx_playground_steps_trace ON playground_steps(trace_id);
```

### TypeScript Interfaces

```typescript
interface PlaygroundSession {
  id: string;
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
  messages: Message[];
  variables: Record<string, string>;
  files: Record<string, string>;
  modelProvider: 'anthropic' | 'openai' | 'google';
  modelId: string;
  createdAt: string;
  updatedAt: string;
}

interface PlaygroundStep {
  id: string;
  sessionId: string;
  traceId: string;
  stepIndex: number;
  stepType: 'llm_call' | 'tool_call' | 'tool_result';
  input?: unknown;
  output?: unknown;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;
  latencyMs?: number;
  tokensInput?: number;
  tokensOutput?: number;
  timestamp: string;
}
```

## Components

### 1. D1Backend (Custom DeepAgents Backend)

Implements `BackendProtocol` from deepagentsjs, persisting virtual filesystem to D1:

```typescript
// src/playground/backend/d1-backend.ts
import { BackendProtocol, FileInfo, WriteResult } from 'deepagents';

export class D1Backend implements BackendProtocol {
  constructor(private db: D1Database, private sessionId: string) {}

  async ls(path: string): Promise<Record<string, FileInfo>> {
    const session = await this.getSession();
    const files = JSON.parse(session.files || '{}');
    return this.filterByPath(files, path);
  }

  async read(path: string): Promise<string | null> {
    const session = await this.getSession();
    const files = JSON.parse(session.files || '{}');
    return files[path] ?? null;
  }

  async write(path: string, content: string): Promise<WriteResult> {
    const session = await this.getSession();
    const files = JSON.parse(session.files || '{}');
    files[path] = content;

    await this.db.prepare(
      'UPDATE playground_sessions SET files = ?, updated_at = ? WHERE id = ?'
    ).bind(JSON.stringify(files), new Date().toISOString(), this.sessionId).run();

    return { success: true, path };
  }

  async delete(path: string): Promise<boolean> { /* ... */ }
  async glob(pattern: string): Promise<Record<string, FileInfo>> { /* ... */ }
  async grep(pattern: string, path?: string): Promise<string> { /* ... */ }

  private async getSession() {
    return await this.db.prepare(
      'SELECT files FROM playground_sessions WHERE id = ?'
    ).bind(this.sessionId).first();
  }
}
```

### 2. Cloudflare Sandbox Execute Tool

Override deepagentsjs `execute` to use existing PythonRunner:

```typescript
// src/playground/tools/cloudflare-execute.ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { PythonRunner } from '../../sandbox/python-runner';

export const createCloudflareExecuteTool = (sandbox: SandboxBinding) => tool(
  async ({ command }): Promise<string> => {
    if (!command.startsWith('python')) {
      return 'Error: Only Python execution supported. Use: python script.py';
    }

    const runner = new PythonRunner({ sandboxBinding: sandbox, timeout: 5000 });
    const result = await runner.execute(command);

    return result.success ? result.output : `Error: ${result.error}`;
  },
  {
    name: 'execute',
    description: 'Execute a command in the sandbox. Currently supports Python only.',
    schema: z.object({
      command: z.string().describe('Command to execute (e.g., "python script.py")'),
    }),
  }
);
```

### 3. TraceCollector Interface (Modular)

Mirrors Langfuse/LangSmith callback patterns for easy swapping:

```typescript
// src/playground/tracing/types.ts
interface TraceEvent {
  type: 'span_start' | 'span_end' | 'generation' | 'tool_call' | 'tool_result';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  timestamp: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  usage?: { inputTokens: number; outputTokens: number };
  latencyMs?: number;
  error?: string;
}

interface TraceCollector {
  startTrace(traceId: string, metadata: TraceMetadata): void;
  endTrace(traceId: string, output?: unknown): Promise<void>;
  startSpan(event: SpanStartEvent): string;
  endSpan(spanId: string, output?: unknown, error?: string): void;
  logGeneration(event: GenerationEvent): void;
  logToolCall(event: ToolCallEvent): void;
  logToolResult(spanId: string, result: unknown, error?: string): void;
  flush(): Promise<void>;
}

// src/playground/tracing/d1-collector.ts
class D1TraceCollector implements TraceCollector {
  private db: D1Database;
  private buffer: TraceEvent[] = [];
  private traceId: string;
  private sessionId: string;

  constructor(db: D1Database, sessionId: string) {
    this.db = db;
    this.sessionId = sessionId;
  }

  // Implementation inserts into traces + playground_steps tables
  // Converts events to LangGraphExecutionStep format on flush()
}
```

### 4. Playground Agent Factory

```typescript
// src/playground/agent.ts
import { createDeepAgent } from 'deepagents';
import { D1Backend } from './backend/d1-backend';
import { createCloudflareExecuteTool } from './tools/cloudflare-execute';

export function createPlaygroundAgent(config: {
  db: D1Database;
  sandbox: SandboxBinding;
  sessionId: string;
  systemPrompt: string;
  model: BaseChatModel;
}) {
  const backend = new D1Backend(config.db, config.sessionId);

  return createDeepAgent({
    model: config.model,
    systemPrompt: config.systemPrompt,
    backend,
    tools: [
      createCloudflareExecuteTool(config.sandbox),
    ],
    // Built-in tools (read_file, write_file, ls, etc.) come automatically
  });
}
```

### 5. Model Configuration

```typescript
// src/playground/models/index.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export type ModelProvider = 'anthropic' | 'openai' | 'google';

export const MODEL_OPTIONS = [
  { provider: 'anthropic', modelId: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { provider: 'openai', modelId: 'gpt-4o', label: 'GPT-4o' },
  { provider: 'google', modelId: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
] as const;

export function getModel(provider: ModelProvider, modelId: string, env: Env) {
  const configs = {
    anthropic: () => new ChatAnthropic({ apiKey: env.ANTHROPIC_API_KEY, model: modelId }),
    openai: () => new ChatOpenAI({ apiKey: env.OPENAI_API_KEY, model: modelId }),
    google: () => new ChatGoogleGenerativeAI({ apiKey: env.GOOGLE_API_KEY, model: modelId }),
  };
  return configs[provider]();
}
```

### 6. API Endpoint (AI SDK Compatible)

```typescript
// src/api/playground.ts
import { Hono } from 'hono';

app.post('/:agentId/playground/chat', async (c) => {
  const { agentId } = c.req.param();
  const body = await c.req.json<{
    messages: Array<{ role: string; content: string }>;
    sessionId?: string;
    variables?: Record<string, string>;
    modelProvider?: ModelProvider;
    modelId?: string;
  }>();

  // 1. Get agent + version
  // 2. Get or create session
  // 3. Fill system prompt with variables
  // 4. Initialize model + tracing
  // 5. Create deepagents agent
  // 6. Stream response via AI SDK protocol

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
  });
});
```

**SSE Event Types (AI SDK Protocol):**

| Event | Data | Purpose |
|-------|------|---------|
| `start` | `{ messageId }` | Message initialization |
| `text-delta` | `{ id, delta }` | Streaming tokens |
| `tool-input-start` | `{ toolCallId, toolName }` | Tool execution started |
| `tool-input-available` | `{ toolCallId, toolName, input }` | Tool input ready |
| `tool-output-available` | `{ toolCallId, output }` | Tool result |
| `text-end` | `{ id }` | Text complete |
| `finish` | `{ sessionId, traceId }` | Stream complete |
| `error` | `{ errorText }` | Error occurred |

### 7. Frontend Integration

```typescript
// frontend/app/agents/[id]/playground/page.tsx
'use client';
import { useChat } from '@ai-sdk/react';

export default function PlaygroundPage({ params }: { params: { id: string } }) {
  const [sessionId, setSessionId] = useState<string>();

  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: `/api/agents/${params.id}/playground/chat`,
    body: { sessionId },
    onToolCall: ({ toolCall }) => {
      console.log(`Tool: ${toolCall.toolName}`, toolCall.input);
    },
    onFinish: (message) => {
      if (message.sessionId) setSessionId(message.sessionId);
    },
  });

  // Render chat UI with messages, input, status
}
```

## Dependencies

**New packages to add:**

```bash
# Backend (Worker)
pnpm add deepagents @langchain/anthropic @langchain/openai @langchain/google-genai

# Frontend
pnpm add @ai-sdk/react
```

**Environment variables (wrangler.toml):**

```toml
[vars]
ANTHROPIC_API_KEY = ""
OPENAI_API_KEY = ""
GOOGLE_API_KEY = ""
```

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Add D1 migrations for new tables
- [ ] Implement D1Backend for deepagentsjs
- [ ] Implement D1TraceCollector
- [ ] Create model configuration module

### Phase 2: Agent & API
- [ ] Create Cloudflare execute tool
- [ ] Create playground agent factory
- [ ] Implement `/playground/chat` API endpoint
- [ ] Add session CRUD endpoints

### Phase 3: Frontend
- [ ] Install @ai-sdk/react
- [ ] Update playground page to use useChat
- [ ] Add model selector UI
- [ ] Add session management (new/resume/clear)
- [ ] Show tool execution in UI

### Phase 4: Polish
- [ ] Add rate limiting for platform keys
- [ ] Add token usage tracking
- [ ] Add error handling UI
- [ ] Test all three model providers

## Security Considerations

1. **Sandbox isolation** - Python execution via existing PythonRunner with whitelist imports
2. **API key protection** - Platform keys in environment, never exposed to frontend
3. **Session isolation** - Sessions scoped to workspace
4. **Rate limiting** - Prevent abuse of platform API keys

## Future Enhancements

- User-provided API keys (workspace settings)
- More tools (web search, calculator, etc.)
- Langfuse export for TraceCollector
- Multi-turn checkpointing with LangGraph
- Voice input/output
