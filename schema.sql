-- User accounts and workspaces
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Platform integrations
CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'langfuse' | 'langsmith' | 'openai'
  api_key_encrypted TEXT NOT NULL,
  config TEXT, -- JSON
  status TEXT DEFAULT 'active', -- 'active' | 'error' | 'disabled'
  last_sync DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Imported traces
CREATE TABLE traces (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  external_id TEXT NOT NULL, -- ID from source platform (trace_id in old schema)
  trace_data TEXT NOT NULL, -- JSON: normalized LangGraphExecutionStep
  agent_version_id TEXT, -- Link to agent version
  assignment_status TEXT DEFAULT 'unassigned', -- 'unassigned' | 'assigned' | 'orphaned'
  imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_version_id) REFERENCES agent_versions(id),
  UNIQUE(integration_id, external_id),
  CHECK(assignment_status IN ('unassigned', 'assigned', 'orphaned'))
);

-- Eval sets (groups of traces for training)
CREATE TABLE eval_sets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  target_count INTEGER DEFAULT 5, -- minimum_examples
  status TEXT DEFAULT 'collecting', -- 'collecting' | 'ready' | 'generated'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, name)
);

-- User feedback on traces
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  eval_set_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  rating TEXT NOT NULL, -- 'positive' | 'negative' | 'neutral'
  rating_detail TEXT, -- optional notes
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_set_id) REFERENCES eval_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE,
  UNIQUE(eval_set_id, trace_id)
);

-- Generated eval functions
CREATE TABLE evals (
  id TEXT PRIMARY KEY,
  eval_set_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  parent_eval_id TEXT, -- refinement chain
  name TEXT NOT NULL,
  description TEXT,
  code TEXT NOT NULL, -- Python function
  model_used TEXT NOT NULL,
  accuracy REAL, -- % correct on training set
  training_trace_ids TEXT, -- JSON array of trace IDs
  generation_prompt TEXT, -- prompt used
  test_results TEXT, -- JSON containing TestResults
  execution_count INTEGER DEFAULT 0,
  contradiction_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft', -- 'draft' | 'active' | 'archived'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_set_id) REFERENCES eval_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_eval_id) REFERENCES evals(id) ON DELETE SET NULL,
  UNIQUE(eval_set_id, version)
);

-- Eval execution results
CREATE TABLE eval_executions (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  predicted_result BOOLEAN NOT NULL, -- result -> predicted_result for clarity
  predicted_reason TEXT, -- reason -> predicted_reason
  execution_time_ms INTEGER,
  error TEXT,
  stdout TEXT,
  stderr TEXT,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_id) REFERENCES evals(id) ON DELETE CASCADE,
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE
);

-- Background jobs
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'import' | 'generate' | 'execute'
  status TEXT NOT NULL, -- 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress INTEGER DEFAULT 0, -- 0-100
  metadata TEXT, -- JSON with job-specific data
  result TEXT, -- JSON with job results
  error TEXT,
  agent_id TEXT, -- Link to agent
  agent_version_id TEXT, -- Link to agent version
  trigger_event TEXT, -- Event that triggered this job
  trigger_threshold TEXT, -- Threshold configuration for auto-trigger
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (agent_version_id) REFERENCES agent_versions(id)
);

-- Agent management tables
-- Agents table - discovered agent groupings
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'discovered', -- 'discovered' | 'confirmed' | 'archived'
  active_version_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CHECK(status IN ('discovered', 'confirmed', 'archived'))
);

-- Agent versions - immutable prompt versions
CREATE TABLE agent_versions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  prompt_template TEXT NOT NULL,
  variables TEXT, -- JSON
  source TEXT NOT NULL, -- 'discovered' | 'manual' | 'ai_improved'
  parent_version_id TEXT,
  accuracy REAL,
  status TEXT DEFAULT 'candidate', -- 'candidate' | 'active' | 'rejected' | 'archived'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE(agent_id, version),
  CHECK(source IN ('discovered', 'manual', 'ai_improved')),
  CHECK(status IN ('candidate', 'active', 'rejected', 'archived'))
);

