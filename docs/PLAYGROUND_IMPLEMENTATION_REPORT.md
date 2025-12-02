# Agents Playground Implementation Report

**Date:** 2025-12-01
**Status:** Phase 1 Complete (MVP with Mock Responses)
**Author:** Claude Code

## Overview

Successfully implemented the Agents Playground chat API endpoint with SSE streaming support, database schema, and placeholder agent factory. The implementation follows the design document and provides a foundation for real LLM integration.

## What Was Implemented

### 1. Database Schema (`src/db/migrations/003_add_playground_tables.sql`)

Created two new tables for playground functionality:

#### `playground_sessions` Table
- Stores conversation state and configuration
- Fields: id, workspace_id, agent_id, agent_version_id, messages (JSON), variables (JSON), files (JSON), model_provider, model_id, timestamps
- Foreign keys to workspaces, agents, and agent_versions
- Indexes on workspace_id, agent_id, and agent_version_id

#### `playground_steps` Table
- Stores granular execution traces
- Fields: id, session_id, trace_id, step_index, step_type, input/output (JSON), tool fields, metrics (latency, tokens), timestamp
- Foreign keys to playground_sessions and traces
- Indexes on session_id and trace_id

### 2. Playground API Router (`src/api/playground.ts`)

Implemented four endpoints:

#### `POST /api/agents/:agentId/playground/chat`
- **Main chat endpoint** with SSE streaming
- Accepts: messages, optional sessionId, variables, modelProvider, modelId
- Creates or resumes sessions
- Fills system prompt template with variables
- Streams responses using AI SDK protocol
- Captures traces to database
- Returns SSE stream with events: start, text-delta, finish, error

#### `GET /api/agents/:agentId/playground/sessions/:sessionId`
- Retrieves complete session details
- Returns: id, messages, variables, files, model config, timestamps

#### `DELETE /api/agents/:agentId/playground/sessions/:sessionId`
- Deletes a session and cascading steps
- Returns 204 No Content

#### `GET /api/agents/:agentId/playground/sessions`
- Lists all sessions for an agent (max 50, sorted by updated_at DESC)
- Returns: session summaries with metadata

### 3. Agent Factory Module (`src/playground/agent.ts`)

Created placeholder module for future deepagentsjs integration:

- `createPlaygroundAgent()` - Factory function (placeholder)
- `D1Backend` class - Virtual filesystem backend (placeholder)
- `createCloudflareExecuteTool()` - Sandboxed Python execution (placeholder)

### 4. Type Definitions (`src/types/playground.ts`)

Comprehensive TypeScript types:

- `ModelProvider`, `PlaygroundSession`, `Message`, `PlaygroundStep`
- SSE event types (`SSEEvent` union type)
- API request/response types
- Compatible with Vercel AI SDK

### 5. Route Registration (`src/api/index.ts`)

- Imported playground handlers
- Added route matching for all four endpoints
- Positioned after agent routes, before 404 handler

### 6. Environment Variables (`src/index.ts`)

Updated `Env` interface with:
- `OPENAI_API_KEY?: string`
- `GOOGLE_API_KEY?: string`

## AI SDK SSE Protocol Implementation

The chat endpoint streams events in Vercel AI SDK format:

```typescript
// Event types sent:
data: {"type":"start","messageId":"uuid"}
data: {"type":"text-delta","id":"uuid","delta":"word "}
data: {"type":"finish","sessionId":"sess_xyz","traceId":"trace_xyz"}
data: [DONE]

// Headers:
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
x-vercel-ai-ui-message-stream: v1
```

## Current Implementation Status

### ✅ Completed
- Database schema with migrations
- Full API router with SSE streaming
- Session CRUD operations
- Trace capture for playground runs
- AI SDK protocol compliance
- TypeScript types
- Route registration
- Environment variable updates

### 🚧 Placeholder (Mock Implementation)
- **LLM API calls** - Currently returns mock responses with simulated streaming
- **deepagentsjs integration** - Placeholder agent factory
- **Tool execution** - No real Python sandbox integration yet
- **D1Backend** - Filesystem persistence not implemented
- **Token counting** - Not implemented
- **Error handling** - Basic error responses only

## Architecture Decisions

1. **SSE over WebSocket** - Follows Vercel AI SDK pattern for broad compatibility
2. **Session persistence** - All state saved to D1 for debugging and resumption
3. **Trace integration** - Playground runs captured in existing traces table with `source='playground'`
4. **Mock responses** - Allows frontend development without LLM API keys
5. **Modular design** - Agent factory separate from API layer for future swapping

## API Examples

### Start a Chat Session

```bash
curl -X POST http://localhost:8787/api/agents/agent_123/playground/chat \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: workspace_default" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}],
    "variables": {"user_name": "Alice"},
    "modelProvider": "anthropic",
    "modelId": "claude-sonnet-4-5-20250929"
  }'
```

Response (SSE stream):
```
data: {"type":"start","messageId":"abc123"}

data: {"type":"text-delta","id":"abc123","delta":"This "}

data: {"type":"text-delta","id":"abc123","delta":"is "}

data: {"type":"finish","sessionId":"sess_xyz","traceId":"trace_123"}

data: [DONE]
```

### Resume Session

