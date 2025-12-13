# Playground User Guide

## Overview

The **Playground** is an interactive testing environment for agents. It provides real-time chat with SSE streaming, tool execution visibility, session management, and feedback collection - making it easy to test and refine agent behavior before deploying to production.

## Key Features

### 1. Real-time Streaming Chat
- **SSE streaming**: Server-Sent Events (SSE) provide instant token-by-token responses
- **Tool execution tracking**: Watch tools execute in real-time with args, results, and latency
- **Error recovery**: Recoverable errors (rate limits, timeouts) allow conversation to continue
- **Stop generation**: Cancel in-progress responses with one click

### 2. Multi-Model Support
Switch between models on-the-fly:

| Provider | Models | Use Case |
|----------|--------|----------|
| **Anthropic** | Claude Sonnet 4.5, Haiku 4.5, Opus 4.5 | General purpose, reasoning, coding |
| **OpenAI** | GPT-5 Mini, GPT-5 Nano | Fast responses, cost-effective |
| **Google** | Gemini 2.5 Flash, Gemini 2.5 Pro | Multimodal, large context |

**Default**: Claude Sonnet 4.5 (`anthropic/claude-sonnet-4-5`)

### 3. Session Management
- **Persistent sessions**: Conversations saved automatically to D1 database
- **Session sharing**: Copy shareable URLs to collaborate or resume later
- **Session history**: Browse past sessions via sidebar
- **Multi-session**: Switch between sessions without losing context

### 4. Variable Management
- **Template variables**: Use `{{variable}}` syntax in system prompts
- **Live editing**: Update variables without recreating sessions
- **Persistent state**: Variables saved per session

### 5. Tool Visibility
Every tool call shows:
- **Tool name** and **arguments**
- **Execution state**: pending → executing → completed/error
- **Latency** in milliseconds
- **Result** or error message
- **Collapsible UI**: Historical tool calls collapsed by default

### 6. Feedback Collection
- **Thumbs up/down**: Rate assistant messages
- **Optional notes**: Add context to feedback
- **Trace association**: Feedback linked to traces for eval generation

## Getting Started

### Access the Playground

1. Navigate to **Agents** page
2. Select an agent
3. Click **"Playground"** tab

Or use direct URL: `/agents/{agentId}/playground`

### Basic Usage

1. **Select model** (top-right dropdown)
2. **Configure variables** (sidebar, if any)
3. **Type message** in input box
4. **Press Enter** to send (Shift+Enter for new line)
5. **Watch response stream** with tool execution details

### Quick Actions (Sidebar)
Pre-filled prompts for common tests:
- **Greeting**: "Hello, how can you help me?"
- **Capabilities**: "What are your capabilities?"
- **Complex Task**: "Can you help me with a complex task?"

## UI Walkthrough

### Header Bar
```
[Back] [Agent Name] Playground          [Model ▼] [Version ▼] [⚙ Config] [📋 Copy] [🔗 Link] [🔄 New] [Clear]
```

- **Model selector**: Switch between Claude/GPT/Gemini
- **Version selector**: Test different prompt versions
- **Show/Hide Config**: Toggle configuration sidebar
- **Copy**: Copy conversation to clipboard
- **Link**: Copy shareable session URL
- **New**: Start fresh session
- **Clear**: Clear current session

### Configuration Sidebar (Left)
Shows when "Show Config" is active:

```
Model
├─ Claude Sonnet 4.5
└─ anthropic / anthropic/claude-sonnet-4-5

System Prompt
├─ [Edit] / [Preview] toggle
├─ Live preview with filled variables
└─ [Save as Variant] (if edited)

Session
└─ sess_abc123... (current session ID)

Variables
├─ {{customer_name}}
├─ {{product_type}}
└─ ... (editable inputs)

Quick Actions
├─ Greeting
├─ Capabilities
└─ Complex Task
```

### Session Sidebar (Far Left)
- Lists all sessions for current agent
- Shows message count and timestamp
- Click to load session
- Automatically updates when new sessions created

