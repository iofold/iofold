# Tool Registry Documentation

**Last Updated:** 2025-12-10

## Overview

The Tool Registry is a database-driven system for managing tools that agents can use in the iofold.com playground. It provides a flexible, extensible architecture that allows different agents to have different tool sets, enabling specialized agent configurations for various use cases.

**Key Features:**
- Database-driven tool configuration (D1)
- Support for built-in and future user-defined tools
- Per-agent tool customization via pivot table
- LangChain-compatible tool generation
- Graceful fallback to default tools for backward compatibility
- Category-based organization (code, filesystem, email, general)

**Architecture:**
```
┌─────────────┐
│   Agent     │
│  (agents)   │
└──────┬──────┘
       │
       │ many-to-many
       │
┌──────▼──────────┐       ┌─────────────────┐
│  agent_tools    │──────>│     tools       │
│  (pivot table)  │       │  (registry)     │
└─────────────────┘       └────────┬────────┘
                                   │
                                   │ handler_key
                                   │
                         ┌─────────▼──────────┐
                         │  Tool Handlers     │
                         │  (TypeScript)      │
                         │  - execute_python  │
                         │  - read_file       │
                         │  - write_file      │
                         │  - list_files      │
                         │  - email_search    │
                         │  - email_get       │
                         └────────────────────┘
```

## Database Schema

### 1. `tools` Table

Defines all available tools with their schemas and metadata.

**Columns:**
- `id` (TEXT, PRIMARY KEY) - Unique tool identifier (e.g., 'email_search', 'execute_python')
- `name` (TEXT, NOT NULL) - Human-readable name (e.g., 'Search Emails', 'Execute Python')
- `description` (TEXT, NOT NULL) - LLM-facing description for tool selection
- `parameters_schema` (TEXT, NOT NULL) - JSON Schema for parameter validation
- `handler_key` (TEXT, NOT NULL) - Maps to TypeScript handler function
- `category` (TEXT, DEFAULT 'general') - Tool category: 'email', 'code', 'filesystem', 'general'
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Creation timestamp

**Indexes:**
- `idx_tools_category` on `category`
- `idx_tools_handler` on `handler_key`

**Example Row:**
```sql
INSERT INTO tools VALUES (
  'email_search',
  'Search Emails',
  'Search for emails in an inbox using a full-text query...',
  '{"type": "object", "properties": {...}, "required": [...]}',
  'email_search',
  'email',
  '2025-12-10 10:00:00'
);
```

### 2. `agent_tools` Table

Many-to-many pivot table linking agents to their tools.

**Columns:**
- `agent_id` (TEXT, NOT NULL, FK to agents.id) - Agent identifier
- `tool_id` (TEXT, NOT NULL, FK to tools.id) - Tool identifier
- `config` (TEXT, NULLABLE) - Tool-specific configuration JSON (optional)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP) - Association timestamp

**Primary Key:** `(agent_id, tool_id)`

**Foreign Keys:**
- `agent_id` references `agents(id)` ON DELETE CASCADE
- `tool_id` references `tools(id)` ON DELETE CASCADE

**Indexes:**
- `idx_agent_tools_agent` on `agent_id`
- `idx_agent_tools_tool` on `tool_id`

**Example Row:**
```sql
INSERT INTO agent_tools VALUES (
  'agent_abc123',
  'email_search',
  '{"default_limit": 20}',
  '2025-12-10 10:05:00'
);
```

## Built-in Tools

The system includes 6 pre-configured tools covering code execution, filesystem operations, and email search.

### 1. Execute Python (`execute_python`)

Execute Python code in a secure sandboxed environment.

**Category:** `code`

**Parameters:**
- `code` (string, required) - The Python code to execute

**Limits:**
- 5 second timeout
- 50MB memory limit
- Whitelisted imports only: `json`, `re`, `typing`
- No network/file I/O/subprocess access

**Example Usage:**
```json
{
  "code": "import json\ndata = {'result': 42}\nprint(json.dumps(data))"
}
```

**Returns:** Stdout/stderr output as string, or error message if execution fails

**Handler:** `executePythonHandler` in `/home/ygupta/workspace/iofold/src/playground/tools/registry.ts`

---

### 2. Read File (`read_file`)

Read contents from the virtual filesystem.

**Category:** `filesystem`

**Parameters:**
- `path` (string, required) - File path relative to virtual filesystem root

**Example Usage:**
```json
{
  "path": "/data/report.txt"
}
```

**Returns:** File contents as string, or error message if file not found

