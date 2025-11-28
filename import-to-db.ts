import { LangfuseAdapter } from './src/adapters/langfuse';
import Database from 'better-sqlite3';

async function importToDatabase() {
  console.log('🔄 Starting trace import...\n');

  // Initialize Langfuse adapter
  const adapter = new LangfuseAdapter({
    publicKey: 'pk-lf-78e60694-d9e2-493d-bbad-17cbc2374c28',
    secretKey: 'REDACTED_LANGFUSE_KEY',
    baseUrl: 'https://cloud.langfuse.com'
  });

  // Connect to local D1 database
  const db = new Database('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/6ef826d97b2505b4b0e415418e1b50d9afbfb0730d49a2ce016b242f3b77b865.sqlite');

  try {
    // Fetch traces
    console.log('📥 Fetching traces from Langfuse...');
    const traces = await adapter.fetchTraces({ limit: 5 });
    console.log(`✅ Fetched ${traces.length} traces\n`);

    // Get workspace and integration IDs
    const workspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get() as any;
    const integration = db.prepare('SELECT id FROM integrations LIMIT 1').get() as any;

    if (!workspace || !integration) {
      console.error('❌ No workspace or integration found in database');
      return;
    }

    const workspaceId = workspace.id;
    const integrationId = integration.id;

    console.log(`Using workspace: ${workspaceId}`);
    console.log(`Using integration: ${integrationId}\n`);

    // Import each trace
    for (const trace of traces) {
      const traceId = `trc_${crypto.randomUUID()}`;
      const stepsJson = JSON.stringify(trace.steps);

      // Extract preview data
      const inputPreview = extractInputPreview(trace.steps);
      const outputPreview = extractOutputPreview(trace.steps);
      const stepCount = trace.steps.length;
      const hasErrors = trace.steps.some(s => s.error);

      console.log(`📝 Importing trace ${trace.trace_id.substring(0, 8)}... (${stepCount} steps)`);

      // Insert trace
      db.prepare(`
        INSERT INTO traces (
          id, workspace_id, integration_id, trace_id, source,
          steps, timestamp, input_preview, output_preview,
          step_count, has_errors, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        traceId,
        workspaceId,
        integrationId,
        trace.trace_id,
        'langfuse',
        stepsJson,
        new Date().toISOString(),
        inputPreview,
        outputPreview,
        stepCount,
        hasErrors ? 1 : 0,
        new Date().toISOString()
      );

      console.log(`  ✅ Input: ${inputPreview.substring(0, 50)}...`);
      console.log(`  ✅ Output: ${outputPreview.substring(0, 50)}...`);
    }

    console.log(`\n✨ Successfully imported ${traces.length} traces!`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  } finally {
    db.close();
  }
}

function extractInputPreview(steps: any[]): string {
  for (const step of steps) {
    if (step.input && step.input !== 'null') {
      return step.input.substring(0, 200);
    }
    if (step.messages_added?.length > 0) {
      const userMsg = step.messages_added.find((m: any) => m.role === 'user');
      if (userMsg?.content) {
        return userMsg.content.substring(0, 200);
      }
    }
  }
  return 'No input';
}

function extractOutputPreview(steps: any[]): string {
  // Check last steps first
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.output && step.output !== 'null') {
      return step.output.substring(0, 200);
    }
    if (step.messages_added?.length > 0) {
      const aiMsg = step.messages_added.find((m: any) => m.role === 'assistant');
      if (aiMsg?.content) {
        return aiMsg.content.substring(0, 200);
      }
    }
  }
  return 'No output';
}

importToDatabase();
