-- Migration 014: Tool Registry for Agent Tools
-- Created: 2025-12-10
-- Description: Adds tool registry tables for managing agent tools and configurations.
--              Enables agents to have different tool sets and supports both built-in
--              and future user-defined tools. Includes seed data for built-in tools.

-- ============================================================================
-- Step 1: Create tools table
-- ============================================================================

-- Tools registry - defines available tools with their schemas
-- Contains both built-in tools (code in codebase) and future user-defined tools
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,                    -- 'email_search', 'execute_python'
  name TEXT NOT NULL,                     -- Human-readable name: 'Search Emails'
  description TEXT NOT NULL,              -- LLM-facing description for tool selection
  parameters_schema TEXT NOT NULL,        -- JSON Schema for Zod validation
  handler_key TEXT NOT NULL,              -- Maps to TypeScript handler function
  category TEXT DEFAULT 'general',        -- 'email', 'code', 'filesystem', 'general'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  CHECK(category IN ('general', 'code', 'filesystem', 'email'))
);

-- ============================================================================
-- Step 2: Create agent_tools pivot table
-- ============================================================================

-- Agent tools - many-to-many relationship between agents and tools
-- Allows different agents to have different tool sets with custom configs
CREATE TABLE IF NOT EXISTS agent_tools (
  agent_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  config TEXT,                            -- Tool-specific config JSON (optional)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (agent_id, tool_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE
);

-- ============================================================================
-- Step 3: Create indexes
-- ============================================================================

-- Tools indexes
CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);
CREATE INDEX IF NOT EXISTS idx_tools_handler ON tools(handler_key);

-- Agent tools indexes
CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_tool ON agent_tools(tool_id);

-- ============================================================================
-- Step 4: Seed built-in tools
-- ============================================================================

-- Python code execution tool
INSERT INTO tools (id, name, description, parameters_schema, handler_key, category) VALUES (
  'execute_python',
  'Execute Python',
  'Execute Python code in a sandboxed environment. Use this to perform calculations, data processing, or implement complex logic. Returns the stdout/stderr and any raised exceptions.',
  '{
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "The Python code to execute"
      }
    },
    "required": ["code"],
    "additionalProperties": false
  }',
  'execute_python',
  'code'
);

-- Read file from virtual filesystem
INSERT INTO tools (id, name, description, parameters_schema, handler_key, category) VALUES (
  'read_file',
  'Read File',
  'Read contents of a file from the virtual filesystem. Returns the file contents as a string. Use this to access files that have been created or uploaded during the session.',
  '{
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "The file path to read (relative to virtual filesystem root)"
      }
    },
    "required": ["path"],
    "additionalProperties": false
  }',
  'read_file',
  'filesystem'
);

-- Write file to virtual filesystem
INSERT INTO tools (id, name, description, parameters_schema, handler_key, category) VALUES (
  'write_file',
  'Write File',
  'Write content to a file in the virtual filesystem. Creates the file if it does not exist, or overwrites it if it does. Returns success status.',
  '{
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "The file path to write (relative to virtual filesystem root)"
      },
      "content": {
        "type": "string",
        "description": "The content to write to the file"
      }
    },
    "required": ["path", "content"],
    "additionalProperties": false
  }',
  'write_file',
  'filesystem'
);

-- List files in virtual filesystem directory
INSERT INTO tools (id, name, description, parameters_schema, handler_key, category) VALUES (
  'list_files',
  'List Files',
  'List all files in a directory of the virtual filesystem. Returns an array of file paths. Use this to explore what files are available.',
  '{
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "The directory path to list (relative to virtual filesystem root)",
        "default": "/"
      }
    },
    "additionalProperties": false
  }',
  'list_files',
  'filesystem'
);

-- Email search tool for ART-E benchmark
INSERT INTO tools (id, name, description, parameters_schema, handler_key, category) VALUES (
  'email_search',
  'Search Emails',
  'Search for emails in an inbox using a full-text query. Returns a list of matching emails with message IDs, subjects, senders, dates, and content snippets. Use this to find relevant emails before retrieving their full content.',
  '{
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query to match against email subjects and bodies"
      },
      "inbox_id": {
        "type": "string",
        "description": "The email address/inbox to search within"
      },
      "limit": {
        "type": "integer",
        "description": "Maximum number of results to return (default: 10, max: 50)",
        "default": 10,
        "minimum": 1,
        "maximum": 50
      }
    },
    "required": ["query", "inbox_id"],
    "additionalProperties": false
  }',
  'email_search',
  'email'
);

-- Email retrieval tool for ART-E benchmark
INSERT INTO tools (id, name, description, parameters_schema, handler_key, category) VALUES (
  'email_get',
  'Get Email',
  'Retrieve the full content of a specific email by its message ID. Returns the complete email including subject, sender, recipients, date, and full body text. Use this after searching to get details of specific emails.',
  '{
    "type": "object",
    "properties": {
      "message_id": {
        "type": "string",
        "description": "The unique message ID of the email to retrieve"
      }
    },
    "required": ["message_id"],
    "additionalProperties": false
  }',
  'email_get',
  'email'
);
