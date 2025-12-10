# Tool Registry - Stream 4 Implementation

**Date:** 2025-12-10
**Status:** Completed

## Overview

This document describes the implementation of Stream 4 from the Tool Registry & ART-E Benchmark Integration design (see `docs/plans/2025-12-10-tool-registry-art-e-design.md`).

Stream 4 wires the tool registry into the playground agent creation, enabling agents to use different tool sets based on database configuration while maintaining full backward compatibility.

## Implementation Summary

### 1. Tool Registry (`src/playground/tools/registry.ts`)

Created the central registry that maps `handler_key` (from database) to actual implementation functions.

**Key components:**
- `ToolContext` interface - Context passed to all tool handlers (db, sessionId, sandbox, env, ENRON_DB)
- `ToolHandler` type - Function signature for tool implementations
- `ToolDefinition` interface - Tool metadata from database
- `TOOL_HANDLERS` - Central registry mapping handler keys to implementations
- `buildTool()` - Converts ToolDefinition + ToolContext into LangChain tool
- `buildTools()` - Builds multiple tools at once

**Built-in tool handlers:**
- `execute_python` - Execute Python code in sandbox
- `read_file` - Read from virtual filesystem
- `write_file` - Write to virtual filesystem
- `list_files` - List directory contents
- `email_search` - Search Enron emails (wraps existing email.ts implementation)
- `email_get` - Get full email by ID (wraps existing email.ts implementation)

**JSON Schema → Zod conversion:**
- Simplified implementation supporting common types (string, number, boolean, array, object)
- Handles required/optional fields
- Preserves field descriptions

### 2. Tool Loader (`src/playground/tools/loader.ts`)

High-level API for loading tools from database and building LangChain tools.

**Functions:**
- `loadAgentTools(db, agentId)` - Load tool IDs from `agent_tools` table for an agent
- `loadToolDefinitions(db, toolIds)` - Load tool definitions from `tools` table
- `buildToolsForAgent(db, agentId, context)` - Full pipeline: load IDs → load definitions → build tools
- `buildToolsByIds(db, toolIds, context)` - Build tools from explicit list of tool IDs

**Re-exports:**
- `ToolContext` type for external use

### 3. Agent Integration (`src/playground/agent-deepagents.ts`)

Updated `createPlaygroundDeepAgent` to support dynamic tool loading.

**New parameters in `DeepAgentConfig`:**
- `availableTools?: string[]` - Explicit list of tool IDs to load
- `agentId?: string` - Agent ID for loading tools from `agent_tools` table

**Tool loading strategy (priority order):**
1. If `availableTools` provided → Load those specific tools from registry
2. If `agentId` provided → Load tools configured in `agent_tools` table
3. Otherwise → Use default tools (execute_python) for backward compatibility

**Changed signature:**
- `createPlaygroundDeepAgent()` is now `async` (must be awaited)

**Helper function:**
- `addDefaultTools()` - Adds execute_python tools (cloudflare-execute and direct-execute)

### 4. API Integration (`src/api/playground.ts`)

Updated playground chat endpoint to support tool registry.

**Changes:**
- Added `await` before `createPlaygroundDeepAgent()` call
- Pass `agentId` parameter to enable tool lookup
- No changes to request/response format (transparent to clients)

## Backward Compatibility

**Existing agents continue to work without changes:**
- Agents without `agent_tools` configuration use default tools
- Default tools = execute_python (same as before)
- No database migration required for existing agents
- No API changes required for frontend

**Graceful degradation:**
- If tool registry DB queries fail → Fall back to defaults
- If no tools configured for agent → Fall back to defaults
- Missing tool handlers → Logged as error, agent creation continues

## Database Schema Requirements

**Note:** The database schema (Stream 1) is NOT yet implemented. The tool registry code is ready but will not load tools from database until:

1. Migration `014_tool_registry.sql` is created with:
   - `tools` table (id, name, description, parameters_schema, handler_key, category)
   - `agent_tools` table (agent_id, tool_id, config)
   - Appropriate indexes

2. Seed data is inserted with built-in tool definitions

**Current behavior without schema:**
- `loadAgentTools()` and `loadToolDefinitions()` will fail gracefully
- Agents fall back to default tools
- Console warnings logged for debugging

## Usage Examples

### Example 1: Agent with no tool configuration (backward compatible)

```typescript
const agent = await createPlaygroundDeepAgent({
  db: env.DB,
  sandbox: env.SANDBOX,
  sessionId: 'sess_123',
  systemPrompt: 'You are a helpful assistant',
  modelProvider: 'anthropic',
  modelId: 'anthropic/claude-sonnet-4-5',
  env: { /* ... */ },
  // No availableTools or agentId
});

// Result: Uses default execute_python tools
```

### Example 2: Agent with explicit tool list