### Chat Area (Center)
- **User messages**: Right-aligned, blue background
- **Assistant messages**: Left-aligned, gray background
- **Streaming indicator**: Animated cursor (▊) while generating
- **Tool calls**: Collapsible section with execution details
- **Feedback**: Thumbs up/down (only after response completes)
- **Error messages**: Red border with retry button

### Input Area (Bottom)
```
┌─────────────────────────────────────────────┐
│ Type your message...                        │
│                                             │  [Send] or [Stop]
└─────────────────────────────────────────────┘
Press Enter to send, Shift+Enter for new line
```

## Advanced Features

### Editing System Prompts
1. Click **Edit** button in sidebar
2. Modify prompt template (keep `{{variables}}` syntax)
3. Preview filled prompt by clicking **Preview**
4. Click **Save as Variant** to create new version
   - Creates candidate version (not active)
   - Preserves original version
   - New version available in dropdown

### Session Sharing
1. Click **Link** button (🔗)
2. URL copied to clipboard: `/agents/{agentId}/playground?session={sessionId}`
3. Share URL with team members
4. Recipients see full conversation history

### Error Handling
The playground handles recoverable errors gracefully:

| Error Type | Behavior | User Action |
|------------|----------|-------------|
| **Rate limit** | Shows error, keeps session | Wait and retry |
| **Timeout** | Shows error, keeps session | Retry with simpler request |
| **Recursion limit** | Shows error, keeps session | Provide more guidance |
| **Tool error** | Shows error, keeps session | Continue conversation |
| **Context overflow** | Shows error, keeps session | Start new session |

**Fatal errors** (network, auth) require page refresh.

### Tool Execution Details
Expand tool calls to see:
```
🔧 execute_python
   Args: {"code": "print('hello')", "timeout": 5000}
   Result: {"stdout": "hello\n", "stderr": "", "exit_code": 0}
   ✓ 234ms
```

States:
- **Pending**: Tool call received, not yet executing
- **Executing**: Running (shows spinner)
- **Completed**: Success (shows checkmark)
- **Error**: Failed (shows error icon + message)

## API Access (Programmatic)

For automation or integration testing:

### POST `/api/agents/{agentId}/playground/chat`

**Headers:**
```
Content-Type: application/json
X-Workspace-Id: workspace_default
```

**Request Body:**
```json
{
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "sessionId": "sess_abc123",  // Optional: resume session
  "modelProvider": "anthropic", // Optional: override model
  "modelId": "anthropic/claude-sonnet-4-5",
  "variables": {                // Optional: template variables
    "customer_name": "John"
  }
}
```

**Response:** SSE stream with events:
- `message-start`: New message beginning
- `text-delta`: Streaming text chunks
- `tool-call-start`: Tool invocation started
- `tool-call-args`: Tool arguments (JSON)
- `tool-result`: Tool execution result
- `message-end`: Message complete
- `session-info`: Session ID and trace ID
- `error` / `recoverable-error`: Error events

### GET `/api/agents/{agentId}/playground/sessions/{sessionId}`

Retrieve full session data:
```json
{
  "id": "sess_abc123",
  "agentId": "agent_xyz",
  "messages": [...],
  "variables": {"customer_name": "John"},
  "modelProvider": "anthropic",
  "modelId": "anthropic/claude-sonnet-4-5",
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:05:00Z"
}
```

### GET `/api/agents/{agentId}/playground/sessions`

List sessions with pagination:
```
?limit=50&offset=0
```

