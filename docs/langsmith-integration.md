# LangSmith Tracing Integration

This document describes the LangSmith tracing integration for iofold's internal LLM calls.

## Overview

iofold uses LangSmith to trace its own LLM calls (for eval generation, agent execution, etc.). This is separate from Langfuse, which tracks user application traces.

**Key distinction:**
- **Langfuse**: Tracks user application traces (external integrations)
- **LangSmith**: Tracks iofold's internal LLM calls (meta-prompting, eval generation, playground agents)

## Architecture

### Tracing Points

LangSmith tracing is enabled at two key integration points:

1. **OpenAI SDK calls** (via `wrapOpenAI`)
   - All calls through `createGatewayClient()` are automatically wrapped
   - Used by: `EvalGenerator`, `AutoEvalGenerator`, and other direct OpenAI SDK usage

2. **LangChain models** (via environment variables)
   - All `ChatOpenAI` models created by `getChatModel()` are traced
   - Used by: Playground agents (deepagents), LangGraph agents

### Implementation

```
src/ai/
├── gateway.ts              # OpenAI client with LangSmith wrapping
├── langsmith-tracer.ts     # LangSmith utilities and wrappers
└── langsmith-tracer.test.ts

src/playground/llm/
└── streaming.ts            # LangChain models with LangSmith env vars
```

## Configuration

### Environment Variables

Set these in your `.env` file or Cloudflare Workers secrets:

```bash
# Required: Enable LangSmith tracing
LANGSMITH_TRACING_V2=true

# Required: LangSmith API key (from https://smith.langchain.com)
LANGSMITH_API_KEY=lsv2_pt_...

# Optional: Project name (defaults to "iofold-development")
LANGSMITH_PROJECT=iofold-development
```

### Development Setup

1. Get your LangSmith API key from https://smith.langchain.com

2. Add to `.dev.vars` (for local development):
   ```bash
   LANGSMITH_API_KEY=lsv2_pt_...
   LANGSMITH_TRACING_V2=true
   LANGSMITH_PROJECT=iofold-development
   ```

3. Add to Cloudflare Workers secrets (for staging/production):
   ```bash
   wrangler secret put LANGSMITH_API_KEY
   # Paste your API key when prompted
   ```

4. Verify configuration in `wrangler.toml`:
   ```toml
   [vars]
   LANGSMITH_TRACING_V2 = "true"
   LANGSMITH_PROJECT = "iofold-development"
   ```

## Usage

### Automatic Tracing

All LLM calls are automatically traced when the environment variables are set:

```typescript
import { createGatewayClient } from './ai/gateway';

// This client is automatically wrapped with LangSmith tracing
const client = createGatewayClient(env);

// All calls are traced to LangSmith
const response = await client.chat.completions.create({
  model: 'anthropic/claude-sonnet-4-5',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

### LangChain Models

```typescript
import { getChatModel } from './playground/llm/streaming';

// This model is automatically traced to LangSmith
const model = getChatModel({
  provider: 'anthropic',
  modelId: 'claude-sonnet-4-5',
  env,
});

// All invocations are traced
const result = await model.invoke([
  { role: 'user', content: 'Hello' },
]);
```

### Custom Metadata

You can pass additional metadata to traced runs:

```typescript
const response = await client.chat.completions.create(
  {
    model: 'anthropic/claude-sonnet-4-5',
    messages: [{ role: 'user', content: 'Generate eval' }],
  },
  {
    langsmithExtra: {
      metadata: {
        eval_name: 'correctness_eval',
        trace_count: 10,
      },
      tags: ['eval-generation', 'production'],
    },
  }
);
```

## Viewing Traces

1. Go to https://smith.langchain.com
2. Select your project (e.g., "iofold-development")
3. View all traced LLM calls with:
   - Input/output messages
   - Latency and token usage
   - Cost breakdown
   - Error traces

## Testing

Run the test suite:

```bash
pnpm test src/ai/langsmith-tracer.test.ts
```

## Troubleshooting

### Traces not appearing in LangSmith

1. Check environment variables:
   ```typescript
   console.log('LANGSMITH_TRACING_V2:', env.LANGSMITH_TRACING_V2);
   console.log('LANGSMITH_API_KEY:', env.LANGSMITH_API_KEY?.slice(0, 10) + '...');
   ```

2. Look for log messages:
   - `[LangSmith] Tracing enabled for project: <project-name>` - Good, tracing is on
   - `[LangSmith] Tracing disabled (...)` - Tracing is off, check env vars

3. Check network connectivity:
   - LangSmith requires outbound HTTPS to `api.smith.langchain.com`
   - Verify Cloudflare Workers can reach the API

### LangChain models not traced

LangChain reads `LANGSMITH_*` environment variables directly. In Cloudflare Workers, you need to ensure these are properly passed:

```typescript
// The env object must include LANGSMITH_* vars
const model = getChatModel({
  provider: 'anthropic',
  modelId: 'claude-sonnet-4-5',
  env, // Must have LANGSMITH_TRACING_V2, LANGSMITH_API_KEY, LANGSMITH_PROJECT
});
```

### Disabling tracing

Set `LANGSMITH_TRACING_V2=false` or remove the environment variable:

```bash
# In .dev.vars
LANGSMITH_TRACING_V2=false
```

## Performance Impact

- **Minimal overhead**: LangSmith uses async batch uploading
- **No blocking**: Traces are uploaded in the background
- **Automatic batching**: Multiple runs are batched into single API calls
- **Memory efficient**: Configurable memory limits (default: 1GB buffer)

## Best Practices

1. **Use different projects per environment**:
   - Development: `iofold-development`
   - Staging: `iofold-staging`
   - Production: `iofold-production`

2. **Add meaningful metadata**:
   ```typescript
   langsmithExtra: {
     metadata: {
       workspace_id: 'ws_123',
       eval_set_id: 'eval_456',
     },
     tags: ['eval-generation', 'auto'],
   }
   ```

3. **Monitor costs**: LangSmith has usage limits on free tier
   - Review trace volume in dashboard
   - Consider sampling in production if needed

4. **Use tags for filtering**:
   - Tag by feature: `eval-generation`, `playground`, `improvement`
   - Tag by environment: `development`, `staging`, `production`
   - Tag by user: `user_${userId}`, `workspace_${workspaceId}`

## References

- [LangSmith Documentation](https://docs.smith.langchain.com)
- [LangSmith OpenAI Wrapper](https://docs.smith.langchain.com/tracing/faq/logging_and_viewing#trace-with-the-openai-sdk-or-other-sdks)
- [LangChain Tracing](https://docs.smith.langchain.com/tracing/faq/logging_and_viewing#use-langchain)
