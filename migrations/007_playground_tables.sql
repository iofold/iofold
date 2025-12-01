-- Migration 007: Add playground tables for Agents Playground feature
-- Created: 2025-12-01
-- Description: Adds playground_sessions and playground_steps tables for real LLM agent interactions

-- ============================================================================
-- Step 1: Create playground_sessions table
-- ============================================================================

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

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_version_id) REFERENCES agent_versions(id) ON DELETE CASCADE,
  CHECK(model_provider IN ('anthropic', 'openai', 'google'))
);

-- ============================================================================
-- Step 2: Create playground_steps table
-- ============================================================================

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

  FOREIGN KEY (session_id) REFERENCES playground_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE,
  CHECK(step_type IN ('llm_call', 'tool_call', 'tool_result'))
);

-- ============================================================================
-- Step 3: Create indexes
-- ============================================================================

CREATE INDEX idx_playground_sessions_workspace ON playground_sessions(workspace_id);
CREATE INDEX idx_playground_sessions_agent ON playground_sessions(agent_id);
CREATE INDEX idx_playground_sessions_agent_version ON playground_sessions(agent_version_id);
CREATE INDEX idx_playground_sessions_updated ON playground_sessions(updated_at DESC);

CREATE INDEX idx_playground_steps_session ON playground_steps(session_id);
CREATE INDEX idx_playground_steps_trace ON playground_steps(trace_id);
CREATE INDEX idx_playground_steps_session_index ON playground_steps(session_id, step_index);
CREATE INDEX idx_playground_steps_timestamp ON playground_steps(timestamp DESC);
