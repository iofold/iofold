# Agent Management & Self-Evolving Prompts Design

**Date:** November 27, 2025
**Author:** Yash Gupta
**Status:** Design Complete

---

## Executive Summary

This document describes the addition of **Agent Management** to iofold, enabling the platform to automatically discover agents from imported traces, manage versioned system prompts, and suggest improvements based on eval feedback. This transforms iofold from an "eval generation platform" into a "self-evolving agent platform."

**Core Addition:** Agents with versioned system prompts that can be automatically improved based on contradiction patterns detected by evals.

---

## Core Principles

### New Principle: AI-Native for AI-Native Builders

- Every manual process should have an AI-automated equivalent
- Discovery over configuration - system learns from data, not user setup
- Automation with oversight - AI does the work, humans approve critical changes

### Existing Principles (Unchanged)

- Quality First - Eval accuracy is paramount
- Plugin Architecture - Integrate with existing tools
- User Control - User-triggered refinement (for MVP)
- Code-First Evals - Deterministic Python evals over LLM judges

---

## Data Hierarchy

### Before (Current)

```
workspace → eval_sets → traces/feedback/evals
```

### After (New)

```
workspace → agents → agent_versions → traces/feedback/evals/eval_results
```

### Key Concepts

| Concept | Definition |
|---------|------------|
| **Agent** | A logical grouping of traces that share a common system prompt template. Discovered automatically by clustering similar prompts. |
| **Agent Version** | A specific system prompt template + metadata. One version is "active" at a time. Versions are immutable once created. |
| **Template** | The system prompt with variable placeholders extracted (e.g., `{{timestamp}}`, `{{user_context}}`). |
| **Extraction Function** | AI-generated code that extracts the template from a raw trace's system prompt. |
| **Injection Function** | AI-generated code that fills template variables to produce the actual prompt for the API. |

### What Gets Removed

- `eval_sets` table - replaced by agents
- Manual eval set creation - agents are discovered automatically
- The "collecting → ready → generated" status flow - replaced by continuous improvement

---

## Database Schema Changes

### New Tables

#### `agents` - Discovered agent groupings

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,                    -- AI-generated summary
  status TEXT DEFAULT 'discovered',    -- 'discovered' | 'confirmed' | 'archived'
  active_version_id TEXT,              -- FK to agent_versions, the "live" prompt
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

#### `agent_versions` - Immutable prompt versions

```sql
CREATE TABLE agent_versions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  prompt_template TEXT NOT NULL,       -- The system prompt with {{variables}}
  variables TEXT,                      -- JSON array: ["timestamp", "user_name"]
  source TEXT NOT NULL,                -- 'discovered' | 'manual' | 'ai_improved'
  parent_version_id TEXT,              -- For improvement chain tracking
  accuracy REAL,                       -- Eval accuracy on test set
  status TEXT DEFAULT 'candidate',     -- 'candidate' | 'active' | 'rejected' | 'archived'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE(agent_id, version)
);
```

#### `functions` - Unified AI-generated code storage

