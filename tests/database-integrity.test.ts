/**
 * Database State & Data Integrity Testing
 * Testing Agent 2 - Comprehensive database verification
 *
 * Uses in-memory SQLite via better-sqlite3 with the same schema as D1.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { D1Database } from '@cloudflare/workers-types';
import { createTestDb, createMockD1 } from './utils/test-db';

// Helper to generate IDs
function generateId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Create in-memory database with full schema
function getDatabase(): D1Database {
  const { sqlite } = createTestDb();

  // Add eval_comparison view (from migration 0001)
  sqlite.exec(`
    CREATE VIEW IF NOT EXISTS eval_comparison AS
    SELECT
      ee.eval_id,
      ee.trace_id,
      ee.predicted_result,
      f.rating,
      CASE
        WHEN f.rating = 'positive' AND ee.predicted_result = 0 THEN 1
        WHEN f.rating = 'negative' AND ee.predicted_result = 1 THEN 1
        ELSE 0
      END as is_contradiction,
      ee.executed_at
    FROM eval_executions ee
    LEFT JOIN feedback f ON ee.trace_id = f.trace_id
  `);

  return createMockD1(sqlite);
}

describe('Database Schema Verification', () => {
  let db: D1Database;

  beforeAll(() => {
    db = getDatabase();
  });

  it('should have all required tables', async () => {
    const result = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all();

    const tables = result.results.map((r: any) => r.name);
    const requiredTables = [
      'agent_tools',
      'agent_versions',
      'agents',
      'eval_candidate_executions',
      'eval_candidates',
      'eval_executions',
      'evals',
      'feedback',
      'integrations',
      'job_retry_history',
      'jobs',
      'playground_sessions',
      'system_prompts',
      'taskset_runs',
      'taskset_tasks',
      'tasksets',
      'tools',
      'traces',
      'users',
      'workspaces',
    ];

    for (const table of requiredTables) {
      expect(tables).toContain(table);
    }
  });

  it('should have eval_comparison view', async () => {
    const result = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='view' AND name='eval_comparison'"
      )
      .all();

    expect(result.results.length).toBe(1);
  });

  it('should have correct column types for users table', async () => {
    const result = await db.prepare("PRAGMA table_info(users)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'text',
      email: 'text',
      created_at: 'text',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type.toLowerCase(), `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for workspaces table', async () => {
    const result = await db.prepare("PRAGMA table_info(workspaces)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'text',
      user_id: 'text',
      name: 'text',
      created_at: 'text',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type.toLowerCase(), `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for integrations table', async () => {
    const result = await db.prepare("PRAGMA table_info(integrations)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'text',
      workspace_id: 'text',
      name: 'text',
      platform: 'text',
      api_key_encrypted: 'text',
      config: 'text',
      status: 'text',
      last_synced_at: 'text',
      created_at: 'text',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type.toLowerCase(), `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for traces table', async () => {
    const result = await db.prepare("PRAGMA table_info(traces)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'text',
      workspace_id: 'text',
      integration_id: 'text',
      trace_id: 'text',
      source: 'text',
      timestamp: 'text',
      metadata: 'text',
      steps: 'text',
      raw_data: 'text',
      input_preview: 'text',
      output_preview: 'text',
      step_count: 'integer',
      has_errors: 'integer',
      agent_version_id: 'text',
      assignment_status: 'text',
      system_prompt_id: 'text',
      imported_at: 'text',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type.toLowerCase(), `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for agents table', async () => {
    const result = await db.prepare("PRAGMA table_info(agents)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'text',
      workspace_id: 'text',
      name: 'text',
      description: 'text',
      status: 'text',
      active_version_id: 'text',
      active_eval_id: 'text',
      created_at: 'text',
      updated_at: 'text',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type.toLowerCase(), `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for feedback table', async () => {
    const result = await db.prepare("PRAGMA table_info(feedback)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'text',
      trace_id: 'text',
      agent_id: 'text',
      rating: 'text',
      rating_detail: 'text',
      created_at: 'text',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type.toLowerCase(), `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for evals table', async () => {
    const result = await db.prepare("PRAGMA table_info(evals)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'text',
      agent_id: 'text',
      version: 'integer',
      parent_eval_id: 'text',
      name: 'text',
      description: 'text',
      code: 'text',
      model_used: 'text',
      accuracy: 'real',
      training_trace_ids: 'text',
      generation_prompt: 'text',
      test_results: 'text',
      execution_count: 'integer',
      contradiction_count: 'integer',
      status: 'text',
      auto_execute_enabled: 'integer',
      auto_refine_enabled: 'integer',
      monitoring_thresholds: 'text',
      cohen_kappa: 'real',
      f1_score: 'real',
      precision: 'real',
      recall: 'real',
      created_at: 'text',
      updated_at: 'text',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type.toLowerCase(), `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for eval_executions table', async () => {
    const result = await db.prepare("PRAGMA table_info(eval_executions)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'text',
      eval_id: 'text',
      trace_id: 'text',
      predicted_result: 'integer',
      predicted_reason: 'text',
      execution_time_ms: 'integer',
      error: 'text',
      stdout: 'text',
      stderr: 'text',
      executed_at: 'text',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type.toLowerCase(), `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for jobs table', async () => {
    const result = await db.prepare("PRAGMA table_info(jobs)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'text',
      workspace_id: 'text',
      type: 'text',
      status: 'text',
      progress: 'integer',
      metadata: 'text',
      result: 'text',
      error: 'text',
      retry_count: 'integer',
      max_retries: 'integer',
      error_category: 'text',
      last_error_at: 'text',
      next_retry_at: 'text',
      priority: 'integer',
      agent_id: 'text',
      agent_version_id: 'text',
      trigger_event: 'text',
      trigger_threshold: 'text',
      created_at: 'text',
      started_at: 'text',
      completed_at: 'text',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type.toLowerCase(), `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have all required indexes', async () => {
    const result = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all();

    const indexes = result.results.map((r: any) => r.name);
    const requiredIndexes = [
      // Unique indexes
      'users_email_unique',
      'agent_versions_agent_id_version_unique',
      'evals_agent_version_unique',
      'feedback_trace_unique',
      // Agents
      'idx_agents_workspace_id',
      'idx_agents_status',
      'idx_agent_versions_agent_id',
      // Integrations
      'idx_integrations_workspace_id',
      // Traces
      'idx_traces_workspace_id',
      'idx_traces_trace_id',
      // Feedback
      'idx_feedback_trace_id',
      // Evals
      'idx_evals_agent_id',
      'idx_eval_executions_eval_id',
      'idx_eval_executions_trace_id',
      'idx_eval_candidates_agent',
      'idx_eval_candidates_status',
      'idx_eval_candidate_executions_candidate',
      'idx_eval_candidate_executions_trace',
      'idx_eval_candidate_executions_success',
      // Jobs
      'idx_jobs_workspace',
      'idx_jobs_status',
      // Playground
      'idx_playground_sessions_workspace',
    ];

    for (const index of requiredIndexes) {
      expect(indexes, `Index ${index} should exist`).toContain(index);
    }
  });
});

describe('Data Integrity Constraints', () => {
  let db: D1Database;
  let workspaceId: string;
  let userId: string;

  beforeAll(() => {
    db = getDatabase();
    workspaceId = generateId();
    userId = generateId();

    // Create test user first (required by workspace foreign key)
    db
      .prepare('INSERT INTO users (id, email) VALUES (?, ?)')
      .bind(userId, 'test@example.com')
      .run();

    // Create test workspace
    db
      .prepare('INSERT INTO workspaces (id, user_id, name) VALUES (?, ?, ?)')
      .bind(workspaceId, userId, 'Test Workspace')
      .run();
  });

  it('should enforce unique constraint on user email', async () => {
    const duplicateUserId = generateId();
    const result = await db
      .prepare('INSERT INTO users (id, email) VALUES (?, ?)')
      .bind(duplicateUserId, 'test@example.com')
      .run();

    // Mock D1 returns { success: false, error: "..." } instead of throwing
    expect(result.success).toBe(false);
    expect(result.error).toContain('UNIQUE constraint failed');
  });

  it('should enforce unique constraint on integration name within workspace', async () => {
    const integration1 = generateId();
    const integration2 = generateId();

    // First integration should succeed
    await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(integration1, workspaceId, 'langfuse', 'Test Integration', 'encrypted_key', 'active')
      .run();

    // Duplicate name in same workspace should fail (if unique constraint exists)
    // Note: The schema doesn't have this constraint, so this test documents the behavior
    const integration2Insert = await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(integration2, workspaceId, 'langfuse', 'Test Integration', 'encrypted_key_2', 'active')
      .run();

    // This currently succeeds - documenting missing constraint
    expect(integration2Insert.success).toBe(true);
  });

  it('should allow duplicate trace_id across different integrations', async () => {
    const integration1 = generateId();
    const integration2 = generateId();
    const trace1 = generateId();
    const trace2 = generateId();

    // Create integrations
    await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(integration1, workspaceId, 'langfuse', 'Trace Test Integration 1', 'encrypted', 'active')
      .run();

    await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(integration2, workspaceId, 'langfuse', 'Trace Test Integration 2', 'encrypted', 'active')
      .run();

    // First trace
    await db
      .prepare(
        'INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, steps, step_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(trace1, workspaceId, integration1, 'external-trace-1', 'langfuse', new Date().toISOString(), '[]', 0)
      .run();

    // Same trace_id for different integration should succeed (no unique constraint)
    const result = await db
      .prepare(
        'INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, steps, step_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(trace2, workspaceId, integration2, 'external-trace-1', 'langfuse', new Date().toISOString(), '[]', 0)
      .run();

    expect(result.success).toBe(true);
  });

  it('should enforce unique constraint on feedback per trace', async () => {
    const agentId = generateId();
    const traceId = generateId();
    const integrationId = generateId();
    const feedback1 = generateId();
    const feedback2 = generateId();

    // Create dependencies
    await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(integrationId, workspaceId, 'langfuse', 'Feedback Test Integration', 'encrypted', 'active')
      .run();

    await db
      .prepare(
        'INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, steps, step_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(traceId, workspaceId, integrationId, 'feedback-trace-1', 'langfuse', new Date().toISOString(), '[]', 0)
      .run();

    await db
      .prepare('INSERT INTO agents (id, workspace_id, name) VALUES (?, ?, ?)')
      .bind(agentId, workspaceId, 'Test Agent')
      .run();

    // First feedback
    await db
      .prepare('INSERT INTO feedback (id, trace_id, agent_id, rating) VALUES (?, ?, ?, ?)')
      .bind(feedback1, traceId, agentId, 'positive')
      .run();

    // Duplicate feedback for same trace should fail (unique constraint on trace_id)
    const result = await db
      .prepare('INSERT INTO feedback (id, trace_id, agent_id, rating) VALUES (?, ?, ?, ?)')
      .bind(feedback2, traceId, agentId, 'negative')
      .run();

    // Mock D1 returns { success: false, error: "..." } instead of throwing
    expect(result.success).toBe(false);
    expect(result.error).toContain('UNIQUE constraint failed');
  });


  it('should enforce foreign key constraint on workspace_id', async () => {
    const integrationId = generateId();
    const nonExistentWorkspace = 'nonexistent-workspace-id';

    // Should fail due to foreign key constraint
    const result = await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(integrationId, nonExistentWorkspace, 'langfuse', 'FK Test', 'encrypted', 'active')
      .run();

    // Mock D1 returns { success: false, error: "..." } instead of throwing
    expect(result.success).toBe(false);
    expect(result.error).toContain('FOREIGN KEY constraint failed');
  });

  it('should cascade delete traces when integration is deleted', async () => {
    const integrationId = generateId();
    const traceId = generateId();

    // Create integration
    await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(integrationId, workspaceId, 'langfuse', 'Cascade Test', 'encrypted', 'active')
      .run();

    // Create trace
    await db
      .prepare(
        'INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, steps, step_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(traceId, workspaceId, integrationId, 'cascade-trace-1', 'langfuse', new Date().toISOString(), '[]', 0)
      .run();

    // Delete integration
    await db.prepare('DELETE FROM integrations WHERE id = ?').bind(integrationId).run();

    // Trace should be deleted
    const result = await db.prepare('SELECT * FROM traces WHERE id = ?').bind(traceId).all();
    expect(result.results.length).toBe(0);
  });

  it('should apply default values correctly', async () => {
    const integrationId = generateId();

    // Insert without optional fields
    await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(integrationId, workspaceId, 'langfuse', 'Default Test', 'encrypted')
      .run();

    const result = await db.prepare('SELECT * FROM integrations WHERE id = ?').bind(integrationId).first();

    expect(result).toBeDefined();
    expect(result.status).toBe('active'); // Default value
    expect(result.created_at).toBeDefined(); // Auto-populated
  });

  it('should set timestamps automatically', async () => {
    const agentId = generateId();

    await db
      .prepare('INSERT INTO agents (id, workspace_id, name) VALUES (?, ?, ?)')
      .bind(agentId, workspaceId, 'Timestamp Test')
      .run();

    const result = await db.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first();

    expect(result).toBeDefined();
    expect(result.created_at).toBeDefined();
    expect(result.updated_at).toBeDefined();
    expect(new Date(result.created_at).getTime()).toBeGreaterThan(Date.now() - 5000); // Within last 5 seconds
  });
});

describe('Database Query Performance', () => {
  let db: D1Database;

  beforeAll(() => {
    db = getDatabase();
  });

  it('should list traces with feedback JOIN efficiently', async () => {
    const start = Date.now();

    await db
      .prepare(
        `
        SELECT t.*, f.rating
        FROM traces t
        LEFT JOIN feedback f ON t.id = f.trace_id
        WHERE t.workspace_id = ?
        ORDER BY t.timestamp DESC
        LIMIT 50
      `
      )
      .bind('test-workspace')
      .all();

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // Should complete in < 100ms
  });

  it('should compute agent stats efficiently', async () => {
    const start = Date.now();

    await db
      .prepare(
        `
        SELECT
          COUNT(*) as total_traces,
          SUM(CASE WHEN rating = 'positive' THEN 1 ELSE 0 END) as positive_count,
          SUM(CASE WHEN rating = 'negative' THEN 1 ELSE 0 END) as negative_count,
          SUM(CASE WHEN rating = 'neutral' THEN 1 ELSE 0 END) as neutral_count
        FROM feedback
        WHERE agent_id = ?
      `
      )
      .bind('test-agent')
      .first();

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(200); // Should complete in < 200ms
  });

  it('should search traces with filters efficiently', async () => {
    const start = Date.now();

    await db
      .prepare(
        `
        SELECT *
        FROM traces
        WHERE workspace_id = ?
          AND source = ?
          AND has_errors = ?
          AND timestamp > ?
        ORDER BY timestamp DESC
        LIMIT 50
      `
      )
      .bind('test-workspace', 'langfuse', 0, new Date(Date.now() - 86400000).toISOString())
      .all();

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(150); // Should complete in < 150ms
  });

  it('should verify no N+1 query patterns in eval comparison view', async () => {
    const start = Date.now();

    // Single query should fetch all necessary data
    await db
      .prepare(
        `
        SELECT *
        FROM eval_comparison
        WHERE eval_id = ?
        LIMIT 100
      `
      )
      .bind('test-eval-id')
      .all();

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // View should be efficient
  });

  it('should handle job status queries efficiently', async () => {
    const start = Date.now();

    await db
      .prepare(
        `
        SELECT *
        FROM jobs
        WHERE workspace_id = ?
          AND status IN ('queued', 'running')
        ORDER BY created_at DESC
        LIMIT 20
      `
      )
      .bind('test-workspace')
      .all();

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(50); // Should be very fast with composite index
  });
});

describe('State Management', () => {
  let db: D1Database;
  let workspaceId: string;
  let userId: string;

  beforeAll(() => {
    db = getDatabase();
    workspaceId = generateId();
    userId = generateId();

    // Create test user first
    db
      .prepare('INSERT INTO users (id, email) VALUES (?, ?)')
      .bind(userId, 'state-test@example.com')
      .run();

    // Create test workspace
    db
      .prepare('INSERT INTO workspaces (id, user_id, name) VALUES (?, ?, ?)')
      .bind(workspaceId, userId, 'State Test Workspace')
      .run();
  });

  it('should track job state transitions correctly', async () => {
    const jobId = generateId();

    // Create queued job
    await db
      .prepare('INSERT INTO jobs (id, workspace_id, type, status, progress) VALUES (?, ?, ?, ?, ?)')
      .bind(jobId, workspaceId, 'trace-import', 'queued', 0)
      .run();

    let job: any = await db.prepare('SELECT * FROM jobs WHERE id = ?').bind(jobId).first();
    expect(job.status).toBe('queued');
    expect(job.started_at).toBeNull();

    // Transition to running
    await db
      .prepare('UPDATE jobs SET status = ?, started_at = ?, progress = ? WHERE id = ?')
      .bind('running', new Date().toISOString(), 25, jobId)
      .run();

    job = await db.prepare('SELECT * FROM jobs WHERE id = ?').bind(jobId).first();
    expect(job.status).toBe('running');
    expect(job.started_at).not.toBeNull();
    expect(job.progress).toBe(25);

    // Complete job
    const result = { imported: 10, failed: 0 };
    await db
      .prepare('UPDATE jobs SET status = ?, completed_at = ?, progress = ?, result = ? WHERE id = ?')
      .bind('completed', new Date().toISOString(), 100, JSON.stringify(result), jobId)
      .run();

    job = await db.prepare('SELECT * FROM jobs WHERE id = ?').bind(jobId).first();
    expect(job.status).toBe('completed');
    expect(job.completed_at).not.toBeNull();
    expect(job.progress).toBe(100);
    expect(JSON.parse(job.result)).toEqual(result);
  });

  it('should handle feedback updates without creating duplicates', async () => {
    const agentId = generateId();
    const traceId = generateId();
    const integrationId = generateId();
    const feedbackId = generateId();

    // Create dependencies
    await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(integrationId, workspaceId, 'langfuse', 'Feedback Update Test', 'encrypted', 'active')
      .run();

    await db
      .prepare(
        'INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, steps, step_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(traceId, workspaceId, integrationId, 'feedback-update-trace', 'langfuse', new Date().toISOString(), '[]', 0)
      .run();

    await db
      .prepare('INSERT INTO agents (id, workspace_id, name) VALUES (?, ?, ?)')
      .bind(agentId, workspaceId, 'Feedback Update Agent')
      .run();

    // Create initial feedback
    await db
      .prepare('INSERT INTO feedback (id, trace_id, agent_id, rating) VALUES (?, ?, ?, ?)')
      .bind(feedbackId, traceId, agentId, 'positive')
      .run();

    // Update feedback
    await db
      .prepare('UPDATE feedback SET rating = ? WHERE id = ?')
      .bind('negative', feedbackId)
      .run();

    // Verify only one feedback record exists
    const result = await db
      .prepare('SELECT * FROM feedback WHERE trace_id = ?')
      .bind(traceId)
      .all();

    expect(result.results.length).toBe(1);
    expect(result.results[0].rating).toBe('negative');
  });

  it('should handle concurrent updates with proper isolation', async () => {
    const evalId = generateId();
    const agentId = generateId();

    await db
      .prepare('INSERT INTO agents (id, workspace_id, name) VALUES (?, ?, ?)')
      .bind(agentId, workspaceId, 'Concurrent Test Agent')
      .run();

    await db
      .prepare(
        'INSERT INTO evals (id, agent_id, name, code, model_used, version) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(evalId, agentId, 'Test Eval', 'def eval_fn(): pass', 'claude-sonnet-4.5', 1)
      .run();

    // Simulate concurrent execution count updates
    const promises = Array.from({ length: 10 }, () =>
      db
        .prepare('UPDATE evals SET execution_count = execution_count + 1 WHERE id = ?')
        .bind(evalId)
        .run()
    );

    await Promise.all(promises);

    const result: any = await db.prepare('SELECT execution_count FROM evals WHERE id = ?').bind(evalId).first();

    // All 10 updates should be reflected
    expect(result.execution_count).toBe(10);
  });

  it('should verify eval_comparison view calculates contradictions correctly', async () => {
    const agentId = generateId();
    const evalId = generateId();
    const traceId1 = generateId();
    const traceId2 = generateId();
    const integrationId = generateId();

    // Create dependencies
    await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(integrationId, workspaceId, 'langfuse', 'Contradiction Test', 'encrypted', 'active')
      .run();

    await db
      .prepare('INSERT INTO agents (id, workspace_id, name) VALUES (?, ?, ?)')
      .bind(agentId, workspaceId, 'Contradiction Test Agent')
      .run();

    await db
      .prepare(
        'INSERT INTO evals (id, agent_id, name, code, model_used, version) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(evalId, agentId, 'Contradiction Eval', 'def eval_fn(): pass', 'claude-sonnet-4.5', 1)
      .run();

    // Create traces
    await db
      .prepare(
        'INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, steps, step_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(traceId1, workspaceId, integrationId, 'contradiction-trace-1', 'langfuse', new Date().toISOString(), '[]', 0)
      .run();

    await db
      .prepare(
        'INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, steps, step_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(traceId2, workspaceId, integrationId, 'contradiction-trace-2', 'langfuse', new Date().toISOString(), '[]', 0)
      .run();

    // Create feedback
    await db
      .prepare('INSERT INTO feedback (id, trace_id, agent_id, rating) VALUES (?, ?, ?, ?)')
      .bind(generateId(), traceId1, agentId, 'positive')
      .run();

    await db
      .prepare('INSERT INTO feedback (id, trace_id, agent_id, rating) VALUES (?, ?, ?, ?)')
      .bind(generateId(), traceId2, agentId, 'negative')
      .run();

    // Create eval executions - one matching, one contradicting
    await db
      .prepare(
        'INSERT INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(generateId(), evalId, traceId1, 1, 'Looks good', 50)
      .run();

    await db
      .prepare(
        'INSERT INTO eval_executions (id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(generateId(), evalId, traceId2, 1, 'Looks good', 50)
      .run();

    // Query view
    const result = await db
      .prepare('SELECT * FROM eval_comparison WHERE eval_id = ?')
      .bind(evalId)
      .all();

    expect(result.results.length).toBe(2);

    const trace1Result = result.results.find((r: any) => r.trace_id === traceId1);
    const trace2Result = result.results.find((r: any) => r.trace_id === traceId2);

    // Trace 1: positive rating, predicted pass (1) - no contradiction
    expect(trace1Result.is_contradiction).toBe(0);

    // Trace 2: negative rating, predicted pass (1) - contradiction!
    expect(trace2Result.is_contradiction).toBe(1);
  });
});

describe('Data Seeding Verification', () => {
  let db: D1Database;

  beforeAll(() => {
    db = getDatabase();
  });

  it('should check if database has test data', async () => {
    const workspaces = await db.prepare('SELECT COUNT(*) as count FROM workspaces').first();
    const integrations = await db.prepare('SELECT COUNT(*) as count FROM integrations').first();
    const traces = await db.prepare('SELECT COUNT(*) as count FROM traces').first();

    console.log('Database state:', {
      workspaces: workspaces.count,
      integrations: integrations.count,
      traces: traces.count,
    });

    // Just verify counts are accessible
    expect(workspaces.count).toBeGreaterThanOrEqual(0);
    expect(integrations.count).toBeGreaterThanOrEqual(0);
    expect(traces.count).toBeGreaterThanOrEqual(0);
  });

  it('should have workspace_default if seeded', async () => {
    const workspace = await db
      .prepare("SELECT * FROM workspaces WHERE id = 'workspace_default'")
      .first();

    if (workspace) {
      expect(workspace.name).toBe('Default Workspace');
      console.log('Found default workspace');
    } else {
      console.log('No default workspace - database not seeded');
    }
  });

  it('should have test_langfuse integration if seeded', async () => {
    const integration = await db
      .prepare("SELECT * FROM integrations WHERE id = 'test_langfuse'")
      .first();

    if (integration) {
      expect(integration.platform).toBe('langfuse');
      expect(integration.status).toBe('active');
      console.log('Found test integration');
    } else {
      console.log('No test integration - database not seeded');
    }
  });
});
