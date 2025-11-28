-- migrations/005_agent_management.sql
-- Agent Management Schema Migration

-- ============================================================================
-- New Tables
-- ============================================================================

-- Agents table - discovered agent groupings
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'discovered' CHECK(status IN ('discovered', 'confirmed', 'archived')),
  active_version_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Agent versions - immutable prompt versions
CREATE TABLE agent_versions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  prompt_template TEXT NOT NULL,
  variables TEXT,
  source TEXT NOT NULL CHECK(source IN ('discovered', 'manual', 'ai_improved')),
  parent_version_id TEXT,
  accuracy REAL,
  status TEXT DEFAULT 'candidate' CHECK(status IN ('candidate', 'active', 'rejected', 'archived')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE(agent_id, version)
);

-- Functions table - unified AI-generated code storage
CREATE TABLE functions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('template_extractor', 'template_injector', 'eval')),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  input_schema TEXT,
  output_schema TEXT,
  model_used TEXT,
  parent_function_id TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Agent functions - links agents to their functions
CREATE TABLE agent_functions (
  agent_id TEXT NOT NULL,
  function_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('extractor', 'injector')),
  PRIMARY KEY (agent_id, role),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (function_id) REFERENCES functions(id) ON DELETE CASCADE
);

-- Prompt best practices - reference material for meta-prompt agent
CREATE TABLE prompt_best_practices (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('openai', 'anthropic', 'google')),
  category TEXT NOT NULL CHECK(category IN ('structure', 'clarity', 'safety', 'reasoning', 'general')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Modify Existing Tables
-- ============================================================================

-- Add agent_id, agent_version_id and assignment_status to traces
ALTER TABLE traces ADD COLUMN agent_id TEXT REFERENCES agents(id);
ALTER TABLE traces ADD COLUMN agent_version_id TEXT REFERENCES agent_versions(id);
ALTER TABLE traces ADD COLUMN assignment_status TEXT DEFAULT 'unassigned'
  CHECK(assignment_status IN ('unassigned', 'assigned', 'orphaned'));

-- ============================================================================
-- New Indexes
-- ============================================================================

CREATE INDEX idx_agents_workspace_id ON agents(workspace_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agent_versions_agent_id ON agent_versions(agent_id);
CREATE INDEX idx_agent_versions_status ON agent_versions(status);
CREATE INDEX idx_functions_workspace_id ON functions(workspace_id);
CREATE INDEX idx_functions_type ON functions(type);
CREATE INDEX idx_traces_agent_version_id ON traces(agent_version_id);
CREATE INDEX idx_traces_assignment_status ON traces(assignment_status);

-- ============================================================================
-- Extend Jobs Table
-- ============================================================================

ALTER TABLE jobs ADD COLUMN agent_id TEXT REFERENCES agents(id);
ALTER TABLE jobs ADD COLUMN agent_version_id TEXT REFERENCES agent_versions(id);
ALTER TABLE jobs ADD COLUMN trigger_event TEXT;
ALTER TABLE jobs ADD COLUMN trigger_threshold TEXT;