**Handler:** `readFileHandler` in `/home/ygupta/workspace/iofold/src/playground/tools/registry.ts`

**Backend:** Uses `D1Backend` from `/home/ygupta/workspace/iofold/src/playground/backend/d1-backend.ts`

---

### 3. Write File (`write_file`)

Write content to a file in the virtual filesystem.

**Category:** `filesystem`

**Parameters:**
- `path` (string, required) - File path relative to virtual filesystem root
- `content` (string, required) - Content to write

**Example Usage:**
```json
{
  "path": "/output/results.json",
  "content": "{\"score\": 95}"
}
```

**Returns:** Success message with file path, or error message

**Handler:** `writeFileHandler` in `/home/ygupta/workspace/iofold/src/playground/tools/registry.ts`

**Backend:** Uses `D1Backend` from `/home/ygupta/workspace/iofold/src/playground/backend/d1-backend.ts`

---

### 4. List Files (`list_files`)

List files and directories in the virtual filesystem.

**Category:** `filesystem`

**Parameters:**
- `path` (string, optional, default: "/") - Directory path to list

**Example Usage:**
```json
{
  "path": "/data"
}
```

**Returns:** Formatted list of files and directories with sizes, or error message

**Example Output:**
```
Contents of /data:
[DIR]  /data/inputs
[FILE] /data/report.txt (1024 bytes)
[FILE] /data/config.json (256 bytes)
```

**Handler:** `listFilesHandler` in `/home/ygupta/workspace/iofold/src/playground/tools/registry.ts`

---

### 5. Search Emails (`email_search`)

Search emails using full-text search against the Enron email dataset.

**Category:** `email`

**Parameters:**
- `query` (string, required) - Search query to match against subjects and bodies
- `inbox_id` (string, required) - Email address/inbox to search within (e.g., 'john.arnold@enron.com')
- `limit` (integer, optional, default: 10, max: 50) - Maximum number of results

**Example Usage:**
```json
{
  "query": "meeting schedule",
  "inbox_id": "john.arnold@enron.com",
  "limit": 10
}
```

**Returns:** JSON array of matching emails with snippets

**Example Output:**
```json
{
  "emails": [
    {
      "message_id": "<1234567890@enron.com>",
      "subject": "Weekly meeting schedule",
      "sender": "jane.doe@enron.com",
      "date": "2001-05-15T10:30:00Z",
      "snippet": "Subject: Weekly <mark>meeting schedule</mark> | Body: Please review the <mark>meeting</mark> times..."
    }
  ],
  "total": 1
}
```

**Requirements:**
- `BENCHMARKS_DB` binding must be configured in wrangler.toml
- Enron email dataset must be imported (see `/home/ygupta/workspace/iofold/scripts/import-enron.ts`)

**Handler:** `emailSearchHandler` in `/home/ygupta/workspace/iofold/src/playground/tools/registry.ts`
**Implementation:** `emailSearchHandlerImpl` in `/home/ygupta/workspace/iofold/src/playground/tools/email.ts`

---

### 6. Get Email (`email_get`)

Retrieve the full content of a specific email by message ID.

**Category:** `email`

**Parameters:**
- `message_id` (string, required) - Unique message ID from search results

**Example Usage:**
```json
{
  "message_id": "<1234567890@enron.com>"
}
```

**Returns:** JSON object with complete email details

**Example Output:**
```json
{
  "message_id": "<1234567890@enron.com>",
  "inbox": "john.arnold@enron.com",
  "subject": "Weekly meeting schedule",
  "sender": "jane.doe@enron.com",
  "recipients": ["john.arnold@enron.com", "team@enron.com"],
  "date": "2001-05-15T10:30:00Z",
  "body": "Hi John,\n\nPlease review the meeting schedule for next week..."
}
```

**Requirements:**
- `BENCHMARKS_DB` binding must be configured
- Enron email dataset must be imported

**Handler:** `emailGetHandler` in `/home/ygupta/workspace/iofold/src/playground/tools/registry.ts`
**Implementation:** `emailGetHandlerImpl` in `/home/ygupta/workspace/iofold/src/playground/tools/email.ts`

## API Endpoints

All endpoints require the `X-Workspace-Id` header for workspace isolation.

### 1. List All Tools

Get all available tools in the registry.

**Endpoint:** `GET /api/tools`

**Query Parameters:**
- `category` (optional) - Filter by category: 'code', 'filesystem', 'email', 'general'

