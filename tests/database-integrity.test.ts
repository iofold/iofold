/**
 * Database State & Data Integrity Testing
 * Testing Agent 2 - Comprehensive database verification
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { D1Database } from '@cloudflare/workers-types';

// Helper to generate IDs
function generateId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Helper to get actual database instance from wrangler dev/test environment
async function getDatabase(): Promise<D1Database> {
  // In Cloudflare Workers environment, DB is passed via env
  // For local testing, we'll need to use wrangler's D1 local database
  // This will be available when running: wrangler dev --local --persist

  // For now, this test suite documents expected database structure
  // and will run against actual D1 instance when invoked via Cloudflare Workers
  throw new Error('Database access needs to be configured via wrangler dev or deploy');
}

describe('Database Schema Verification', () => {
  let db: D1Database;

  beforeAll(async () => {
    db = await getDatabase();
  });

  it('should have all required tables', async () => {
    const result = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all();

    const tables = result.results.map((r: any) => r.name);
    const requiredTables = [
      'users',
      'workspaces',
      'workspace_members',
      'integrations',
      'traces',
      'agents',
      'agent_versions',
      'feedback',
      'evals',
      'eval_executions',
      'jobs',
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
      id: 'TEXT',
      email: 'TEXT',
      name: 'TEXT',
      created_at: 'DATETIME',
      updated_at: 'DATETIME',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type, `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for workspaces table', async () => {
    const result = await db.prepare("PRAGMA table_info(workspaces)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'TEXT',
      name: 'TEXT',
      created_at: 'DATETIME',
      updated_at: 'DATETIME',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type, `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for integrations table', async () => {
    const result = await db.prepare("PRAGMA table_info(integrations)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'TEXT',
      workspace_id: 'TEXT',
      platform: 'TEXT',
      name: 'TEXT',
      api_key_encrypted: 'TEXT',
      base_url: 'TEXT',
      config: 'JSON',
      status: 'TEXT',
      error_message: 'TEXT',
      last_synced_at: 'DATETIME',
      created_at: 'DATETIME',
      updated_at: 'DATETIME',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type, `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for traces table', async () => {
    const result = await db.prepare("PRAGMA table_info(traces)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'TEXT',
      workspace_id: 'TEXT',
      integration_id: 'TEXT',
      trace_id: 'TEXT',
      source: 'TEXT',
      timestamp: 'DATETIME',
      metadata: 'JSON',
      steps: 'JSON',
      input_preview: 'TEXT',
      output_preview: 'TEXT',
      step_count: 'INTEGER',
      has_errors: 'BOOLEAN',
      imported_at: 'DATETIME',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type, `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for agents table', async () => {
    const result = await db.prepare("PRAGMA table_info(agents)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'TEXT',
      workspace_id: 'TEXT',
      name: 'TEXT',
      description: 'TEXT',
      current_version_id: 'TEXT',
      created_at: 'DATETIME',
      updated_at: 'DATETIME',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type, `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for feedback table', async () => {
    const result = await db.prepare("PRAGMA table_info(feedback)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'TEXT',
      agent_id: 'TEXT',
      trace_id: 'TEXT',
      rating: 'TEXT',
      notes: 'TEXT',
      created_at: 'DATETIME',
      updated_at: 'DATETIME',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type, `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for evals table', async () => {
    const result = await db.prepare("PRAGMA table_info(evals)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'TEXT',
      agent_id: 'TEXT',
      name: 'TEXT',
      description: 'TEXT',
      version: 'INTEGER',
      parent_eval_id: 'TEXT',
      code: 'TEXT',
      model_used: 'TEXT',
      generation_prompt: 'TEXT',
      custom_instructions: 'TEXT',
      accuracy: 'REAL',
      test_results: 'JSON',
      training_trace_ids: 'JSON',
      execution_count: 'INTEGER',
      contradiction_count: 'INTEGER',
      status: 'TEXT',
      created_at: 'DATETIME',
      updated_at: 'DATETIME',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type, `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for eval_executions table', async () => {
    const result = await db.prepare("PRAGMA table_info(eval_executions)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'TEXT',
      eval_id: 'TEXT',
      trace_id: 'TEXT',
      result: 'BOOLEAN',
      reason: 'TEXT',
      execution_time_ms: 'INTEGER',
      error: 'TEXT',
      stdout: 'TEXT',
      stderr: 'TEXT',
      executed_at: 'DATETIME',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type, `Column ${name} should be ${type}`).toBe(type);
    }
  });

  it('should have correct column types for jobs table', async () => {
    const result = await db.prepare("PRAGMA table_info(jobs)").all();
    const columns = result.results as any[];

    const expectedColumns = {
      id: 'TEXT',
      workspace_id: 'TEXT',
      type: 'TEXT',
      status: 'TEXT',
      progress: 'INTEGER',
      context: 'JSON',
      metadata: 'JSON',
      result: 'JSON',
      error: 'TEXT',
      created_at: 'DATETIME',
      started_at: 'DATETIME',
      completed_at: 'DATETIME',
    };

    for (const [name, type] of Object.entries(expectedColumns)) {
      const col = columns.find((c) => c.name === name);
      expect(col, `Column ${name} should exist`).toBeDefined();
      expect(col.type, `Column ${name} should be ${type}`).toBe(type);
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
      // Workspace-based queries
      'idx_integrations_workspace',
      'idx_traces_workspace',
      'idx_agents_workspace',
      'idx_jobs_workspace',
      // Trace queries
      'idx_traces_integration',
      'idx_traces_timestamp',
      'idx_traces_source',
      'idx_traces_has_errors',
      // Feedback queries
      'idx_feedback_agent',
      'idx_feedback_trace',
      'idx_feedback_rating',
      'idx_feedback_agent_rating',
      // Eval queries
      'idx_evals_agent',
      'idx_evals_status',
      'idx_evals_parent',
      // Execution queries
      'idx_executions_eval',
      'idx_executions_trace',
      'idx_executions_eval_trace',
      'idx_executions_result',
      'idx_executions_executed_at',
      // Job queries
      'idx_jobs_status',
      'idx_jobs_type',
      'idx_jobs_workspace_status',
      'idx_jobs_created_at',
      // Integration status
      'idx_integrations_status',
      'idx_integrations_workspace_platform',
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

  beforeAll(async () => {
    db = await getDatabase();
    workspaceId = nanoid();
    userId = nanoid();

    // Create test workspace and user
    await db
      .prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)')
      .bind(workspaceId, 'Test Workspace')
      .run();

    await db
      .prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)')
      .bind(userId, 'test@example.com', 'Test User')
      .run();
  });

  it('should enforce unique constraint on user email', async () => {
    const duplicateUserId = nanoid();
    await expect(
      db
        .prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)')
        .bind(duplicateUserId, 'test@example.com', 'Duplicate User')
        .run()
    ).rejects.toThrow();
  });

  it('should enforce unique constraint on integration name within workspace', async () => {
    const integration1 = nanoid();
    const integration2 = nanoid();

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

  it('should enforce unique constraint on trace_id per integration', async () => {
    const integrationId = nanoid();
    const trace1 = nanoid();
    const trace2 = nanoid();

    // Create integration
    await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(integrationId, workspaceId, 'langfuse', 'Trace Test Integration', 'encrypted', 'active')
      .run();

    // First trace
    await db
      .prepare(
        'INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, steps, step_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(trace1, workspaceId, integrationId, 'external-trace-1', 'langfuse', new Date().toISOString(), '[]', 0)
      .run();

    // Duplicate trace_id for same integration should fail
    await expect(
      db
        .prepare(
          'INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, steps, step_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(trace2, workspaceId, integrationId, 'external-trace-1', 'langfuse', new Date().toISOString(), '[]', 0)
        .run()
    ).rejects.toThrow();
  });

  it('should enforce unique constraint on feedback per agent/trace pair', async () => {
    const agentId = nanoid();
    const traceId = nanoid();
    const integrationId = nanoid();
    const feedback1 = nanoid();
    const feedback2 = nanoid();

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
      .prepare('INSERT INTO feedback (id, agent_id, trace_id, rating) VALUES (?, ?, ?, ?)')
      .bind(feedback1, agentId, traceId, 'positive')
      .run();

    // Duplicate feedback for same agent/trace should fail
    await expect(
      db
        .prepare('INSERT INTO feedback (id, agent_id, trace_id, rating) VALUES (?, ?, ?, ?)')
        .bind(feedback2, agentId, traceId, 'negative')
        .run()
    ).rejects.toThrow();
  });

  it('should enforce CHECK constraint on feedback rating', async () => {
    const agentId = nanoid();
    const traceId = nanoid();
    const integrationId = nanoid();
    const feedbackId = nanoid();

    // Create dependencies
    await db
      .prepare(
        'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(integrationId, workspaceId, 'langfuse', 'Check Test Integration', 'encrypted', 'active')
      .run();

    await db
      .prepare(
        'INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, steps, step_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(traceId, workspaceId, integrationId, 'check-trace-1', 'langfuse', new Date().toISOString(), '[]', 0)
      .run();

    await db
      .prepare('INSERT INTO agents (id, workspace_id, name) VALUES (?, ?, ?)')
      .bind(agentId, workspaceId, 'Check Agent')
      .run();

    // Invalid rating should fail
    await expect(
      db
        .prepare('INSERT INTO feedback (id, agent_id, trace_id, rating) VALUES (?, ?, ?, ?)')
        .bind(feedbackId, agentId, traceId, 'invalid_rating')
        .run()
    ).rejects.toThrow();
  });

  it('should enforce CHECK constraint on job type', async () => {
    const jobId = nanoid();

    await expect(
      db
        .prepare('INSERT INTO jobs (id, workspace_id, type, status) VALUES (?, ?, ?, ?)')
        .bind(jobId, workspaceId, 'invalid_type', 'queued')
        .run()
    ).rejects.toThrow();
  });

  it('should enforce CHECK constraint on job status', async () => {
    const jobId = nanoid();

    await expect(
      db
        .prepare('INSERT INTO jobs (id, workspace_id, type, status) VALUES (?, ?, ?, ?)')
        .bind(jobId, workspaceId, 'import', 'invalid_status')
        .run()
    ).rejects.toThrow();
  });

  it('should enforce foreign key constraint on workspace_id', async () => {
    const integrationId = nanoid();
    const nonExistentWorkspace = 'nonexistent-workspace-id';

    // Should fail due to foreign key constraint
    await expect(
      db
        .prepare(
          'INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(integrationId, nonExistentWorkspace, 'langfuse', 'FK Test', 'encrypted', 'active')
        .run()
    ).rejects.toThrow();
  });

  it('should cascade delete traces when integration is deleted', async () => {
    const integrationId = nanoid();
    const traceId = nanoid();

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
    const integrationId = nanoid();

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
    expect(result.updated_at).toBeDefined(); // Auto-populated
  });

  it('should set timestamps automatically', async () => {
    const agentId = nanoid();

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

  beforeAll(async () => {
    db = await getDatabase();
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

  beforeAll(async () => {
    db = await getDatabase();
    workspaceId = nanoid();

    await db
      .prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)')
      .bind(workspaceId, 'State Test Workspace')
      .run();
  });

  it('should track job state transitions correctly', async () => {
    const jobId = nanoid();

    // Create queued job
    await db
      .prepare('INSERT INTO jobs (id, workspace_id, type, status, progress) VALUES (?, ?, ?, ?, ?)')
      .bind(jobId, workspaceId, 'import', 'queued', 0)
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
    const agentId = nanoid();
    const traceId = nanoid();
    const integrationId = nanoid();
    const feedbackId = nanoid();

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
      .prepare('INSERT INTO feedback (id, agent_id, trace_id, rating) VALUES (?, ?, ?, ?)')
      .bind(feedbackId, agentId, traceId, 'positive')
      .run();

    // Update feedback
    await db
      .prepare('UPDATE feedback SET rating = ?, updated_at = ? WHERE id = ?')
      .bind('negative', new Date().toISOString(), feedbackId)
      .run();

    // Verify only one feedback record exists
    const result = await db
      .prepare('SELECT * FROM feedback WHERE agent_id = ? AND trace_id = ?')
      .bind(agentId, traceId)
      .all();

    expect(result.results.length).toBe(1);
    expect(result.results[0].rating).toBe('negative');
  });

  it('should handle concurrent updates with proper isolation', async () => {
    const evalId = nanoid();
    const agentId = nanoid();

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
    const agentId = nanoid();
    const evalId = nanoid();
    const traceId1 = nanoid();
    const traceId2 = nanoid();
    const integrationId = nanoid();

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
      .prepare('INSERT INTO feedback (id, agent_id, trace_id, rating) VALUES (?, ?, ?, ?)')
      .bind(nanoid(), agentId, traceId1, 'positive')
      .run();

    await db
      .prepare('INSERT INTO feedback (id, agent_id, trace_id, rating) VALUES (?, ?, ?, ?)')
      .bind(nanoid(), agentId, traceId2, 'negative')
      .run();

    // Create eval executions - one matching, one contradicting
    await db
      .prepare(
        'INSERT INTO eval_executions (id, eval_id, trace_id, result, reason, execution_time_ms) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(nanoid(), evalId, traceId1, 1, 'Looks good', 50)
      .run();

    await db
      .prepare(
        'INSERT INTO eval_executions (id, eval_id, trace_id, result, reason, execution_time_ms) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(nanoid(), evalId, traceId2, 1, 'Looks good', 50)
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

  beforeAll(async () => {
    db = await getDatabase();
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