Returns:
```json
{
  "sessions": [
    {
      "id": "sess_abc123",
      "messageCount": 6,
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-15T10:05:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

### DELETE `/api/agents/{agentId}/playground/sessions/{sessionId}`

Delete a session. Returns `204 No Content` on success.

## Technical Architecture

### Backend Stack
- **Framework**: LangGraph + DeepAgents library
- **Streaming**: Server-Sent Events (SSE) via AI SDK Stream Protocol v1
- **Storage**: Cloudflare D1 (SQLite)
- **Tool Registry**: Dynamic tool loading from `tools` table
- **Tracing**: D1TraceCollector captures spans for feedback

### Key Files
| Component | Path |
|-----------|------|
| API routes | `/src/api/playground.ts` |
| Agent orchestration | `/src/playground/agent-deepagents.ts` |
| Frontend UI | `/frontend/app/(main)/agents/[id]/playground/page.tsx` |
| React hook | `/frontend/hooks/use-playground-chat.ts` |
| Model config | `/src/ai/gateway.ts` |

### Data Flow
```
User Input
  ↓
Frontend (React + SSE EventSource)
  ↓
Backend API (/api/agents/:id/playground/chat)
  ↓
createPlaygroundDeepAgent()
  ↓
LangGraph ReactAgent (streaming)
  ↓
Tool Registry → Execute Tools
  ↓
D1TraceCollector → Store traces
  ↓
SSE Events → Frontend
  ↓
UI updates (text-delta, tool-result, etc.)
```

### Session Schema
```sql
CREATE TABLE playground_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_version_id TEXT NOT NULL,
  messages TEXT NOT NULL,  -- JSON array
  variables TEXT NOT NULL, -- JSON object
  files TEXT NOT NULL,     -- JSON object (future)
  model_provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## Best Practices

### Testing Agents
1. **Start simple**: Test basic capabilities first
2. **Iterate variables**: Adjust system prompt variables to refine behavior
3. **Check tool calls**: Verify tools execute with correct arguments
4. **Test edge cases**: Try invalid inputs, long prompts, rapid messages
5. **Leave feedback**: Rate responses to help train evals

### Creating Variants
- **Edit in playground** to prototype prompt changes
- **Save as variant** to preserve experiments
- **Compare versions** by switching dropdown
- **Promote to active** via Agents page when ready

### Debugging
- **Expand tool calls** to see execution details
- **Check latency** for performance bottlenecks
- **Review errors** for tool configuration issues
- **Share session URLs** with team for collaboration

## Troubleshooting

### "Agent not found or has no active version"
- Agent must have at least one version marked active
- Check agent configuration on Agents page

### "Session not found"
- Session may have been deleted
- Start new session with "New" button

### Tools not executing
- Check agent has tools configured in agent_tools table
- Verify tool implementation in `tools` registry
- Review tool permissions and sandboxing

### Streaming stops mid-response
- Check network connection
- Review browser console for errors
- Try "Retry" button on error message

### Model not available
- Verify model ID matches available models
- Check Cloudflare AI Gateway configuration
- Confirm API keys configured in dashboard

## Feedback Integration

Feedback submitted in playground:
1. **Stored** in `feedback` table with `trace_id`
2. **Associated** with trace in `traces` table
3. **Used** for eval generation (positive = expected, negative = failure case)
4. **Reviewed** on Review page for label editing

Flow:
```
User rates message (👍/👎)
  ↓
POST /api/feedback { trace_id, rating, notes }
  ↓
Stored in feedback table
  ↓
Visible on Review page
  ↓
Used by eval generation
```

## Limits & Quotas

| Resource | Limit | Notes |
|----------|-------|-------|
| **Message length** | ~100K chars | Model context limits apply |
| **Tool calls per turn** | 25 | Recursion limit = 50 steps |
| **Session history** | Unlimited | Stored in D1 |
| **Concurrent requests** | 1 per client | Stop previous to start new |
| **SSE timeout** | 5 minutes | Cloudflare Worker limit |

## Future Enhancements

Planned features:
- **File uploads**: Attach documents for context
- **Multi-turn planning**: Visualize agent reasoning steps
- **Performance metrics**: Token usage, cost tracking
- **Batch testing**: Run multiple inputs automatically
- **Prompt diffing**: Compare version changes visually

---

**Need help?** Check `/docs/testing-guide.md` for E2E testing or `/docs/MODULE_OVERVIEW.md` for architecture details.