```typescript
const agent = await createPlaygroundDeepAgent({
  db: env.DB,
  sandbox: env.SANDBOX,
  sessionId: 'sess_456',
  systemPrompt: 'You are an email search assistant',
  modelProvider: 'anthropic',
  modelId: 'anthropic/claude-sonnet-4-5',
  availableTools: ['email_search', 'email_get'],
  env: { /* ... */ },
  ENRON_DB: env.ENRON_DB, // Required for email tools
});

// Result: Uses only email_search and email_get tools
```

### Example 3: Agent loading from database (once schema exists)

```typescript
const agent = await createPlaygroundDeepAgent({
  db: env.DB,
  sandbox: env.SANDBOX,
  sessionId: 'sess_789',
  systemPrompt: 'You are a data analyst',
  modelProvider: 'anthropic',
  modelId: 'anthropic/claude-sonnet-4-5',
  agentId: 'agent_abc123', // Load tools from agent_tools table
  env: { /* ... */ },
});

// Result: Uses tools configured in agent_tools table for agent_abc123
// Falls back to defaults if no tools configured
```

## Testing

**Manual testing:**
1. Start dev server: `pnpm dev`
2. Create playground session via API
3. Send chat message
4. Verify agent uses default tools (execute_python)
5. Check console logs for tool loading messages

**TypeScript verification:**
```bash
pnpm tsc --noEmit
# Should show no errors in playground/tools/* or agent-deepagents.ts
```

## Next Steps

**Stream 1: Schema & Migration** (prerequisite for full functionality)
- Create `migrations/014_tool_registry.sql`
- Define `tools` and `agent_tools` tables
- Seed built-in tool definitions
- Run migration

**Stream 2: Tool Registry Backend** (optional, for tool management UI)
- Create `src/api/tools.ts` - CRUD endpoints
- List available tools
- Create/update/delete custom tools
- Assign tools to agents

**Stream 3: Email Tools Enhancement** (already implemented in email.ts)
- Email handlers already exist in `src/playground/tools/email.ts`
- Need ENRON_DB binding in wrangler.toml
- Need Enron dataset imported to D1

**Stream 5: ART-E Benchmark** (depends on email tools)
- Create benchmark runner
- Load HuggingFace dataset
- Run agents on Enron Q&A tasks
- Measure accuracy and generate traces

## Files Modified

- ✅ `src/playground/tools/registry.ts` (created)
- ✅ `src/playground/tools/loader.ts` (created)
- ✅ `src/playground/agent-deepagents.ts` (modified)
- ✅ `src/api/playground.ts` (modified)

## Files Referenced (not modified)

- `src/playground/tools/email.ts` - Email handler implementations
- `src/playground/tools/cloudflare-execute.ts` - Execute tool implementations
- `src/playground/backend/d1-backend.ts` - Virtual filesystem backend

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Playground Chat API                      │
│                   (src/api/playground.ts)                   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ await createPlaygroundDeepAgent({
                             │   agentId, availableTools, ...
                             │ })
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              createPlaygroundDeepAgent()                    │
│           (src/playground/agent-deepagents.ts)              │
│                                                             │
│  1. Check availableTools → buildToolsByIds()                │
│  2. Check agentId → buildToolsForAgent()                    │
│  3. Otherwise → addDefaultTools()                           │
└────────────────────────────┬────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
    ┌───────────────────┐     ┌──────────────────┐
    │  Tool Loader      │     │  Default Tools   │
    │  (loader.ts)      │     │  (execute_python)│
    └─────────┬─────────┘     └──────────────────┘
              │
              │ loadAgentTools(agentId)
              │ loadToolDefinitions(toolIds)
              ▼
    ┌───────────────────┐
    │   D1 Database     │
    │                   │
    │ ┌───────────────┐ │
    │ │     tools     │ │  (not yet created)
    │ └───────────────┘ │
    │ ┌───────────────┐ │
    │ │  agent_tools  │ │  (not yet created)
    │ └───────────────┘ │
    └─────────┬─────────┘
              │
              │ buildTools(definitions, context)
              ▼
    ┌───────────────────┐
    │  Tool Registry    │
    │  (registry.ts)    │
    │                   │
    │  TOOL_HANDLERS:   │
    │  - execute_python │
    │  - read_file      │
    │  - write_file     │
    │  - list_files     │
    │  - email_search   │
    │  - email_get      │
    └─────────┬─────────┘
              │
              │ buildTool(definition, context)
              ▼
    ┌───────────────────┐
    │  LangChain Tool   │
    │  (ready for use)  │
    └───────────────────┘
```

## Notes

- Email tools (email_search, email_get) are fully implemented but require ENRON_DB binding
- Tool registry supports future extensibility (user-defined tools, MCP tools, etc.)
- JSON Schema → Zod conversion is simplified but sufficient for built-in tools
- All tool handlers return strings (or JSON-stringified objects) for consistent LLM consumption
- ToolContext can be extended with additional bindings (R2, KV, etc.) as needed