**Request:**
```bash
curl -X GET https://iofold.com/api/tools?category=email \
  -H "X-Workspace-Id: ws_abc123"
```

**Response:** `200 OK`
```json
{
  "tools": [
    {
      "id": "email_search",
      "name": "Search Emails",
      "description": "Search for emails in an inbox using a full-text query...",
      "parameters_schema": "{...}",
      "handler_key": "email_search",
      "category": "email",
      "created_at": "2025-12-10T10:00:00Z"
    },
    {
      "id": "email_get",
      "name": "Get Email",
      "description": "Retrieve the full content of a specific email...",
      "parameters_schema": "{...}",
      "handler_key": "email_get",
      "category": "email",
      "created_at": "2025-12-10T10:00:00Z"
    }
  ]
}
```

**Implementation:** `listTools()` in `/home/ygupta/workspace/iofold/src/api/tools.ts`

---

### 2. Get Tool by ID

Get details of a specific tool.

**Endpoint:** `GET /api/tools/:id`

**Request:**
```bash
curl -X GET https://iofold.com/api/tools/email_search \
  -H "X-Workspace-Id: ws_abc123"
```

**Response:** `200 OK`
```json
{
  "id": "email_search",
  "name": "Search Emails",
  "description": "Search for emails in an inbox using a full-text query...",
  "parameters_schema": "{\"type\": \"object\", \"properties\": {...}}",
  "handler_key": "email_search",
  "category": "email",
  "created_at": "2025-12-10T10:00:00Z"
}
```

**Error Responses:**
- `404 NOT_FOUND` - Tool not found

**Implementation:** `getToolById()` in `/home/ygupta/workspace/iofold/src/api/tools.ts`

---

### 3. Get Agent Tools

Get all tools attached to a specific agent.

**Endpoint:** `GET /api/agents/:agentId/tools`

**Request:**
```bash
curl -X GET https://iofold.com/api/agents/agent_abc123/tools \
  -H "X-Workspace-Id: ws_abc123"
```

**Response:** `200 OK`
```json
{
  "tools": [
    {
      "id": "email_search",
      "name": "Search Emails",
      "description": "Search for emails in an inbox...",
      "parameters_schema": "{...}",
      "handler_key": "email_search",
      "category": "email",
      "created_at": "2025-12-10T10:00:00Z",
      "config": {
        "default_limit": 20
      }
    }
  ]
}
```

**Error Responses:**
- `404 NOT_FOUND` - Agent not found or not in workspace

**Implementation:** `getAgentTools()` in `/home/ygupta/workspace/iofold/src/api/tools.ts`

---

### 4. Attach Tool to Agent

Attach a tool to an agent with optional configuration.

**Endpoint:** `POST /api/agents/:agentId/tools`

**Request Body:**
```json
{
  "tool_id": "email_search",
  "config": {
    "default_limit": 20
  }
}
```

**Request:**
```bash
curl -X POST https://iofold.com/api/agents/agent_abc123/tools \
  -H "X-Workspace-Id: ws_abc123" \
  -H "Content-Type: application/json" \
  -d '{"tool_id": "email_search", "config": {"default_limit": 20}}'
```

**Response:** `201 Created`
```json
{
  "id": "email_search",
  "name": "Search Emails",
  "description": "Search for emails in an inbox...",
  "parameters_schema": "{...}",
  "handler_key": "email_search",
  "category": "email",
  "created_at": "2025-12-10T10:00:00Z",
  "config": {
    "default_limit": 20
  }
}
```

**Error Responses:**
- `400 VALIDATION_ERROR` - Missing or invalid tool_id
- `404 NOT_FOUND` - Agent or tool not found
- `409 ALREADY_EXISTS` - Tool already attached to agent

**Implementation:** `attachToolToAgent()` in `/home/ygupta/workspace/iofold/src/api/tools.ts`

---

### 5. Detach Tool from Agent

Remove a tool from an agent.

**Endpoint:** `DELETE /api/agents/:agentId/tools/:toolId`

**Request:**
```bash
curl -X DELETE https://iofold.com/api/agents/agent_abc123/tools/email_search \
  -H "X-Workspace-Id: ws_abc123"
```

**Response:** `204 No Content`

**Error Responses:**
- `404 NOT_FOUND` - Agent not found, or tool not attached to agent

**Implementation:** `detachToolFromAgent()` in `/home/ygupta/workspace/iofold/src/api/tools.ts`

## Adding New Tools

To add a new tool to the registry, follow these steps:

### Step 1: Implement the Handler

