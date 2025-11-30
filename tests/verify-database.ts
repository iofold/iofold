/**
 * Database State & Data Integrity Verification Script
 * Testing Agent 2 - Run via: wrangler dev --local --persist
 *
 * This script can be invoked as a Worker endpoint to verify database state
 */

export interface Env {
  DB: D1Database;
}

interface VerificationResult {
  test: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/verify-database') {
      const results = await verifyDatabase(env.DB);
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Use /verify-database to run database tests', { status: 404 });
  },
};

async function verifyDatabase(db: D1Database): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  // Test 1: Schema Verification
  try {
    const tables = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all();

    const tableNames = tables.results.map((r: any) => r.name);
    const requiredTables = [
      'users', 'workspaces', 'workspace_members', 'integrations', 'traces',
      'agents', 'feedback', 'evals', 'eval_executions', 'jobs'
    ];

    const missingTables = requiredTables.filter(t => !tableNames.includes(t));

    if (missingTables.length === 0) {
      results.push({
        test: 'Schema - All required tables exist',
        status: 'pass',
        message: `All ${requiredTables.length} required tables found`,
        details: tableNames,
      });
    } else {
      results.push({
        test: 'Schema - All required tables exist',
        status: 'fail',
        message: `Missing tables: ${missingTables.join(', ')}`,
        details: { found: tableNames, missing: missingTables },
      });
    }
  } catch (error: any) {
    results.push({
      test: 'Schema - All required tables exist',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 2: View Verification
  try {
    const views = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='view' AND name='eval_comparison'")
      .all();

    if (views.results.length === 1) {
      results.push({
        test: 'Schema - eval_comparison view exists',
        status: 'pass',
        message: 'View found',
      });
    } else {
      results.push({
        test: 'Schema - eval_comparison view exists',
        status: 'fail',
        message: 'View not found',
      });
    }
  } catch (error: any) {
    results.push({
      test: 'Schema - eval_comparison view exists',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 3: Index Verification
  try {
    const indexes = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all();

    const indexNames = indexes.results.map((r: any) => r.name);
    const criticalIndexes = [
      'idx_traces_workspace',
      'idx_traces_integration',
      'idx_feedback_agent',
      'idx_executions_eval_trace',
      'idx_jobs_workspace_status',
    ];

    const missingIndexes = criticalIndexes.filter(i => !indexNames.includes(i));

    if (missingIndexes.length === 0) {
      results.push({
        test: 'Schema - Critical indexes exist',
        status: 'pass',
        message: `All critical indexes found (${indexNames.length} total indexes)`,
        details: indexNames,
      });
    } else {
      results.push({
        test: 'Schema - Critical indexes exist',
        status: 'warning',
        message: `Missing indexes: ${missingIndexes.join(', ')}`,
        details: { found: indexNames, missing: missingIndexes },
      });
    }
  } catch (error: any) {
    results.push({
      test: 'Schema - Critical indexes exist',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 4: Column Type Verification (sample tables)
  try {
    const usersColumns = await db.prepare("PRAGMA table_info(users)").all();
    const columns = usersColumns.results as any[];

    const expectedColumns = {
      id: 'TEXT',
      email: 'TEXT',
      created_at: 'DATETIME',
    };

    const columnIssues: string[] = [];
    for (const [name, expectedType] of Object.entries(expectedColumns)) {
      const col = columns.find((c: any) => c.name === name);
      if (!col) {
        columnIssues.push(`Missing column: ${name}`);
      } else if (col.type !== expectedType) {
        columnIssues.push(`Column ${name} has type ${col.type}, expected ${expectedType}`);
      }
    }

    if (columnIssues.length === 0) {
      results.push({
        test: 'Schema - Column types correct (users table)',
        status: 'pass',
        message: 'All checked columns have correct types',
      });
    } else {
      results.push({
        test: 'Schema - Column types correct (users table)',
        status: 'fail',
        message: columnIssues.join('; '),
      });
    }
  } catch (error: any) {
    results.push({
      test: 'Schema - Column types correct (users table)',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 5: Data Seeding Status
  try {
    const workspaceCount = await db.prepare("SELECT COUNT(*) as count FROM workspaces").first() as any;
    const integrationCount = await db.prepare("SELECT COUNT(*) as count FROM integrations").first() as any;
    const traceCount = await db.prepare("SELECT COUNT(*) as count FROM traces").first() as any;

    const hasData = workspaceCount.count > 0 || integrationCount.count > 0 || traceCount.count > 0;

    results.push({
      test: 'Data - Seeding status',
      status: hasData ? 'pass' : 'warning',
      message: hasData ? 'Database contains data' : 'Database is empty (not seeded)',
      details: {
        workspaces: workspaceCount.count,
        integrations: integrationCount.count,
        traces: traceCount.count,
      },
    });
  } catch (error: any) {
    results.push({
      test: 'Data - Seeding status',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 6: Default Workspace Verification
  try {
    const defaultWorkspace = await db
      .prepare("SELECT * FROM workspaces WHERE id = 'workspace_default'")
      .first();

    if (defaultWorkspace) {
      results.push({
        test: 'Data - Default workspace exists',
        status: 'pass',
        message: 'workspace_default found',
        details: defaultWorkspace,
      });
    } else {
      results.push({
        test: 'Data - Default workspace exists',
        status: 'warning',
        message: 'workspace_default not found (database may not be seeded)',
      });
    }
  } catch (error: any) {
    results.push({
      test: 'Data - Default workspace exists',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 7: Foreign Key Enforcement
  try {
    const foreignKeys = await db.prepare("PRAGMA foreign_keys").first() as any;

    if (foreignKeys && foreignKeys.foreign_keys === 1) {
      results.push({
        test: 'Constraints - Foreign keys enabled',
        status: 'pass',
        message: 'Foreign key enforcement is active',
      });
    } else {
      results.push({
        test: 'Constraints - Foreign keys enabled',
        status: 'fail',
        message: 'Foreign key enforcement is NOT enabled',
      });
    }
  } catch (error: any) {
    results.push({
      test: 'Constraints - Foreign keys enabled',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 8: Unique Constraints Verification
  try {
    const testId = `test_${Date.now()}`;
    const testEmail = `test_${Date.now()}@example.com`;

    // Try to insert a user
    await db
      .prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)')
      .bind(testId, testEmail, 'Test User')
      .run();

    // Try to insert duplicate email - should fail
    let duplicateFailed = false;
    try {
      await db
        .prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)')
        .bind(`${testId}_2`, testEmail, 'Duplicate User')
        .run();
    } catch (e) {
      duplicateFailed = true;
    }

    // Clean up
    await db.prepare('DELETE FROM users WHERE id = ?').bind(testId).run();

    if (duplicateFailed) {
      results.push({
        test: 'Constraints - Unique constraint on user email',
        status: 'pass',
        message: 'Duplicate email correctly rejected',
      });
    } else {
      results.push({
        test: 'Constraints - Unique constraint on user email',
        status: 'fail',
        message: 'Duplicate email was NOT rejected',
      });
    }
  } catch (error: any) {
    results.push({
      test: 'Constraints - Unique constraint on user email',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 9: CHECK Constraints Verification
  try {
    const testId = `test_${Date.now()}`;
    const workspaceId = 'workspace_default'; // Use default workspace if seeded

    // Try to insert job with invalid status - should fail
    let checkFailed = false;
    try {
      await db
        .prepare('INSERT INTO jobs (id, workspace_id, type, status) VALUES (?, ?, ?, ?)')
        .bind(testId, workspaceId, 'import', 'invalid_status')
        .run();
    } catch (e) {
      checkFailed = true;
    }

    if (checkFailed) {
      results.push({
        test: 'Constraints - CHECK constraint on job status',
        status: 'pass',
        message: 'Invalid status correctly rejected',
      });
    } else {
      // Clean up if it somehow succeeded
      await db.prepare('DELETE FROM jobs WHERE id = ?').bind(testId).run();

      results.push({
        test: 'Constraints - CHECK constraint on job status',
        status: 'fail',
        message: 'Invalid status was NOT rejected',
      });
    }
  } catch (error: any) {
    results.push({
      test: 'Constraints - CHECK constraint on job status',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 10: Query Performance Check
  try {
    const start = Date.now();

    // Run a complex join query
    await db
      .prepare(`
        SELECT t.*, f.rating
        FROM traces t
        LEFT JOIN feedback f ON t.id = f.trace_id
        ORDER BY t.timestamp DESC
        LIMIT 50
      `)
      .all();

    const duration = Date.now() - start;

    if (duration < 100) {
      results.push({
        test: 'Performance - Trace listing with feedback JOIN',
        status: 'pass',
        message: `Query completed in ${duration}ms (target: <100ms)`,
      });
    } else if (duration < 200) {
      results.push({
        test: 'Performance - Trace listing with feedback JOIN',
        status: 'warning',
        message: `Query completed in ${duration}ms (target: <100ms)`,
      });
    } else {
      results.push({
        test: 'Performance - Trace listing with feedback JOIN',
        status: 'fail',
        message: `Query took ${duration}ms (target: <100ms) - missing indexes?`,
      });
    }
  } catch (error: any) {
    results.push({
      test: 'Performance - Trace listing with feedback JOIN',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 11: Eval Comparison View Verification
  try {
    // Try to query the view
    const comparison = await db
      .prepare('SELECT * FROM eval_comparison LIMIT 1')
      .all();

    results.push({
      test: 'Views - eval_comparison is queryable',
      status: 'pass',
      message: 'View can be queried successfully',
      details: comparison.results.length > 0 ? 'Contains data' : 'Empty (no executions yet)',
    });
  } catch (error: any) {
    results.push({
      test: 'Views - eval_comparison is queryable',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 12: JSON Column Verification
  try {
    const traces = await db
      .prepare('SELECT metadata, steps FROM traces LIMIT 1')
      .all();

    if (traces.results.length > 0) {
      const trace = traces.results[0] as any;

      // Verify JSON columns can be parsed
      const metadataValid = trace.metadata === null || typeof JSON.parse(trace.metadata) === 'object';
      const stepsValid = typeof JSON.parse(trace.steps) === 'object';

      if (metadataValid && stepsValid) {
        results.push({
          test: 'Data - JSON columns are valid',
          status: 'pass',
          message: 'JSON columns can be parsed correctly',
        });
      } else {
        results.push({
          test: 'Data - JSON columns are valid',
          status: 'fail',
          message: 'JSON columns contain invalid data',
        });
      }
    } else {
      results.push({
        test: 'Data - JSON columns are valid',
        status: 'warning',
        message: 'No traces to verify (database empty)',
      });
    }
  } catch (error: any) {
    results.push({
      test: 'Data - JSON columns are valid',
      status: 'fail',
      message: error.message,
    });
  }

  // Test 13: Cascade Delete Verification
  try {
    const testWorkspaceId = `test_ws_${Date.now()}`;
    const testIntegrationId = `test_int_${Date.now()}`;
    const testTraceId = `test_trace_${Date.now()}`;

    // Create test workspace
    await db
      .prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)')
      .bind(testWorkspaceId, 'Test Workspace')
      .run();

    // Create test integration
    await db
      .prepare('INSERT INTO integrations (id, workspace_id, platform, name, api_key_encrypted, status) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(testIntegrationId, testWorkspaceId, 'langfuse', 'Test Integration', 'encrypted', 'active')
      .run();

    // Create test trace
    await db
      .prepare('INSERT INTO traces (id, workspace_id, integration_id, trace_id, source, timestamp, steps, step_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(testTraceId, testWorkspaceId, testIntegrationId, 'external-1', 'langfuse', new Date().toISOString(), '[]', 0)
      .run();

    // Delete integration
    await db.prepare('DELETE FROM integrations WHERE id = ?').bind(testIntegrationId).run();

    // Verify trace was cascade deleted
    const remainingTrace = await db.prepare('SELECT * FROM traces WHERE id = ?').bind(testTraceId).first();

    // Clean up
    await db.prepare('DELETE FROM workspaces WHERE id = ?').bind(testWorkspaceId).run();

    if (!remainingTrace) {
      results.push({
        test: 'Constraints - CASCADE DELETE works',
        status: 'pass',
        message: 'Traces are deleted when parent integration is deleted',
      });
    } else {
      results.push({
        test: 'Constraints - CASCADE DELETE works',
        status: 'fail',
        message: 'Traces were NOT deleted when parent was deleted',
      });
    }
  } catch (error: any) {
    results.push({
      test: 'Constraints - CASCADE DELETE works',
      status: 'fail',
      message: error.message,
    });
  }

  // Summary
  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    warnings: results.filter(r => r.status === 'warning').length,
  };

  results.unshift({
    test: 'SUMMARY',
    status: summary.failed === 0 ? 'pass' : 'fail',
    message: `${summary.passed} passed, ${summary.failed} failed, ${summary.warnings} warnings`,
    details: summary,
  });

  return results;
}
