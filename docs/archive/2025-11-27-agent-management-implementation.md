# Agent Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace eval_sets with agents, add versioned system prompts, and implement AI-driven agent discovery.

**Architecture:** Event-driven agent discovery from trace clustering, versioned prompts with human approval, unified functions table for extractors/injectors/evals.

**Tech Stack:** Cloudflare Workers (TypeScript), D1 (SQLite), Next.js frontend, Python sandbox for functions.

---

## Phase 1: Database Migration

### Task 1.1: Create Migration File

**Files:**
- Create: `migrations/005_agent_management.sql`

**Step 1: Write the migration SQL**

```sql
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

-- Add agent_version_id and assignment_status to traces
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
```

**Step 2: Verify migration syntax**

Run: `cat migrations/005_agent_management.sql | head -20`
Expected: First 20 lines of valid SQL

**Step 3: Commit**

```bash
git add migrations/005_agent_management.sql
git commit -m "feat(db): add agent management schema migration"
```

---

### Task 1.2: Update Schema.sql Master File

**Files:**
- Modify: `schema.sql`

**Step 1: Read current schema.sql**

Run: `wc -l schema.sql`
Expected: Line count to understand file size

**Step 2: Append new tables to schema.sql**

Add after the `jobs` table definition (around line 123):

```sql
-- ============================================================================
-- Agent Management (added 2025-11-27)
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

-- Agent indexes
CREATE INDEX idx_agents_workspace_id ON agents(workspace_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agent_versions_agent_id ON agent_versions(agent_id);
CREATE INDEX idx_agent_versions_status ON agent_versions(status);
CREATE INDEX idx_functions_workspace_id ON functions(workspace_id);
CREATE INDEX idx_functions_type ON functions(type);
```

**Step 3: Add new columns to traces table definition**

In the existing `traces` table, add these columns:

```sql
  agent_version_id TEXT REFERENCES agent_versions(id),
  assignment_status TEXT DEFAULT 'unassigned' CHECK(assignment_status IN ('unassigned', 'assigned', 'orphaned')),
```

**Step 4: Add new columns to jobs table definition**

In the existing `jobs` table, add these columns:

```sql
  agent_id TEXT REFERENCES agents(id),
  agent_version_id TEXT REFERENCES agent_versions(id),
  trigger_event TEXT,
  trigger_threshold TEXT,
```

**Step 5: Add new indexes for traces**

```sql
CREATE INDEX idx_traces_agent_version_id ON traces(agent_version_id);
CREATE INDEX idx_traces_assignment_status ON traces(assignment_status);
```

**Step 6: Commit**

```bash
git add schema.sql
git commit -m "feat(db): update master schema with agent management tables"
```

---

## Phase 2: TypeScript Types

### Task 2.1: Add Agent Types

**Files:**
- Create: `src/types/agent.ts`

**Step 1: Write the agent types file**

```typescript
// src/types/agent.ts
// Type definitions for agent management

export type AgentStatus = 'discovered' | 'confirmed' | 'archived';
export type AgentVersionStatus = 'candidate' | 'active' | 'rejected' | 'archived';
export type AgentVersionSource = 'discovered' | 'manual' | 'ai_improved';
export type FunctionType = 'template_extractor' | 'template_injector' | 'eval';
export type FunctionStatus = 'active' | 'archived' | 'failed';
export type FunctionRole = 'extractor' | 'injector';
export type TraceAssignmentStatus = 'unassigned' | 'assigned' | 'orphaned';
export type BestPracticeSource = 'openai' | 'anthropic' | 'google';
export type BestPracticeCategory = 'structure' | 'clarity' | 'safety' | 'reasoning' | 'general';

export interface Agent {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: AgentStatus;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentVersion {
  id: string;
  agent_id: string;
  version: number;
  prompt_template: string;
  variables: string[]; // JSON parsed
  source: AgentVersionSource;
  parent_version_id: string | null;
  accuracy: number | null;
  status: AgentVersionStatus;
  created_at: string;
}

export interface Function {
  id: string;
  workspace_id: string;
  type: FunctionType;
  name: string;
  code: string;
  input_schema: object | null; // JSON parsed
  output_schema: object | null; // JSON parsed
  model_used: string | null;
  parent_function_id: string | null;
  status: FunctionStatus;
  created_at: string;
}

export interface AgentFunction {
  agent_id: string;
  function_id: string;
  role: FunctionRole;
}

export interface PromptBestPractice {
  id: string;
  source: BestPracticeSource;
  category: BestPracticeCategory;
  title: string;
  content: string;
  url: string | null;
  created_at: string;
}

// API Request/Response types
export interface CreateAgentRequest {
  name: string;
  description?: string;
}

export interface ConfirmAgentRequest {
  name?: string; // Optional rename
}

export interface CreateAgentVersionRequest {
  prompt_template: string;
  variables?: string[];
}

export interface AgentWithVersion extends Agent {
  active_version: AgentVersion | null;
}

export interface AgentWithDetails extends AgentWithVersion {
  versions: AgentVersion[];
  functions: {
    extractor: Function | null;
    injector: Function | null;
  };
  metrics: {
    trace_count: number;
    feedback_count: number;
    eval_count: number;
    accuracy: number | null;
    contradiction_rate: number | null;
  };
}

export interface ListAgentsResponse {
  agents: AgentWithVersion[];
  pending_discoveries: number;
}

export interface AgentPromptResponse {
  template: string;
  version: number;
  version_id: string;
  variables: string[];
  updated_at: string;
}

export interface TriggerImprovementRequest {
  custom_instructions?: string;
  include_traces?: string[];
}

// Job types for agent operations
export type AgentJobType = 'agent_discovery' | 'prompt_improvement' | 'template_drift' | 'eval_revalidation' | 'prompt_evaluation';

export interface AgentDiscoveryJobResult {
  discovered_agents: string[];
  assigned_traces: number;
  orphaned_traces: number;
}

export interface PromptImprovementJobResult {
  new_version_id: string;
  accuracy_delta: number;
  changes_summary: string;
}

export interface PromptEvaluationJobResult {
  version_id: string;
  accuracy: number;
  test_results: {
    passed: number;
    failed: number;
    errors: number;
  };
  comparison: {
    previous_accuracy: number;
    accuracy_delta: number;
  };
}
```