Add a new handler function to `/home/ygupta/workspace/iofold/src/playground/tools/registry.ts`:

```typescript
/**
 * Example: Web search tool
 */
async function webSearchHandler(params: unknown, context: ToolContext): Promise<string> {
  const { query, limit = 10 } = params as { query: string; limit?: number };

  if (!query || typeof query !== 'string') {
    return 'Error: Invalid query parameter';
  }

  try {
    // Implementation here
    const results = await performWebSearch(query, limit);
    return JSON.stringify(results, null, 2);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: ${errorMessage}`;
  }
}
```

### Step 2: Register the Handler

Add the handler to the `TOOL_HANDLERS` registry:

```typescript
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  'execute_python': executePythonHandler,
  'read_file': readFileHandler,
  'write_file': writeFileHandler,
  'list_files': listFilesHandler,
  'email_search': emailSearchHandler,
  'email_get': emailGetHandler,
  'web_search': webSearchHandler, // Add new handler
};
```

### Step 3: Add Seed Data

Insert the tool definition into the database via migration or SQL:

```sql
INSERT INTO tools (id, name, description, parameters_schema, handler_key, category) VALUES (
  'web_search',
  'Web Search',
  'Search the web for information using a search engine. Returns a list of relevant web pages with titles, URLs, and snippets.',
  '{
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query"
      },
      "limit": {
        "type": "integer",
        "description": "Maximum number of results (default: 10, max: 50)",
        "default": 10,
        "minimum": 1,
        "maximum": 50
      }
    },
    "required": ["query"],
    "additionalProperties": false
  }',
  'web_search',
  'general'
);
```

### Step 4: Test the Tool

Test the new tool by attaching it to an agent:

```bash
# Attach tool to agent
curl -X POST https://iofold.com/api/agents/agent_abc123/tools \
  -H "X-Workspace-Id: ws_abc123" \
  -H "Content-Type: application/json" \
  -d '{"tool_id": "web_search"}'

# Test in playground
curl -X POST https://iofold.com/api/playground/sessions/sess_123/chat \
  -H "X-Workspace-Id: ws_abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Search the web for information about Claude AI",
    "agentId": "agent_abc123"
  }'