```bash
curl -X POST http://localhost:8787/api/agents/agent_123/playground/chat \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: workspace_default" \
  -d '{
    "sessionId": "sess_xyz",
    "messages": [{"role": "user", "content": "Tell me more"}]
  }'
```

### List Sessions

```bash
curl http://localhost:8787/api/agents/agent_123/playground/sessions \
  -H "X-Workspace-Id: workspace_default"
```

Response:
```json
{
  "sessions": [
    {
      "id": "sess_xyz",
      "agentVersionId": "av_123",
      "modelProvider": "anthropic",
      "modelId": "claude-sonnet-4-5-20250929",
      "createdAt": "2025-12-01T10:00:00Z",
      "updatedAt": "2025-12-01T10:05:00Z"
    }
  ]
}
```

## Files Created/Modified

### Created
- `/src/api/playground.ts` (14KB) - Main API router
- `/src/playground/agent.ts` (3KB) - Agent factory placeholders
- `/src/db/migrations/003_add_playground_tables.sql` (2.9KB) - Schema migration
- `/src/types/playground.ts` (2.2KB) - Type definitions

### Modified
- `/src/api/index.ts` - Added route registration
- `/src/index.ts` - Updated Env interface

## Next Steps

### Phase 2: Real LLM Integration

1. **Install Dependencies**
   ```bash
   pnpm add deepagents @langchain/anthropic @langchain/openai @langchain/google-genai
   ```

2. **Implement D1Backend**
   - Implement `BackendProtocol` interface
   - File operations: ls, read, write, delete, glob, grep
   - Persist to `playground_sessions.files` JSON column

3. **Implement CloudflareExecuteTool**
   - Use existing `PythonRunner` from `src/sandbox/python-runner.ts`
   - Wrap in LangChain tool format
   - Validate Python-only commands

4. **Replace Mock Streaming**
   - Initialize LangChain models based on provider
   - Stream real LLM responses
   - Handle tool calls and results
   - Count tokens and track metrics

5. **Add TraceCollector**
   - Capture LLM calls to `playground_steps`
   - Convert to `LangGraphExecutionStep` format
   - Link to main `traces` table

### Phase 3: Frontend Integration

1. **Install AI SDK**
   ```bash
   cd frontend && pnpm add @ai-sdk/react
   ```

2. **Update Playground Page**
   - Replace mock UI with `useChat` hook
   - Add model selector dropdown
   - Display tool execution status
   - Show token usage

3. **Session Management UI**
   - New/Resume/Clear session buttons
   - Session history sidebar
   - Export conversation feature

### Phase 4: Production Readiness

1. **Rate Limiting** - Prevent API key abuse
2. **Token Budgets** - Per-session limits
3. **Error Recovery** - Retry logic for transient failures
4. **Observability** - Metrics and logging
5. **Testing** - E2E tests for streaming endpoints

## Testing Recommendations

### Database Migration
```bash
# Apply migration locally
wrangler d1 execute iofold --file=src/db/migrations/003_add_playground_tables.sql --local

# Verify tables
wrangler d1 execute iofold --command="SELECT name FROM sqlite_master WHERE type='table'" --local
```

### API Endpoint Testing
```bash
# Test chat endpoint
curl -N http://localhost:8787/api/agents/agent_123/playground/chat \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: workspace_default" \
  -d '{"messages":[{"role":"user","content":"test"}]}'

# Test session listing
curl http://localhost:8787/api/agents/agent_123/playground/sessions \
  -H "X-Workspace-Id: workspace_default"
```

### Integration Testing
1. Create test agent with active version
2. Start chat session and verify SSE stream
3. Resume session and verify message history
4. Check trace captured in database
5. Delete session and verify cleanup

## Blockers & Considerations

### Current Blockers
- None - implementation is complete for Phase 1

### Design Considerations

1. **No agent_id in traces** - Design doc showed foreign key to agents table, but current schema uses `feedback.agent_id` for linking. Playground uses `source='playground'` and stores `trace_id='playground_{sessionId}'` for linking.

2. **Variable substitution** - Simple regex replacement used. May need more robust templating (Mustache, Handlebars) for complex prompts.

3. **Mock streaming delay** - 50ms per word. Adjust for realistic feel in testing.

4. **Session limit** - Currently fetches 50 most recent sessions. Add pagination for production.

5. **Trace storage** - Playground traces stored with `integration_id=NULL`. May want dedicated integration record.

## Security Notes

- API keys never exposed to frontend
- Sessions scoped to workspace (multi-tenancy safe)
- Input validation on all endpoints
- CORS headers already configured
- TODO: Add rate limiting per workspace

## Performance Considerations

- SSE streaming reduces perceived latency
- Session list limited to 50 records
- Indexes on all foreign keys
- JSON columns for flexible state storage
- Consider pagination for large message histories

## Conclusion

Phase 1 implementation is **complete and ready for testing**. The mock streaming allows frontend development to proceed in parallel with Phase 2 (real LLM integration). All API endpoints follow existing patterns and are production-ready architecturally.

The modular design allows for incremental enhancement:
1. Test with mock responses
2. Swap in real LLM calls
3. Add tool execution
4. Enable trace capture

Next immediate action: **Run database migration and test API endpoints**.