**Step 2: Verify file compiles**

Run: `npx tsc --noEmit src/types/agent.ts`
Expected: No output (success)

**Step 3: Commit**

```bash
git add src/types/agent.ts
git commit -m "feat(types): add agent management type definitions"
```

---

### Task 2.2: Update API Types

**Files:**
- Modify: `src/types/api.ts`

**Step 1: Add agent job types to existing JobType**

Find the line:
```typescript
export type JobType = 'import' | 'generate' | 'execute' | 'monitor' | 'auto_refine';
```

Replace with:
```typescript
export type JobType = 'import' | 'generate' | 'execute' | 'monitor' | 'auto_refine' | 'agent_discovery' | 'prompt_improvement' | 'template_drift' | 'eval_revalidation' | 'prompt_evaluation';
```

**Step 2: Add agent fields to JobMetadata**

Find the JobMetadata interface and update:

```typescript
export interface JobMetadata {
  evalSetId?: string;
  evalId?: string;
  traceIds?: string[];
  workspaceId: string;
  // Agent management fields
  agentId?: string;
  agentVersionId?: string;
  triggerEvent?: string;
  triggerThreshold?: string;
}
```

**Step 3: Commit**

```bash
git add src/types/api.ts
git commit -m "feat(types): add agent job types to API types"
```

---

## Phase 3: Backend API - Agents

### Task 3.1: Create Agents API Endpoint

**Files:**
- Create: `src/api/agents.ts`
- Test: `src/api/agents.test.ts`

**Step 1: Write failing test**

```typescript
// src/api/agents.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Agents API', () => {
  describe('POST /api/agents', () => {
    it('should create a new agent', async () => {
      // This test will fail until we implement the endpoint
      const response = await fetch('http://localhost:8787/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Id': 'workspace_default',
        },
        body: JSON.stringify({
          name: 'Test Agent',
          description: 'A test agent',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toMatch(/^agent_/);
      expect(data.name).toBe('Test Agent');
      expect(data.status).toBe('confirmed');
    });
  });

  describe('GET /api/agents', () => {
    it('should list agents with pending discoveries count', async () => {
      const response = await fetch('http://localhost:8787/api/agents', {
        headers: {
          'X-Workspace-Id': 'workspace_default',
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('agents');
      expect(data).toHaveProperty('pending_discoveries');
      expect(Array.isArray(data.agents)).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/api/agents.test.ts`
Expected: FAIL - endpoint not found

**Step 3: Write the agents API implementation**