```

### Best Practices

1. **Error Handling:** Always return descriptive error messages as strings
2. **Validation:** Validate all input parameters before processing
3. **Type Safety:** Use TypeScript interfaces for parameter types
4. **Documentation:** Add JSDoc comments explaining parameters and return values
5. **JSON Schema:** Keep parameter schemas simple and well-documented
6. **Context Usage:** Only use context properties that are guaranteed to be available
7. **Security:** Never execute untrusted code or access sensitive resources without validation

## Email Tools Deep Dive

The email tools (`email_search` and `email_get`) are designed for the ART-E benchmark and require special setup.

### Database Configuration

**Binding:** `BENCHMARKS_DB`

The email tools require a separate D1 database binding for the Enron email dataset.

**wrangler.toml:**
```toml
[[d1_databases]]
binding = "BENCHMARKS_DB"
database_name = "iofold-benchmarks"
database_id = "your-benchmark-database-id"
```

### Database Schema

The Enron email database requires two components:

1. **`emails` table:**
```sql
CREATE TABLE emails (
  message_id TEXT PRIMARY KEY,
  inbox TEXT NOT NULL,
  subject TEXT,
  sender TEXT,
  recipients TEXT, -- JSON array
  date TEXT,
  body TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_emails_inbox ON emails(inbox);
CREATE INDEX idx_emails_date ON emails(date);
```

2. **`emails_fts` FTS5 table:**
```sql
CREATE VIRTUAL TABLE emails_fts USING fts5(
  subject,
  body,
  content='emails',
  content_rowid='rowid'
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER emails_ai AFTER INSERT ON emails BEGIN
  INSERT INTO emails_fts(rowid, subject, body)
  VALUES (new.rowid, new.subject, new.body);
END;

CREATE TRIGGER emails_ad AFTER DELETE ON emails BEGIN
  INSERT INTO emails_fts(emails_fts, rowid, subject, body)
  VALUES('delete', old.rowid, old.subject, old.body);
END;

CREATE TRIGGER emails_au AFTER UPDATE ON emails BEGIN
  INSERT INTO emails_fts(emails_fts, rowid, subject, body)
  VALUES('delete', old.rowid, old.subject, old.body);
  INSERT INTO emails_fts(rowid, subject, body)
  VALUES (new.rowid, new.subject, new.body);
END;
```

### Importing the Enron Dataset

Use the provided import script:

```bash
# Install dependencies
pnpm install

# Run import script
pnpm tsx scripts/import-enron.ts
```

The script downloads the Enron email dataset from Hugging Face and imports it into the `BENCHMARKS_DB` D1 database.

**Script Location:** `/home/ygupta/workspace/iofold/scripts/import-enron.ts`

### Search Implementation Details

**Full-Text Search (FTS5):**
- Uses SQLite FTS5 for efficient text search
- Searches across both subject and body fields
- Returns ranked results using `rank` function
- Generates highlighted snippets with `<mark>` tags

**Snippet Function:**
```sql
snippet(emails_fts, column_index, '<mark>', '</mark>', '...', length)
```

**Example Query:**
```sql
SELECT
  e.message_id,
  e.subject,
  e.sender,
  e.date,
  snippet(emails_fts, 0, '<mark>', '</mark>', '...', 32) as subject_snippet,
  snippet(emails_fts, 1, '<mark>', '</mark>', '...', 64) as body_snippet
FROM emails_fts
INNER JOIN emails e ON emails_fts.rowid = e.rowid
WHERE emails_fts MATCH 'meeting schedule'
  AND e.inbox = 'john.arnold@enron.com'
ORDER BY rank
LIMIT 10
```

### Typical Workflow

1. **Search for emails:**
```json
{
  "query": "quarterly report",
  "inbox_id": "kenneth.lay@enron.com",
  "limit": 5
}
```

2. **Review search results with snippets:**
```json
{
  "emails": [
    {
      "message_id": "<msg123@enron.com>",
      "subject": "Q3 Quarterly Report",
      "snippet": "Subject: Q3 <mark>Quarterly Report</mark> | Body: Please find attached..."
    }
  ]
}
```

3. **Get full email content:**
```json
{
  "message_id": "<msg123@enron.com>"
}
```

4. **Process full email:**
```json
{
  "message_id": "<msg123@enron.com>",
  "subject": "Q3 Quarterly Report",
  "body": "Dear Team,\n\nPlease find attached the Q3 quarterly report...",
  "sender": "jane.doe@enron.com",
  "recipients": ["kenneth.lay@enron.com"]
}
```

### Performance Considerations

- **FTS5 Index:** Significantly faster than LIKE queries for text search
- **Inbox Filtering:** Always filter by inbox to reduce result set
- **Limit Results:** Default limit of 10-20 results is recommended
- **Snippet Length:** Balanced snippet lengths (32/64 chars) for context vs. size

### Error Handling

**Common errors:**
- `BENCHMARKS_DB binding not configured` - wrangler.toml missing binding
- `Email not found: <message_id>` - Invalid or non-existent message ID
- `Database query failed` - FTS5 syntax error or missing index

## Migration Reference

**File:** `/home/ygupta/workspace/iofold/migrations/014_tool_registry.sql`

The migration creates the tool registry tables and seeds all 6 built-in tools.

**Steps:**
1. Create `tools` table with columns and constraints
2. Create `agent_tools` pivot table with foreign keys
3. Create indexes for performance
4. Insert seed data for all built-in tools

**To apply migration:**
```bash
# Local development
pnpm wrangler d1 migrations apply iofold-db --local

# Production
pnpm wrangler d1 migrations apply iofold-db
```

## Architecture Files

**Core Implementation:**
- `/home/ygupta/workspace/iofold/src/playground/tools/registry.ts` - Handler registry and tool builder
- `/home/ygupta/workspace/iofold/src/playground/tools/email.ts` - Email tool implementations
- `/home/ygupta/workspace/iofold/src/api/tools.ts` - REST API endpoints
- `/home/ygupta/workspace/iofold/src/playground/agent-deepagents.ts` - Agent integration

**Database:**
- `/home/ygupta/workspace/iofold/migrations/014_tool_registry.sql` - Schema and seed data

**Supporting Files:**
- `/home/ygupta/workspace/iofold/src/playground/backend/d1-backend.ts` - Virtual filesystem
- `/home/ygupta/workspace/iofold/src/sandbox/python-runner.ts` - Python sandbox

## Related Documentation

- **Design Document:** `/home/ygupta/workspace/iofold/docs/plans/2025-12-10-tool-registry-art-e-design.md`
- **Implementation Notes:** `/home/ygupta/workspace/iofold/docs/tool-registry-stream-4-implementation.md`
- **Main Project Docs:** `/home/ygupta/workspace/iofold/docs/2025-11-05-iofold-auto-evals-design.md`