```sql
CREATE TABLE functions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL,                  -- 'template_extractor' | 'template_injector' | 'eval'
  name TEXT NOT NULL,
  code TEXT NOT NULL,                  -- Python code
  input_schema TEXT,                   -- JSON schema for validation
  output_schema TEXT,
  model_used TEXT,                     -- Which AI generated this
  parent_function_id TEXT,             -- For refinement chains
  status TEXT DEFAULT 'active',        -- 'active' | 'archived' | 'failed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

#### `agent_functions` - Links agents to their functions

```sql
CREATE TABLE agent_functions (
  agent_id TEXT NOT NULL,
  function_id TEXT NOT NULL,
  role TEXT NOT NULL,                  -- 'extractor' | 'injector'
  PRIMARY KEY (agent_id, role),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (function_id) REFERENCES functions(id) ON DELETE CASCADE
);
```

#### `prompt_best_practices` - Reference material for meta-prompt agent

```sql
CREATE TABLE prompt_best_practices (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,           -- 'openai' | 'anthropic' | 'google'
  category TEXT NOT NULL,         -- 'structure' | 'clarity' | 'safety' | 'reasoning'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT,                       -- Link to source doc
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Modified Tables

#### `traces` - Now linked to agent_versions

```sql
ALTER TABLE traces ADD COLUMN agent_version_id TEXT
  REFERENCES agent_versions(id);
ALTER TABLE traces ADD COLUMN assignment_status TEXT
  DEFAULT 'unassigned';  -- 'unassigned' | 'assigned' | 'orphaned'
```

#### `feedback` - Now linked to agent_versions

```sql
ALTER TABLE feedback RENAME COLUMN eval_set_id TO agent_version_id;
```

#### `evals` - Now linked to agents

```sql
ALTER TABLE evals RENAME COLUMN eval_set_id TO agent_id;
```

### Tables to Remove

- `eval_sets` - Replaced by agents

### New Indexes

```sql
CREATE INDEX idx_agents_workspace_id ON agents(workspace_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agent_versions_agent_id ON agent_versions(agent_id);
CREATE INDEX idx_agent_versions_status ON agent_versions(status);
CREATE INDEX idx_functions_workspace_id ON functions(workspace_id);
CREATE INDEX idx_functions_type ON functions(type);
CREATE INDEX idx_traces_agent_version_id ON traces(agent_version_id);
CREATE INDEX idx_traces_assignment_status ON traces(assignment_status);
```

---

## Background Jobs & Event-Driven Automation

### Job Types

| Job Type | Trigger | Purpose |
|----------|---------|---------|
| `agent_discovery` | X unassigned traces (default: 20) | Cluster traces by system prompt similarity, suggest new agents |
| `prompt_improvement` | Contradiction rate > threshold (default: 15%) | Generate improved system prompt candidate |
| `template_drift` | Every trace import | Check if trace matches known agent, flag orphans |
| `eval_revalidation` | New traces assigned to agent | Re-run evals on new traces, update accuracy metrics |
| `prompt_evaluation` | New agent version created | Re-run historical traces with new prompt, measure improvement |

### Jobs Table Extensions

```sql
ALTER TABLE jobs ADD COLUMN agent_id TEXT REFERENCES agents(id);
ALTER TABLE jobs ADD COLUMN agent_version_id TEXT REFERENCES agent_versions(id);
ALTER TABLE jobs ADD COLUMN trigger_event TEXT;
ALTER TABLE jobs ADD COLUMN trigger_threshold TEXT;
```

### Agent Discovery Job

```
Trigger: unassigned_traces_count >= 20
Input: List of unassigned trace IDs
Process:
  1. Extract system prompts from traces
  2. Use embedding model to cluster similar prompts
  3. For each cluster with 5+ traces:
     - Generate template (find common pattern, extract variables)
     - Generate extractor/injector functions
     - Create agent in 'discovered' status
  4. Assign traces to discovered agents
  5. Notify user: "Found 2 new agents - review?"
Output: List of discovered agent IDs
```

### Prompt Improvement Job

```
Trigger: agent contradiction_rate > 15% OR accuracy < 80%
Input: agent_id, list of contradiction trace IDs
Process:
  1. Gather context:
     - Current prompt template
     - Contradiction examples (human said ✓, eval said ✗)
     - Passing examples for reference
  2. Call meta-prompt agent:
     - Include best practices from OpenAI/Anthropic/Google guides
     - Analyze failure patterns
     - Generate ONE improved prompt
  3. Create new agent_version with status='candidate'
  4. Trigger prompt_evaluation job
Output: new agent_version_id
```

### Prompt Evaluation Job

```
Trigger: New agent_version created (source='ai_improved')
Input: agent_version_id
Process:
  1. Select N historical traces (default: 50)
  2. For each trace:
     - Surgically replace system prompt with new template
     - Re-execute through LLM (requires integration API key)
     - Store new output
  3. Run all agent evals on new outputs
  4. Calculate accuracy delta vs current active version
  5. Update agent_version.accuracy
  6. Notify user: "New version ready: 91% (+9%). Promote?"
Output: accuracy metrics, comparison report
```

---

## Agent Discovery Process

### Discovery Pipeline

```
┌─────────────────┐
│ Import Traces   │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Extract System  │──→ Store raw prompt in trace
│ Prompts         │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Check Against   │──→ Match? Assign to agent_version
│ Known Agents    │
└────────┬────────┘
         │ No match
         ▼
┌─────────────────┐
│ Mark as         │──→ assignment_status = 'unassigned'
│ Unassigned      │
└────────┬────────┘
         │ Threshold reached (20 unassigned)
         ▼
┌─────────────────┐
│ Agent Discovery │
│ Job Triggered   │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Cluster by      │──→ Embedding similarity
│ Prompt Similarity│
└────────┬────────┘
         ▼
┌─────────────────┐
│ For each cluster│
│ (5+ traces):    │
│ - Extract template
│ - Generate functions
│ - Create agent  │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Notify User:    │
│ "2 agents found"│
└─────────────────┘
```

### Template Extraction

Given N similar system prompts, AI extracts a common template:

```python
def extract_template(prompts: list[str]) -> tuple[str, list[str]]:
    """
    Input prompts:
    - "You are a support agent. Today is 2025-11-27. User: John"
    - "You are a support agent. Today is 2025-11-26. User: Sarah"
    - "You are a support agent. Today is 2025-11-25. User: Mike"

    Output:
    - template: "You are a support agent. Today is {{date}}. User: {{user_name}}"
    - variables: ["date", "user_name"]
    """
```

### Orphan Detection

Traces that don't match any agent and don't cluster:

```sql
UPDATE traces
SET assignment_status = 'orphaned'
WHERE assignment_status = 'unassigned'
  AND id IN (/* traces that didn't cluster */);
```

---

## Meta-Prompt Agent

### Purpose

Generates improved system prompts based on failure patterns, incorporating best practices from OpenAI, Anthropic, and Google.

### Meta-Prompt Template

```python
META_PROMPT_TEMPLATE = """
You are an expert prompt engineer. Your task is to improve a system prompt
based on failure patterns observed in production traces.

## Best Practices (from OpenAI, Anthropic, Google)
{best_practices}

## Current System Prompt
```
{current_prompt}
```

## Agent Context
- Agent Name: {agent_name}
- Agent Description: {agent_description}
- Total traces evaluated: {total_traces}
- Current accuracy: {current_accuracy}%

## Failure Analysis
The following traces were marked as failures (human feedback contradicted eval):

{failure_examples}

## Success Examples (for reference)
{success_examples}

## Detected Patterns
{detected_patterns}

## Custom Instructions from User
{custom_instructions}

## Your Task
Generate an improved system prompt that:
1. Addresses the failure patterns identified above
2. Preserves the successful behaviors
3. Follows prompt engineering best practices
4. Maintains the same variable placeholders: {variables}

Output ONLY the improved prompt template, nothing else.
"""
```

### Pattern Detection

Before calling the meta-prompt agent, analyze failures:

```python
def detect_failure_patterns(failures: list[Trace]) -> list[str]:
    """
    AI-assisted pattern detection across failure cases.

    Returns human-readable pattern descriptions:
    - "5/7 failures involve user asking for refunds"
    - "All failures have responses > 500 words"
    - "Failures lack explicit confirmation before action"
    """
```

---

## API Endpoints

### Agent Management

```
# List agents (with discovery suggestions)
GET /api/agents
→ { agents: [...], pending_discoveries: 2 }

# Get agent details
GET /api/agents/{id}
→ { agent, active_version, versions: [...], evals: [...], metrics }

# Confirm discovered agent (user approves AI suggestion)
POST /api/agents/{id}/confirm
{ name?: "Customer Support Bot" }

# Archive agent
DELETE /api/agents/{id}
```

### Agent Versions

```
# List versions for agent
GET /api/agents/{id}/versions
→ { versions: [...], active_version_id }

# Get specific version
GET /api/agents/{id}/versions/{version}
→ { version, prompt_template, variables, accuracy, source }

# Promote version to active (human approval)
POST /api/agents/{id}/versions/{version}/promote
→ { success, previous_version_id }

# Reject candidate version
POST /api/agents/{id}/versions/{version}/reject
{ reason?: "Prompt too verbose" }

# Manually create version
POST /api/agents/{id}/versions
{ prompt_template, variables: [] }
```

### Prompt API (for agent implementations)

```
# Get current active prompt for agent
GET /api/agents/{id}/prompt
Headers: Authorization: Bearer <api_key>
→ {
    template: "You are a helpful assistant. Today is {{date}}...",
    version: 3,
    version_id: "av_xxx",
    variables: ["date", "user_context"],
    updated_at: "2025-11-27T10:00:00Z"
  }

# Supports ETag for efficient polling
# Returns 304 Not Modified if unchanged
```

### Trigger Improvement

```
# Manually trigger prompt improvement job
POST /api/agents/{id}/improve
{
  custom_instructions?: "Focus on being more concise",
  include_traces?: ["trace_1", "trace_2"]
}
→ { job_id }

# Check improvement job status
GET /api/jobs/{job_id}
→ { status, progress, result: { new_version_id, accuracy_delta } }
```

### Trace Assignment

```
# Get unassigned traces
GET /api/traces?assignment_status=unassigned
→ { traces: [...], count: 23 }

# Manually assign trace to agent version
POST /api/traces/{id}/assign
{ agent_version_id }

# Trigger discovery job manually
POST /api/jobs/discover-agents
→ { job_id }
```

---

## Future Vision: Autonomous Improvements

*Documented for future implementation, not MVP.*

### Canary Deployment

```
┌─────────────────────────────────────────────────────────┐
│                  Canary Deployment                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  GET /api/agents/{id}/prompt                            │
│                                                          │
│  ┌─────────────┐     90%      ┌─────────────┐          │
│  │   v2        │◄────────────►│   Client    │          │
│  │  (active)   │              │   Polls     │          │
│  └─────────────┘              └─────────────┘          │
│                                      │                  │
│  ┌─────────────┐     10%            │                  │
│  │   v3        │◄───────────────────┘                  │
│  │ (canary)    │                                        │
│  └─────────────┘                                        │
│                                                          │
│  After N traces:                                         │
│  - v3 accuracy > v2 → Auto-promote v3 to 100%          │
│  - v3 accuracy < v2 → Auto-rollback, reject v3         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Future Config:**
```json
{
  "canary_enabled": true,
  "canary_percentage": 10,
  "min_traces_for_decision": 50,
  "auto_promote_threshold": 0.05,
  "auto_rollback_threshold": -0.05
}
```

### Fully Autonomous Loop

```
┌──────────────────────────────────────────────────────────┐
│              Autonomous Improvement Loop                  │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────┐    Traces     ┌─────────┐                  │
│  │ Agent   │──────────────►│ Evals   │                  │
│  │ in Prod │               │ Run     │                  │
│  └─────────┘               └────┬────┘                  │
│       ▲                         │                        │
│       │                         ▼                        │
│       │                   ┌───────────┐                  │
│       │                   │ Accuracy  │                  │
│       │                   │ < 85%?    │                  │
│       │                   └─────┬─────┘                  │
│       │                         │ Yes                    │
│       │                         ▼                        │
│       │                   ┌───────────┐                  │
│       │                   │ Generate  │                  │
│       │                   │ Improved  │                  │
│       │                   │ Prompt    │                  │
│       │                   └─────┬─────┘                  │
│       │                         │                        │
│       │                         ▼                        │
│       │                   ┌───────────┐                  │
│       │                   │ Evaluate  │                  │
│       │                   │ on History│                  │
│       │                   └─────┬─────┘                  │
│       │                         │                        │
│       │                         ▼                        │
│       │    Auto-promote   ┌───────────┐                  │
│       └───────────────────│ Canary    │                  │
│         if successful     │ Deploy    │                  │
│                           └───────────┘                  │
│                                                           │
│  Zero human intervention required.                        │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Open Problems

| Problem | Description | Potential Solutions |
|---------|-------------|---------------------|
| **Multi-turn contamination** | Historical traces have conversation history biased by old prompt | Replay from first user message only; synthetic conversation regeneration |
| **Eval drift** | Evals themselves may become stale as agent behavior evolves | Periodic eval re-generation; eval accuracy tracking over time |
| **Prompt overfitting** | Improved prompts may overfit to failure cases | Hold-out test set; cross-validation on historical traces |
| **Variable extraction edge cases** | Complex prompts with nested/conditional variables | Support for conditional template blocks; regex fallbacks |
| **Multi-agent traces** | Traces involving sub-agents with different prompts | Agent hierarchy modeling; trace decomposition |

---

## Migration Path

### SQL Migration Script

```sql
-- 1. Create new tables
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'discovered',
  active_version_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE agent_versions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  prompt_template TEXT NOT NULL,
  variables TEXT,
  source TEXT NOT NULL,
  parent_version_id TEXT,
  accuracy REAL,
  status TEXT DEFAULT 'candidate',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE(agent_id, version)
);

CREATE TABLE functions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  input_schema TEXT,
  output_schema TEXT,
  model_used TEXT,
  parent_function_id TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE agent_functions (
  agent_id TEXT NOT NULL,
  function_id TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (agent_id, role),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (function_id) REFERENCES functions(id) ON DELETE CASCADE
);

CREATE TABLE prompt_best_practices (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Migrate eval_sets → agents
INSERT INTO agents (id, workspace_id, name, description, status)
SELECT id, workspace_id, name, description, 'confirmed'
FROM eval_sets;

-- 3. Add new columns to traces
ALTER TABLE traces ADD COLUMN agent_version_id TEXT;
ALTER TABLE traces ADD COLUMN assignment_status TEXT DEFAULT 'unassigned';

-- 4. Migrate feedback (rename column)
ALTER TABLE feedback RENAME COLUMN eval_set_id TO agent_version_id;

-- 5. Migrate evals (rename column)
ALTER TABLE evals RENAME COLUMN eval_set_id TO agent_id;

-- 6. Move existing eval code to functions table
INSERT INTO functions (id, workspace_id, type, name, code, model_used, status, created_at)
SELECT id,
       (SELECT workspace_id FROM agents WHERE agents.id = evals.agent_id),
       'eval',
       name,
       code,
       model_used,
       status,
       created_at
FROM evals;

-- 7. Add new indexes
CREATE INDEX idx_agents_workspace_id ON agents(workspace_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agent_versions_agent_id ON agent_versions(agent_id);
CREATE INDEX idx_agent_versions_status ON agent_versions(status);
CREATE INDEX idx_functions_workspace_id ON functions(workspace_id);
CREATE INDEX idx_functions_type ON functions(type);
CREATE INDEX idx_traces_agent_version_id ON traces(agent_version_id);
CREATE INDEX idx_traces_assignment_status ON traces(assignment_status);

-- 8. Extend jobs table
ALTER TABLE jobs ADD COLUMN agent_id TEXT;
ALTER TABLE jobs ADD COLUMN agent_version_id TEXT;
ALTER TABLE jobs ADD COLUMN trigger_event TEXT;
ALTER TABLE jobs ADD COLUMN trigger_threshold TEXT;

-- 9. Drop eval_sets (after verification)
-- DROP TABLE eval_sets;
```

---

## New UI Screens

1. **Agents List** - View all agents, pending discoveries, health metrics
2. **Agent Detail** - Versions, active prompt, evals, traces, accuracy over time
3. **Version Comparison** - Diff prompts, compare accuracy metrics
4. **Discovery Review** - Accept/reject AI-suggested agents
5. **Prompt Editor** - Manual prompt editing with variable highlighting

---

## Summary

### MVP Deliverables

| Component | Description |
|-----------|-------------|
| **Agent Discovery** | AI clusters traces by system prompt similarity, suggests agents |
| **Agent Versions** | Immutable prompt templates with human-approved promotion |
| **Unified Functions Table** | Store extractors, injectors, evals in one place |
| **Event-Driven Jobs** | Discovery, improvement, drift detection, re-validation |
| **Prompt API** | Simple polling endpoint for agent implementations |
| **Meta-Prompt Agent** | Generates improved prompts using best practices |
| **Historical Evaluation** | Test new prompts by surgical replacement on old traces |

### Future Additions

- Canary deployment with auto-promote/rollback
- Fully autonomous improvement loop
- Multi-turn trace handling
- SDK for prompt retrieval

---

**Last Updated:** 2025-11-27
**Related Docs:**
- `docs/2025-11-05-iofold-auto-evals-design.md` - Original platform design
- `docs/SELF_EVOLVING_AGENTS_COMPARISON.md` - Comparison with OpenAI cookbook
- `schema.sql` - Current database schema