-- Functions table - unified AI-generated code storage
CREATE TABLE functions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'template_extractor' | 'template_injector' | 'eval'
  name TEXT NOT NULL,
  code TEXT NOT NULL, -- Python function code
  input_schema TEXT, -- JSON schema
  output_schema TEXT, -- JSON schema
  model_used TEXT, -- LLM model used for generation
  parent_function_id TEXT, -- Refinement chain
  status TEXT DEFAULT 'active', -- 'active' | 'archived' | 'failed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CHECK(type IN ('template_extractor', 'template_injector', 'eval')),
  CHECK(status IN ('active', 'archived', 'failed'))
);

-- Agent functions - links agents to their functions
CREATE TABLE agent_functions (
  agent_id TEXT NOT NULL,
  function_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'extractor' | 'injector'
  PRIMARY KEY (agent_id, role),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (function_id) REFERENCES functions(id) ON DELETE CASCADE,
  CHECK(role IN ('extractor', 'injector'))
);

-- Prompt best practices - reference material for meta-prompt agent
CREATE TABLE prompt_best_practices (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL, -- 'openai' | 'anthropic' | 'google'
  category TEXT NOT NULL, -- 'structure' | 'clarity' | 'safety' | 'reasoning' | 'general'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK(source IN ('openai', 'anthropic', 'google')),
  CHECK(category IN ('structure', 'clarity', 'safety', 'reasoning', 'general'))
);

-- Indexes for performance
CREATE INDEX idx_traces_workspace_id ON traces(workspace_id);
CREATE INDEX idx_traces_external_id ON traces(external_id);
CREATE INDEX idx_traces_integration_id ON traces(integration_id);
CREATE INDEX idx_traces_imported_at ON traces(imported_at);
CREATE INDEX idx_traces_agent_version_id ON traces(agent_version_id);
CREATE INDEX idx_traces_assignment_status ON traces(assignment_status);

CREATE INDEX idx_integrations_workspace_id ON integrations(workspace_id);
CREATE INDEX idx_integrations_platform ON integrations(platform);

CREATE INDEX idx_eval_sets_workspace_id ON eval_sets(workspace_id);

CREATE INDEX idx_feedback_trace_id ON feedback(trace_id);
CREATE INDEX idx_feedback_eval_set_id ON feedback(eval_set_id);
CREATE INDEX idx_feedback_rating ON feedback(rating);
-- Composite index for matrix query pagination and filtering
CREATE INDEX idx_feedback_eval_set_created_trace ON feedback(eval_set_id, created_at, trace_id);

CREATE INDEX idx_evals_eval_set_id ON evals(eval_set_id);
CREATE INDEX idx_evals_name ON evals(name);

CREATE INDEX idx_eval_executions_eval_id ON eval_executions(eval_id);
CREATE INDEX idx_eval_executions_trace_id ON eval_executions(trace_id);
-- Composite index for eval executions pagination
CREATE INDEX idx_eval_executions_executed_trace ON eval_executions(eval_id, executed_at, trace_id);

CREATE INDEX idx_jobs_workspace_id ON jobs(workspace_id);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);

-- Agent management indexes
CREATE INDEX idx_agents_workspace_id ON agents(workspace_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agent_versions_agent_id ON agent_versions(agent_id);
CREATE INDEX idx_agent_versions_status ON agent_versions(status);
CREATE INDEX idx_functions_workspace_id ON functions(workspace_id);
CREATE INDEX idx_functions_type ON functions(type);

-- View for eval comparison (predictions vs human feedback)
CREATE VIEW eval_comparison AS
SELECT
  ee.id AS execution_id,
  ee.eval_id,
  ee.trace_id,
  ee.predicted_result,
  ee.predicted_reason,
  ee.execution_time_ms,
  ee.error,
  f.rating AS human_rating,
  f.rating_detail AS human_notes,
  CASE
    WHEN f.rating IS NULL THEN NULL
    WHEN f.rating = 'neutral' THEN 0
    WHEN (f.rating = 'positive' AND ee.predicted_result = 0) THEN 1
    WHEN (f.rating = 'negative' AND ee.predicted_result = 1) THEN 1
    ELSE 0
  END AS is_contradiction
FROM eval_executions ee
LEFT JOIN feedback f ON ee.trace_id = f.trace_id;
