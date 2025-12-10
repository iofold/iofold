/**
 * Usage Examples for iofold.com API Client
 *
 * These examples demonstrate common workflows using the SDK.
 * Copy and adapt these patterns for your frontend application.
 */

import { IofoldClient, IofoldAPIError } from './api-client';

// ============================================================================
// Initialize Client
// ============================================================================

const client = new IofoldClient(
  process.env.IOFOLD_API_URL || 'https://api.iofold.com/v1',
  process.env.IOFOLD_JWT_TOKEN || 'your_jwt_token',
  process.env.IOFOLD_WORKSPACE_ID || 'workspace_abc123'
);

// ============================================================================
// Example 1: Complete Annotation Workflow
// ============================================================================

async function completeAnnotationWorkflow() {
  console.log('=== Complete Annotation Workflow ===\n');

  try {
    // 1. Connect Langfuse
    console.log('1. Connecting Langfuse integration...');
    const integration = await client.integrations.create({
      platform: 'langfuse',
      api_key: 'sk_lf_...',
      name: 'Production Langfuse',
    });
    console.log('   Integration created:', integration.id);

    // 2. Import traces
    console.log('\n2. Importing traces...');
    const importJob = await client.traces.import({
      integration_id: integration.id,
      filters: {
        date_from: '2025-11-01T00:00:00Z',
        limit: 100,
      },
    });
    console.log('   Import job started:', importJob.job_id);

    // 3. Monitor import progress
    console.log('\n3. Monitoring import progress...');
    for await (const event of client.jobs.stream(importJob.job_id)) {
      console.log(`   Status: ${event.status}, Progress: ${event.progress}%`);

      if (event.status === 'completed') {
        console.log(`   Imported: ${event.imported} traces`);
        break;
      }

      if (event.status === 'failed') {
        console.error('   Import failed:', event.error);
        return;
      }
    }

    // 4. Create agent
    console.log('\n4. Creating agent...');
    const agent = await client.agents.create({
      name: 'response-quality',
      description: 'Checks if responses are helpful and accurate',
    });
    console.log('   Agent created:', agent.id);

    // 5. Real-time agent monitoring would be set up here
    // (streaming support to be implemented for agents)
    console.log('\n5. Agent created, ready for feedback...');

    // 6. Annotate traces with optimistic UI
    console.log('\n6. Annotating traces...');
    const feedbackQueue = client.feedback.createQueue((feedback, status) => {
      console.log(`   Feedback for ${feedback.trace_id}: ${status}`);
    });

    // Fetch and annotate first 10 traces
    let count = 0;
    for await (const trace of client.traces.iterate({ limit: 10 })) {
      await feedbackQueue.submit({
        trace_id: trace.id,
        agent_id: agent.id,
        rating: count % 3 === 0 ? 'positive' : count % 3 === 1 ? 'negative' : 'neutral',
        notes: 'Example annotation',
      });
      count++;
    }

    console.log(`   Submitted ${count} feedbacks`);
    console.log(`   Pending sync: ${feedbackQueue.getPendingCount()}`);

    // Wait for queue to complete
    while (feedbackQueue.getPendingCount() > 0) {
      await sleep(1000);
    }
    console.log('   All feedbacks synced!');

    // Demo complete
    await sleep(1000);
  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Example 2: Generate and Test Eval
// ============================================================================

async function generateEval(agentId: string) {
  console.log('\n=== Generate Eval ===\n');

  try {
    // Generate eval
    console.log('1. Generating eval...');
    const genJob = await client.evals.generate(agentId, {
      name: 'response_quality_check',
      description: 'Automated response quality evaluation',
      model: 'claude-sonnet-4-5-20250929',
      custom_instructions: 'Focus on technical accuracy and completeness',
    });
    console.log('   Generation job started:', genJob.job_id);

    // Monitor generation
    console.log('\n2. Monitoring generation...');
    let evalId: string | undefined;

    for await (const event of client.jobs.stream(genJob.job_id)) {
      console.log(`   Status: ${event.status}, Progress: ${event.progress}%`);

      if (event.status === 'completed') {
        console.log('   Eval generated successfully!');
        console.log('   Eval ID:', event.result.eval_id);
        console.log('   Accuracy:', event.result.accuracy);
        console.log('   Test Results:', event.result.test_results);
        evalId = event.result.eval_id;
        break;
      }

      if (event.status === 'failed') {
        console.error('   Generation failed:', event.error);
        return;
      }
    }

    if (!evalId) {
      console.error('No eval ID returned');
      return;
    }

    // Get eval details
    console.log('\n3. Fetching eval details...');
    const eval_ = await client.evals.get(evalId);
    console.log('   Name:', eval_.name);
    console.log('   Accuracy:', eval_.accuracy);
    console.log('   Code length:', eval_.code.length, 'chars');
    console.log('   Test results:', eval_.test_results);

    // Execute eval on new traces
    console.log('\n4. Executing eval on traces...');
    const execJob = await client.evals.execute(evalId, {
      force: true, // Re-run even if already executed
    });

    for await (const event of client.jobs.stream(execJob.job_id)) {
      if (event.status === 'running') {
        console.log(`   Progress: ${event.completed}/${event.total}`);
      }

      if (event.status === 'completed') {
        console.log('   Execution completed!');
        console.log('   Completed:', event.completed);
        console.log('   Failed:', event.failed);
        break;
      }
    }
  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Example 3: Explore Comparison Matrix
// ============================================================================

async function exploreMatrix() {
  console.log('=== Explore Comparison Matrix ===\n');

  try {
    const agentId = 'agent_abc123';
    const evalIds = ['eval_1', 'eval_2', 'eval_3'];

    // Fetch matrix with contradictions only
    console.log('1. Fetching matrix (contradictions only)...');
    const matrix = await client.matrix.get(agentId, {
      eval_ids: evalIds,
      filter: 'contradictions_only',
      limit: 50,
    });

    console.log('   Total traces:', matrix.stats.total_traces);
    console.log('   Traces with feedback:', matrix.stats.traces_with_feedback);
    console.log('   Contradictions found:', matrix.rows.length);

    // Display stats per eval
    console.log('\n2. Per-eval statistics:');
    for (const [evalId, stats] of Object.entries(matrix.stats.per_eval)) {
      console.log(`   ${stats.eval_name} (${evalId}):`);
      console.log(`     Accuracy: ${stats.accuracy}`);
      console.log(`     Contradictions: ${stats.contradiction_count}`);
      console.log(`     Errors: ${stats.error_count}`);
      console.log(`     Avg exec time: ${stats.avg_execution_time_ms}ms`);
    }

    // Analyze contradictions
    console.log('\n3. Analyzing contradictions:');
    for (const row of matrix.rows.slice(0, 5)) {
      console.log(`\n   Trace: ${row.trace_id}`);
      console.log(`   Human: ${row.human_feedback?.rating}`);
      console.log(`   Input: ${row.trace_summary.input_preview.slice(0, 50)}...`);

      for (const [evalId, pred] of Object.entries(row.predictions)) {
        if (pred && pred.is_contradiction) {
          console.log(`   ⚠️  ${evalId}: predicted ${pred.result}`);
          console.log(`       Reason: ${pred.reason}`);
        }
      }
    }

    // Drill into specific contradiction
    if (matrix.rows.length > 0) {
      const firstRow = matrix.rows[0];
      const firstContradiction = Object.entries(firstRow.predictions).find(
        ([, pred]) => pred?.is_contradiction
      );

      if (firstContradiction) {
        const [evalId] = firstContradiction;
        console.log('\n4. Drilling into first contradiction...');
        const execution = await client.matrix.getExecution(firstRow.trace_id, evalId);
        console.log('   Trace ID:', execution.trace_id);
        console.log('   Eval ID:', execution.eval_id);
        console.log('   Result:', execution.result);
        console.log('   Reason:', execution.reason);
        console.log('   Execution time:', execution.execution_time_ms, 'ms');
        console.log('   Human feedback:', execution.human_feedback?.rating);
        console.log('   Is contradiction:', execution.is_contradiction);

        if (execution.stdout) {
          console.log('   Stdout:', execution.stdout);
        }
        if (execution.stderr) {
          console.log('   Stderr:', execution.stderr);
        }
      }
    }
  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Example 4: Pagination Patterns
// ============================================================================

async function paginationExamples() {
  console.log('=== Pagination Examples ===\n');

  try {
    // Pattern 1: Manual pagination
    console.log('1. Manual pagination:');
    let cursor: string | undefined;
    let pageNum = 0;

    do {
      const result = await client.traces.list({
        cursor,
        limit: 10,
      });

      pageNum++;
      console.log(`   Page ${pageNum}: ${result.traces.length} traces`);

      cursor = result.next_cursor || undefined;
    } while (cursor);

    // Pattern 2: Auto-pagination with async iteration
    console.log('\n2. Auto-pagination (async iteration):');
    let count = 0;
    for await (const trace of client.traces.iterate({ limit: 10 })) {
      count++;
      if (count <= 5) {
        console.log(`   Trace ${count}: ${trace.id}`);
      }
    }
    console.log(`   Total traces: ${count}`);

    // Pattern 3: Fetch all into array (small datasets only)
    console.log('\n3. Fetch all into array:');
    const allTraces = await client.traces.iterate({ limit: 20 }).toArray();
    console.log(`   Fetched ${allTraces.length} traces into array`);
  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Example 5: Error Handling
// ============================================================================

async function errorHandlingExample() {
  console.log('=== Error Handling ===\n');

  try {
    // This will fail with 404
    await client.traces.get('invalid_trace_id');
  } catch (error) {
    if (error instanceof IofoldAPIError) {
      console.log('API Error caught:');
      console.log('  Code:', error.code);
      console.log('  Message:', error.message);
      console.log('  Status:', error.status);
      console.log('  Request ID:', error.requestId);
      console.log('  Details:', error.details);
      console.log('  Is retryable:', error.isRetryable());

      // Handle specific error codes
      switch (error.code) {
        case 'NOT_FOUND':
          console.log('  → Resource does not exist');
          break;
        case 'RATE_LIMIT_EXCEEDED':
          console.log('  → Too many requests, backing off...');
          await sleep(2000);
          break;
        case 'UNAUTHORIZED':
          console.log('  → Authentication failed, check token');
          break;
        default:
          console.log('  → Unexpected error');
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

// ============================================================================
// Example 6: Real-Time Job Monitoring
// ============================================================================

async function jobMonitoringExample() {
  console.log('=== Job Monitoring ===\n');

  try {
    // Start an import job
    const integration = await client.integrations.list();
    if (integration.integrations.length === 0) {
      console.log('No integrations available');
      return;
    }

    const job = await client.traces.import({
      integration_id: integration.integrations[0].id,
      filters: { limit: 10 },
    });

    console.log('Job started:', job.job_id);

    // Pattern 1: Async iteration (recommended)
    console.log('\n1. Monitoring with async iteration:');
    for await (const event of client.jobs.stream(job.job_id)) {
      console.log(`   [${event.status}] Progress: ${event.progress}%`);

      if (event.status === 'completed' || event.status === 'failed') {
        break;
      }
    }

    // Pattern 2: Event-based API
    console.log('\n2. Monitoring with event-based API:');
    const stream = client.jobs.streamEvents(job.job_id);

    stream.on('progress', (data) => {
      console.log(`   Progress: ${data.progress}%`);
    });

    stream.on('completed', (data) => {
      console.log('   Job completed!', data);
      stream.close();
    });

    stream.on('failed', (data) => {
      console.error('   Job failed:', data.error);
      stream.close();
    });

    stream.connect();

    // Wait for stream to complete
    await sleep(10000);
  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function handleError(error: unknown) {
  if (error instanceof IofoldAPIError) {
    console.error('\n[API Error]', error.code, '-', error.message);
    console.error('Request ID:', error.requestId);
    if (error.details) {
      console.error('Details:', JSON.stringify(error.details, null, 2));
    }
  } else {
    console.error('\n[Unexpected Error]', error);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log('iofold.com API Client - Usage Examples\n');
  console.log('======================================\n');

  // Uncomment the example you want to run:

  // await completeAnnotationWorkflow();
  // await generateEval('agent_abc123');
  // await exploreMatrix();
  // await paginationExamples();
  // await errorHandlingExample();
  // await jobMonitoringExample();

  console.log('\nExamples completed!');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

// Export for use in other modules
export {
  completeAnnotationWorkflow,
  generateEval,
  exploreMatrix,
  paginationExamples,
  errorHandlingExample,
  jobMonitoringExample,
};