```typescript
// src/api/agents.ts
/**
 * Agents API Endpoints
 *
 * Handles CRUD operations for agents and their versions.
 */

/// <reference types="@cloudflare/workers-types" />

import {
  createErrorResponse,
  createSuccessResponse,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
} from './utils';
import type {
  Agent,
  AgentVersion,
  AgentWithVersion,
  AgentWithDetails,
  ListAgentsResponse,
  CreateAgentRequest,
  ConfirmAgentRequest,
  CreateAgentVersionRequest,
  AgentPromptResponse,
  TriggerImprovementRequest,
} from '../types/agent';

export interface Env {
  DB: D1Database;
}

/**
 * POST /api/agents
 * Create a new agent manually (status='confirmed')
 */
export async function createAgent(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<CreateAgentRequest>(request);

    if (!body.name || body.name.trim().length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'name is required', 400);
    }

    // Check for duplicate name
    const existing = await env.DB.prepare(
      'SELECT id FROM agents WHERE workspace_id = ? AND name = ?'
    )
      .bind(workspaceId, body.name.trim())
      .first();

    if (existing) {
      return createErrorResponse('ALREADY_EXISTS', 'Agent with same name already exists', 409);
    }

    const agentId = `agent_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO agents (id, workspace_id, name, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'confirmed', ?, ?)`
    )
      .bind(agentId, workspaceId, body.name.trim(), body.description || null, now, now)
      .run();

    return createSuccessResponse(
      {
        id: agentId,
        name: body.name.trim(),
        description: body.description || null,
        status: 'confirmed',
        active_version_id: null,
        active_version: null,
        created_at: now,
        updated_at: now,
      },
      201
    );
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    if (error.message === 'Invalid JSON in request body') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents
 * List all agents with pending discoveries count
 */
export async function listAgents(request: Request, env: Env): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const url = new URL(request.url);
    const status = url.searchParams.get('status'); // Optional filter

    let query = `
      SELECT
        a.id,
        a.name,
        a.description,
        a.status,
        a.active_version_id,
        a.created_at,
        a.updated_at,
        av.version,
        av.prompt_template,
        av.variables,
        av.accuracy
      FROM agents a
      LEFT JOIN agent_versions av ON a.active_version_id = av.id
      WHERE a.workspace_id = ?
    `;
    const params: any[] = [workspaceId];

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    query += ' ORDER BY a.created_at DESC LIMIT 100';

    const result = await env.DB.prepare(query).bind(...params).all();

    const agents: AgentWithVersion[] = result.results.map((row: any) => ({
      id: row.id,
      workspace_id: workspaceId,
      name: row.name,
      description: row.description,
      status: row.status,
      active_version_id: row.active_version_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      active_version: row.active_version_id
        ? {
            id: row.active_version_id,
            agent_id: row.id,
            version: row.version,
            prompt_template: row.prompt_template,
            variables: row.variables ? JSON.parse(row.variables) : [],
            source: 'manual' as const, // Will be fetched properly in detail view
            parent_version_id: null,
            accuracy: row.accuracy,
            status: 'active' as const,
            created_at: row.created_at,
          }
        : null,
    }));

    // Count pending discoveries (discovered but not confirmed)
    const pendingResult = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM agents WHERE workspace_id = ? AND status = 'discovered'`
    )
      .bind(workspaceId)
      .first();

    return createSuccessResponse({
      agents,
      pending_discoveries: pendingResult?.count || 0,
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents/:id
 * Get agent details with versions, functions, and metrics
 */
export async function getAgentById(request: Request, env: Env, agentId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Get agent
    const agent = await env.DB.prepare(
      'SELECT * FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get versions
    const versionsResult = await env.DB.prepare(
      `SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version DESC`
    )
      .bind(agentId)
      .all();

    const versions: AgentVersion[] = versionsResult.results.map((row: any) => ({
      id: row.id,
      agent_id: row.agent_id,
      version: row.version,
      prompt_template: row.prompt_template,
      variables: row.variables ? JSON.parse(row.variables) : [],
      source: row.source,
      parent_version_id: row.parent_version_id,
      accuracy: row.accuracy,
      status: row.status,
      created_at: row.created_at,
    }));

    // Get functions
    const functionsResult = await env.DB.prepare(
      `SELECT f.*, af.role FROM functions f
       JOIN agent_functions af ON f.id = af.function_id
       WHERE af.agent_id = ?`
    )
      .bind(agentId)
      .all();

    const functions = {
      extractor: null as any,
      injector: null as any,
    };

    for (const row of functionsResult.results as any[]) {
      const func = {
        id: row.id,
        workspace_id: row.workspace_id,
        type: row.type,
        name: row.name,
        code: row.code,
        input_schema: row.input_schema ? JSON.parse(row.input_schema) : null,
        output_schema: row.output_schema ? JSON.parse(row.output_schema) : null,
        model_used: row.model_used,
        parent_function_id: row.parent_function_id,
        status: row.status,
        created_at: row.created_at,
      };
      if (row.role === 'extractor') functions.extractor = func;
      if (row.role === 'injector') functions.injector = func;
    }

    // Get metrics
    const metricsResult = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM traces WHERE agent_version_id IN
          (SELECT id FROM agent_versions WHERE agent_id = ?)) as trace_count,
        (SELECT COUNT(*) FROM feedback WHERE agent_version_id IN
          (SELECT id FROM agent_versions WHERE agent_id = ?)) as feedback_count,
        (SELECT COUNT(*) FROM evals WHERE agent_id = ?) as eval_count
      `
    )
      .bind(agentId, agentId, agentId)
      .first();

    const activeVersion = versions.find((v) => v.status === 'active') || null;

    const response: AgentWithDetails = {
      id: agent.id as string,
      workspace_id: agent.workspace_id as string,
      name: agent.name as string,
      description: agent.description as string | null,
      status: agent.status as any,
      active_version_id: agent.active_version_id as string | null,
      created_at: agent.created_at as string,
      updated_at: agent.updated_at as string,
      active_version: activeVersion,
      versions,
      functions,
      metrics: {
        trace_count: (metricsResult?.trace_count as number) || 0,
        feedback_count: (metricsResult?.feedback_count as number) || 0,
        eval_count: (metricsResult?.eval_count as number) || 0,
        accuracy: activeVersion?.accuracy || null,
        contradiction_rate: null, // TODO: Calculate from eval executions
      },
    };

    return createSuccessResponse(response);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/agents/:id/confirm
 * Confirm a discovered agent
 */
export async function confirmAgent(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<ConfirmAgentRequest>(request);

    const agent = await env.DB.prepare(
      'SELECT * FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    if (agent.status !== 'discovered') {
      return createErrorResponse('VALIDATION_ERROR', 'Agent is not in discovered status', 400);
    }

    const updates: string[] = ["status = 'confirmed'", 'updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (body.name) {
      // Check for duplicate name
      const duplicate = await env.DB.prepare(
        'SELECT id FROM agents WHERE workspace_id = ? AND name = ? AND id != ?'
      )
        .bind(workspaceId, body.name.trim(), agentId)
        .first();

      if (duplicate) {
        return createErrorResponse('ALREADY_EXISTS', 'Agent with same name already exists', 409);
      }

      updates.push('name = ?');
      params.push(body.name.trim());
    }

    params.push(agentId);
    await env.DB.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();

    return getAgentById(request, env, agentId);
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * DELETE /api/agents/:id
 * Archive an agent
 */
export async function deleteAgent(request: Request, env: Env, agentId: string): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Soft delete - set status to archived
    await env.DB.prepare(
      `UPDATE agents SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
      .bind(agentId)
      .run();

    return new Response(null, { status: 204 });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents/:id/prompt
 * Get current active prompt for polling
 */
export async function getAgentPrompt(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    // Note: This endpoint may use API key auth instead of workspace header
    // For MVP, we still require workspace ID
    const workspaceId = getWorkspaceId(request);

    const agent = await env.DB.prepare(
      `SELECT a.*, av.version, av.prompt_template, av.variables, av.created_at as version_created_at
       FROM agents a
       JOIN agent_versions av ON a.active_version_id = av.id
       WHERE a.id = ? AND a.workspace_id = ?`
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found or no active version', 404);
    }

    // Support ETag for efficient polling
    const etag = `"${agent.active_version_id}"`;
    const ifNoneMatch = request.headers.get('If-None-Match');

    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304 });
    }

    const response: AgentPromptResponse = {
      template: agent.prompt_template as string,
      version: agent.version as number,
      version_id: agent.active_version_id as string,
      variables: agent.variables ? JSON.parse(agent.variables as string) : [],
      updated_at: agent.version_created_at as string,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ETag: etag,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/api/agents.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/api/agents.ts src/api/agents.test.ts
git commit -m "feat(api): add agents CRUD endpoints"
```

---

### Task 3.2: Create Agent Versions API

**Files:**
- Create: `src/api/agent-versions.ts`

**Step 1: Write the agent versions API**

```typescript
// src/api/agent-versions.ts
/**
 * Agent Versions API Endpoints
 *
 * Handles version management, promotion, and rejection.
 */

/// <reference types="@cloudflare/workers-types" />

import {
  createErrorResponse,
  createSuccessResponse,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
} from './utils';
import type { AgentVersion, CreateAgentVersionRequest } from '../types/agent';

export interface Env {
  DB: D1Database;
}

/**
 * GET /api/agents/:id/versions
 * List all versions for an agent
 */
export async function listAgentVersions(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify agent exists and belongs to workspace
    const agent = await env.DB.prepare(
      'SELECT id, active_version_id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    const result = await env.DB.prepare(
      `SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version DESC`
    )
      .bind(agentId)
      .all();

    const versions: AgentVersion[] = result.results.map((row: any) => ({
      id: row.id,
      agent_id: row.agent_id,
      version: row.version,
      prompt_template: row.prompt_template,
      variables: row.variables ? JSON.parse(row.variables) : [],
      source: row.source,
      parent_version_id: row.parent_version_id,
      accuracy: row.accuracy,
      status: row.status,
      created_at: row.created_at,
    }));

    return createSuccessResponse({
      versions,
      active_version_id: agent.active_version_id,
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents/:id/versions/:version
 * Get a specific version
 */
export async function getAgentVersion(
  request: Request,
  env: Env,
  agentId: string,
  versionNum: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    const version = await env.DB.prepare(
      'SELECT * FROM agent_versions WHERE agent_id = ? AND version = ?'
    )
      .bind(agentId, parseInt(versionNum, 10))
      .first();

    if (!version) {
      return createErrorResponse('NOT_FOUND', 'Version not found', 404);
    }

    return createSuccessResponse({
      id: version.id,
      agent_id: version.agent_id,
      version: version.version,
      prompt_template: version.prompt_template,
      variables: version.variables ? JSON.parse(version.variables as string) : [],
      source: version.source,
      parent_version_id: version.parent_version_id,
      accuracy: version.accuracy,
      status: version.status,
      created_at: version.created_at,
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/agents/:id/versions
 * Create a new version manually
 */
export async function createAgentVersion(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<CreateAgentVersionRequest>(request);

    if (!body.prompt_template || body.prompt_template.trim().length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'prompt_template is required', 400);
    }

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id, active_version_id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get next version number
    const maxVersion = await env.DB.prepare(
      'SELECT MAX(version) as max_version FROM agent_versions WHERE agent_id = ?'
    )
      .bind(agentId)
      .first();

    const newVersion = ((maxVersion?.max_version as number) || 0) + 1;
    const versionId = `av_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Get current active version as parent
    const parentVersionId = agent.active_version_id || null;

    await env.DB.prepare(
      `INSERT INTO agent_versions (id, agent_id, version, prompt_template, variables, source, parent_version_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'manual', ?, 'candidate', ?)`
    )
      .bind(
        versionId,
        agentId,
        newVersion,
        body.prompt_template.trim(),
        JSON.stringify(body.variables || []),
        parentVersionId,
        now
      )
      .run();

    return createSuccessResponse(
      {
        id: versionId,
        agent_id: agentId,
        version: newVersion,
        prompt_template: body.prompt_template.trim(),
        variables: body.variables || [],
        source: 'manual',
        parent_version_id: parentVersionId,
        accuracy: null,
        status: 'candidate',
        created_at: now,
      },
      201
    );
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/agents/:id/versions/:version/promote
 * Promote a version to active
 */
export async function promoteAgentVersion(
  request: Request,
  env: Env,
  agentId: string,
  versionNum: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id, active_version_id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get version to promote
    const version = await env.DB.prepare(
      'SELECT * FROM agent_versions WHERE agent_id = ? AND version = ?'
    )
      .bind(agentId, parseInt(versionNum, 10))
      .first();

    if (!version) {
      return createErrorResponse('NOT_FOUND', 'Version not found', 404);
    }

    if (version.status === 'active') {
      return createErrorResponse('VALIDATION_ERROR', 'Version is already active', 400);
    }

    if (version.status === 'rejected') {
      return createErrorResponse('VALIDATION_ERROR', 'Cannot promote a rejected version', 400);
    }

    const previousVersionId = agent.active_version_id;

    // Transaction: demote old active, promote new
    // D1 doesn't support transactions, so we do sequential updates

    // Demote current active version
    if (previousVersionId) {
      await env.DB.prepare(
        `UPDATE agent_versions SET status = 'archived' WHERE id = ?`
      )
        .bind(previousVersionId)
        .run();
    }

    // Promote new version
    await env.DB.prepare(
      `UPDATE agent_versions SET status = 'active' WHERE id = ?`
    )
      .bind(version.id)
      .run();

    // Update agent's active_version_id
    await env.DB.prepare(
      `UPDATE agents SET active_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
      .bind(version.id, agentId)
      .run();

    return createSuccessResponse({
      success: true,
      previous_version_id: previousVersionId,
      new_version_id: version.id,
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/agents/:id/versions/:version/reject
 * Reject a candidate version
 */
export async function rejectAgentVersion(
  request: Request,
  env: Env,
  agentId: string,
  versionNum: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);

    const body = await parseJsonBody<{ reason?: string }>(request);

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get version
    const version = await env.DB.prepare(
      'SELECT * FROM agent_versions WHERE agent_id = ? AND version = ?'
    )
      .bind(agentId, parseInt(versionNum, 10))
      .first();

    if (!version) {
      return createErrorResponse('NOT_FOUND', 'Version not found', 404);
    }

    if (version.status === 'active') {
      return createErrorResponse('VALIDATION_ERROR', 'Cannot reject an active version', 400);
    }

    if (version.status === 'rejected') {
      return createErrorResponse('VALIDATION_ERROR', 'Version is already rejected', 400);
    }

    await env.DB.prepare(`UPDATE agent_versions SET status = 'rejected' WHERE id = ?`)
      .bind(version.id)
      .run();

    return createSuccessResponse({
      success: true,
      version_id: version.id,
      reason: body.reason || null,
    });
  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
```

**Step 2: Commit**

```bash
git add src/api/agent-versions.ts
git commit -m "feat(api): add agent versions management endpoints"
```

---

### Task 3.3: Register Agent Routes in API Index

**Files:**
- Modify: `src/api/index.ts`

**Step 1: Add imports at the top of the file**

After the existing imports (around line 43), add:

```typescript
import {
  createAgent,
  listAgents,
  getAgentById,
  confirmAgent,
  deleteAgent,
  getAgentPrompt,
} from './agents';

import {
  listAgentVersions,
  getAgentVersion,
  createAgentVersion,
  promoteAgentVersion,
  rejectAgentVersion,
} from './agent-versions';
```

**Step 2: Add agent routes before the "Not Found" section**

Add after the Monitoring Endpoints section (around line 312):

```typescript
  // ============================================================================
  // Agents Endpoints
  // ============================================================================

  // POST /api/agents
  if (path === '/api/agents' && method === 'POST') {
    return createAgent(request, env);
  }

  // GET /api/agents
  if (path === '/api/agents' && method === 'GET') {
    return listAgents(request, env);
  }

  // GET /api/agents/:id/prompt - Must be before generic :id match
  const agentPromptMatch = path.match(/^\/api\/agents\/([^\/]+)\/prompt$/);
  if (agentPromptMatch && method === 'GET') {
    return getAgentPrompt(request, env, agentPromptMatch[1]);
  }

  // POST /api/agents/:id/confirm
  const agentConfirmMatch = path.match(/^\/api\/agents\/([^\/]+)\/confirm$/);
  if (agentConfirmMatch && method === 'POST') {
    return confirmAgent(request, env, agentConfirmMatch[1]);
  }

  // POST /api/agents/:id/improve
  const agentImproveMatch = path.match(/^\/api\/agents\/([^\/]+)\/improve$/);
  if (agentImproveMatch && method === 'POST') {
    // TODO: Implement improvement job trigger
    return createErrorResponse('NOT_IMPLEMENTED', 'Improvement endpoint coming soon', 501);
  }

  // GET /api/agents/:id/versions
  const agentVersionsMatch = path.match(/^\/api\/agents\/([^\/]+)\/versions$/);
  if (agentVersionsMatch && method === 'GET') {
    return listAgentVersions(request, env, agentVersionsMatch[1]);
  }

  // POST /api/agents/:id/versions
  if (agentVersionsMatch && method === 'POST') {
    return createAgentVersion(request, env, agentVersionsMatch[1]);
  }

  // GET /api/agents/:id/versions/:version
  const agentVersionMatch = path.match(/^\/api\/agents\/([^\/]+)\/versions\/(\d+)$/);
  if (agentVersionMatch && method === 'GET') {
    return getAgentVersion(request, env, agentVersionMatch[1], agentVersionMatch[2]);
  }

  // POST /api/agents/:id/versions/:version/promote
  const agentPromoteMatch = path.match(/^\/api\/agents\/([^\/]+)\/versions\/(\d+)\/promote$/);
  if (agentPromoteMatch && method === 'POST') {
    return promoteAgentVersion(request, env, agentPromoteMatch[1], agentPromoteMatch[2]);
  }

  // POST /api/agents/:id/versions/:version/reject
  const agentRejectMatch = path.match(/^\/api\/agents\/([^\/]+)\/versions\/(\d+)\/reject$/);
  if (agentRejectMatch && method === 'POST') {
    return rejectAgentVersion(request, env, agentRejectMatch[1], agentRejectMatch[2]);
  }

  // GET /api/agents/:id
  const agentMatch = path.match(/^\/api\/agents\/([^\/]+)$/);
  if (agentMatch && method === 'GET') {
    return getAgentById(request, env, agentMatch[1]);
  }

  // DELETE /api/agents/:id
  if (agentMatch && method === 'DELETE') {
    return deleteAgent(request, env, agentMatch[1]);
  }
```

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Build success

**Step 4: Commit**

```bash
git add src/api/index.ts
git commit -m "feat(api): register agent routes in API router"
```

---

## Phase 4: Frontend - Agent Management UI

### Task 4.1: Add Agent Types to Frontend

**Files:**
- Create: `frontend/types/agent.ts`

**Step 1: Write frontend agent types**

```typescript
// frontend/types/agent.ts
// Frontend type definitions for agent management

export type AgentStatus = 'discovered' | 'confirmed' | 'archived';
export type AgentVersionStatus = 'candidate' | 'active' | 'rejected' | 'archived';
export type AgentVersionSource = 'discovered' | 'manual' | 'ai_improved';

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  status: AgentStatus;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentVersion {
  id: string;
  agent_id: string;
  version: number;
  prompt_template: string;
  variables: string[];
  source: AgentVersionSource;
  parent_version_id: string | null;
  accuracy: number | null;
  status: AgentVersionStatus;
  created_at: string;
}

export interface AgentWithVersion extends Agent {
  active_version: AgentVersion | null;
}

export interface AgentWithDetails extends AgentWithVersion {
  versions: AgentVersion[];
  metrics: {
    trace_count: number;
    feedback_count: number;
    eval_count: number;
    accuracy: number | null;
    contradiction_rate: number | null;
  };
}

export interface ListAgentsResponse {
  agents: AgentWithVersion[];
  pending_discoveries: number;
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
}

export interface CreateAgentVersionRequest {
  prompt_template: string;
  variables?: string[];
}

export interface ConfirmAgentRequest {
  name?: string;
}

export interface AgentPromptResponse {
  template: string;
  version: number;
  version_id: string;
  variables: string[];
  updated_at: string;
}
```

**Step 2: Commit**

```bash
git add frontend/types/agent.ts
git commit -m "feat(frontend): add agent type definitions"
```

---

### Task 4.2: Add Agent API Methods to Frontend Client

**Files:**
- Modify: `frontend/lib/api-client.ts`

**Step 1: Add imports at top**

```typescript
import type {
  // ... existing imports ...
  Agent,
  AgentWithVersion,
  AgentWithDetails,
  ListAgentsResponse,
  CreateAgentRequest,
  CreateAgentVersionRequest,
  ConfirmAgentRequest,
  AgentVersion,
} from '@/types/agent'
```

**Step 2: Add agent methods to APIClient class**

Add after the existing methods:

```typescript
  // ============================================================================
  // Agents
  // ============================================================================

  async createAgent(data: CreateAgentRequest): Promise<AgentWithVersion> {
    return this.request('/api/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listAgents(status?: AgentStatus): Promise<ListAgentsResponse> {
    const params = status ? `?status=${status}` : ''
    return this.request(`/api/agents${params}`)
  }

  async getAgent(id: string): Promise<AgentWithDetails> {
    return this.request(`/api/agents/${id}`)
  }

  async confirmAgent(id: string, data?: ConfirmAgentRequest): Promise<AgentWithDetails> {
    return this.request(`/api/agents/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    })
  }

  async deleteAgent(id: string): Promise<void> {
    return this.request(`/api/agents/${id}`, {
      method: 'DELETE',
    })
  }

  async getAgentPrompt(id: string): Promise<AgentPromptResponse> {
    return this.request(`/api/agents/${id}/prompt`)
  }

  // ============================================================================
  // Agent Versions
  // ============================================================================

  async listAgentVersions(agentId: string): Promise<{ versions: AgentVersion[]; active_version_id: string | null }> {
    return this.request(`/api/agents/${agentId}/versions`)
  }

  async createAgentVersion(agentId: string, data: CreateAgentVersionRequest): Promise<AgentVersion> {
    return this.request(`/api/agents/${agentId}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async promoteAgentVersion(agentId: string, version: number): Promise<{ success: boolean; previous_version_id: string | null }> {
    return this.request(`/api/agents/${agentId}/versions/${version}/promote`, {
      method: 'POST',
    })
  }

  async rejectAgentVersion(agentId: string, version: number, reason?: string): Promise<{ success: boolean }> {
    return this.request(`/api/agents/${agentId}/versions/${version}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  async triggerAgentImprovement(agentId: string, customInstructions?: string): Promise<{ job_id: string }> {
    return this.request(`/api/agents/${agentId}/improve`, {
      method: 'POST',
      body: JSON.stringify({ custom_instructions: customInstructions }),
    })
  }
```

**Step 3: Commit**

```bash
git add frontend/lib/api-client.ts
git commit -m "feat(frontend): add agent API methods to client"
```

---

### Task 4.3: Create Agents List Page

**Files:**
- Create: `frontend/app/agents/page.tsx`

**Step 1: Write the agents list page**

```tsx
// frontend/app/agents/page.tsx
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import Link from 'next/link'
import type { AgentWithVersion, AgentStatus } from '@/types/agent'

function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const colors = {
    discovered: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-800',
  }

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status]}`}>
      {status}
    </span>
  )
}

function CreateAgentModal() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: () => apiClient.createAgent({ name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setOpen(false)
      setName('')
      setDescription('')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Agent</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Agent</DialogTitle>
          <DialogDescription>
            Create a new agent manually. You can also let the system discover agents from your traces.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer Support Bot"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Handles customer inquiries and support tickets"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AgentCard({ agent }: { agent: AgentWithVersion }) {
  return (
    <Link href={`/agents/${agent.id}`}>
      <Card className="hover:border-primary transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{agent.name}</CardTitle>
            <AgentStatusBadge status={agent.status} />
          </div>
          <CardDescription>{agent.description || 'No description'}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {agent.active_version ? (
              <>
                <span>v{agent.active_version.version}</span>
                {agent.active_version.accuracy !== null && (
                  <span>{(agent.active_version.accuracy * 100).toFixed(0)}% accuracy</span>
                )}
              </>
            ) : (
              <span>No active version</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default function AgentsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.listAgents(),
  })

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-red-600">Error loading agents: {error.message}</div>
      </div>
    )
  }

  const { agents, pending_discoveries } = data!

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="text-muted-foreground">
            Manage your AI agents and their system prompts
          </p>
        </div>
        <CreateAgentModal />
      </div>

      {pending_discoveries > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600 font-medium">
              {pending_discoveries} agent{pending_discoveries > 1 ? 's' : ''} discovered
            </span>
            <span className="text-yellow-600">- Review and confirm to start tracking</span>
          </div>
        </div>
      )}

      {agents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No agents yet. Create one manually or import traces to discover agents automatically.
            </p>
            <CreateAgentModal />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/app/agents/page.tsx
git commit -m "feat(frontend): add agents list page"
```

---

### Task 4.4: Create Agent Detail Page

**Files:**
- Create: `frontend/app/agents/[id]/page.tsx`

**Step 1: Write the agent detail page**

```tsx
// frontend/app/agents/[id]/page.tsx
'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { AgentVersion, AgentVersionStatus } from '@/types/agent'

function VersionStatusBadge({ status }: { status: AgentVersionStatus }) {
  const colors = {
    candidate: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    archived: 'bg-gray-100 text-gray-800',
  }

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status]}`}>
      {status}
    </span>
  )
}

function VersionCard({
  version,
  agentId,
  isActive,
}: {
  version: AgentVersion
  agentId: string
  isActive: boolean
}) {
  const queryClient = useQueryClient()
  const [showPrompt, setShowPrompt] = useState(false)

  const promoteMutation = useMutation({
    mutationFn: () => apiClient.promoteAgentVersion(agentId, version.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => apiClient.rejectAgentVersion(agentId, version.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
    },
  })

  return (
    <Card className={isActive ? 'border-green-500' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Version {version.version}</CardTitle>
          <VersionStatusBadge status={version.status} />
        </div>
        <CardDescription>
          {version.source} • {new Date(version.created_at).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {version.accuracy !== null && (
            <div className="text-sm">
              <span className="text-muted-foreground">Accuracy:</span>{' '}
              <span className="font-medium">{(version.accuracy * 100).toFixed(1)}%</span>
            </div>
          )}

          {version.variables.length > 0 && (
            <div className="text-sm">
              <span className="text-muted-foreground">Variables:</span>{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">
                {version.variables.join(', ')}
              </code>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPrompt(!showPrompt)}>
              {showPrompt ? 'Hide' : 'Show'} Prompt
            </Button>

            {version.status === 'candidate' && (
              <>
                <Button
                  size="sm"
                  onClick={() => promoteMutation.mutate()}
                  disabled={promoteMutation.isPending}
                >
                  Promote
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending}
                >
                  Reject
                </Button>
              </>
            )}
          </div>

          {showPrompt && (
            <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto whitespace-pre-wrap">
              {version.prompt_template}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CreateVersionModal({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false)
  const [promptTemplate, setPromptTemplate] = useState('')
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createAgentVersion(agentId, {
        prompt_template: promptTemplate,
        variables: extractVariables(promptTemplate),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
      setOpen(false)
      setPromptTemplate('')
    },
  })

  // Extract {{variable}} patterns from template
  function extractVariables(template: string): string[] {
    const matches = template.match(/\{\{(\w+)\}\}/g) || []
    return [...new Set(matches.map((m) => m.replace(/[{}]/g, '')))]
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">New Version</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Version</DialogTitle>
          <DialogDescription>
            Create a new prompt version manually. Use {'{{variable}}'} syntax for dynamic values.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="prompt">System Prompt Template</Label>
            <Textarea
              id="prompt"
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              placeholder="You are a helpful assistant. Today is {{date}}..."
              className="min-h-[200px] font-mono text-sm"
            />
          </div>
          {promptTemplate && extractVariables(promptTemplate).length > 0 && (
            <div className="text-sm text-muted-foreground">
              Detected variables:{' '}
              <code>{extractVariables(promptTemplate).join(', ')}</code>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!promptTemplate.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AgentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const agentId = params.id as string

  const { data: agent, isLoading, error } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => apiClient.getAgent(agentId),
  })

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-4 w-96 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-red-600">Error loading agent: {error.message}</div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-muted-foreground">Agent not found</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => router.push('/agents')} className="mb-4">
          ← Back to Agents
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{agent.name}</h1>
            <p className="text-muted-foreground">{agent.description || 'No description'}</p>
          </div>
          <CreateVersionModal agentId={agentId} />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Traces</CardDescription>
            <CardTitle className="text-2xl">{agent.metrics.trace_count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Feedback</CardDescription>
            <CardTitle className="text-2xl">{agent.metrics.feedback_count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Evals</CardDescription>
            <CardTitle className="text-2xl">{agent.metrics.eval_count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Accuracy</CardDescription>
            <CardTitle className="text-2xl">
              {agent.metrics.accuracy !== null
                ? `${(agent.metrics.accuracy * 100).toFixed(0)}%`
                : '-'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Versions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Versions</h2>
        {agent.versions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-4">
                No versions yet. Create a version to get started.
              </p>
              <CreateVersionModal agentId={agentId} />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {agent.versions.map((version) => (
              <VersionCard
                key={version.id}
                version={version}
                agentId={agentId}
                isActive={version.id === agent.active_version_id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/app/agents/[id]/page.tsx
git commit -m "feat(frontend): add agent detail page with version management"
```

---

### Task 4.5: Add Agents to Navigation

**Files:**
- Modify: `frontend/components/navigation.tsx`

**Step 1: Add Agents link to navigation**

Find the navigation items array and add:

```tsx
{ href: '/agents', label: 'Agents' },
```

Place it after the home link and before traces/integrations.

**Step 2: Commit**

```bash
git add frontend/components/navigation.tsx
git commit -m "feat(frontend): add agents to navigation"
```

---

## Phase 5: Integration & Testing

### Task 5.1: Create E2E Test for Agents

**Files:**
- Create: `tests/e2e/09-agents/agent-crud.spec.ts`

**Step 1: Write E2E test**

```typescript
// tests/e2e/09-agents/agent-crud.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Agents CRUD', () => {
  test('should create, view, and manage agent versions', async ({ page }) => {
    // Navigate to agents page
    await page.goto('/agents')
    await expect(page.locator('h1')).toContainText('Agents')

    // Create new agent
    await page.click('button:has-text("Create Agent")')
    await page.fill('input[id="name"]', 'Test Agent E2E')
    await page.fill('textarea[id="description"]', 'Test description')
    await page.click('button:has-text("Create")')

    // Verify agent appears in list
    await expect(page.locator('text=Test Agent E2E')).toBeVisible()

    // Click to view agent detail
    await page.click('text=Test Agent E2E')
    await expect(page.locator('h1')).toContainText('Test Agent E2E')

    // Create a version
    await page.click('button:has-text("New Version")')
    await page.fill('textarea[id="prompt"]', 'You are a helpful assistant. Today is {{date}}.')
    await page.click('button:has-text("Create Version")')

    // Verify version appears
    await expect(page.locator('text=Version 1')).toBeVisible()
    await expect(page.locator('text=candidate')).toBeVisible()

    // Promote version
    await page.click('button:has-text("Promote")')
    await expect(page.locator('text=active')).toBeVisible()
  })

  test('should list agents with pending discoveries count', async ({ page }) => {
    await page.goto('/agents')

    // Should show pending_discoveries count if any discovered agents exist
    // This is mainly checking the UI renders correctly
    await expect(page.locator('h1')).toContainText('Agents')
  })
})
```

**Step 2: Run test**

Run: `npx playwright test tests/e2e/09-agents/agent-crud.spec.ts`
Expected: Tests pass (or fail if backend not running)

**Step 3: Commit**

```bash
git add tests/e2e/09-agents/agent-crud.spec.ts
git commit -m "test(e2e): add agent CRUD tests"
```

---

### Task 5.2: Add API Test Commands

**Files:**
- Modify: `docs/API_TEST_COMMANDS.md`

**Step 1: Add agent API test commands**

Append to the file:

```markdown
## Agents API

### Create Agent
```bash
curl -X POST http://localhost:8787/api/agents \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: workspace_default" \
  -d '{"name": "Test Agent", "description": "A test agent"}'
```

### List Agents
```bash
curl http://localhost:8787/api/agents \
  -H "X-Workspace-Id: workspace_default"
```

### Get Agent Details
```bash
curl http://localhost:8787/api/agents/{agent_id} \
  -H "X-Workspace-Id: workspace_default"
```

### Get Agent Prompt (for polling)
```bash
curl http://localhost:8787/api/agents/{agent_id}/prompt \
  -H "X-Workspace-Id: workspace_default"
```

### Create Agent Version
```bash
curl -X POST http://localhost:8787/api/agents/{agent_id}/versions \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: workspace_default" \
  -d '{"prompt_template": "You are a helpful assistant.", "variables": []}'
```

### Promote Version
```bash
curl -X POST http://localhost:8787/api/agents/{agent_id}/versions/1/promote \
  -H "X-Workspace-Id: workspace_default"
```

### Reject Version
```bash
curl -X POST http://localhost:8787/api/agents/{agent_id}/versions/1/reject \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: workspace_default" \
  -d '{"reason": "Prompt too verbose"}'
```
```

**Step 2: Commit**

```bash
git add docs/API_TEST_COMMANDS.md
git commit -m "docs: add agent API test commands"
```

---

## Phase 6: Future Tasks (Documented, Not Implemented)

The following tasks are documented for future implementation:

### Task 6.1: Agent Discovery Job (Future)
- Create `src/jobs/agent-discovery-job.ts`
- Implement trace clustering by system prompt similarity
- Generate extractor/injector functions automatically
- Create agents with status='discovered'

### Task 6.2: Prompt Improvement Job (Future)
- Create `src/jobs/prompt-improvement-job.ts`
- Implement meta-prompt agent for generating improved prompts
- Integrate with prompt best practices database
- Create new agent versions with source='ai_improved'

### Task 6.3: Prompt Evaluation Job (Future)
- Create `src/jobs/prompt-evaluation-job.ts`
- Implement historical trace re-execution with surgical prompt replacement
- Calculate accuracy metrics for new versions
- Support comparison with previous versions

### Task 6.4: Template Drift Detection (Future)
- Add drift detection logic to trace import
- Flag traces that don't match any known agent template
- Update assignment_status to 'orphaned' when appropriate

### Task 6.5: Seed Prompt Best Practices (Future)
- Create seed data for `prompt_best_practices` table
- Source guidelines from OpenAI, Anthropic, Google docs
- Categorize by structure, clarity, safety, reasoning

---

## Summary

This plan covers:

1. **Database Migration** - New tables for agents, versions, functions
2. **TypeScript Types** - Agent type definitions for backend and frontend
3. **Backend API** - Full CRUD for agents and versions, prompt polling endpoint
4. **Frontend UI** - Agents list page, agent detail page with version management
5. **Testing** - E2E tests and API test commands
6. **Documentation** - Future tasks documented for discovery and improvement jobs

**Total Tasks:** 15 implementation tasks across 5 phases

**Estimated Complexity:** Medium-High (significant schema changes, new UI pages)

**Dependencies:**
- Existing eval_sets functionality continues to work during migration
- New agent features are additive, not breaking changes
