#!/usr/bin/env bun
/**
 * CLI script to trigger eval generation jobs on-demand for testing
 *
 * Usage:
 *   bun scripts/trigger-eval-job.ts --agent <agent_id> [options]
 *
 * Options:
 *   --agent, -a     Agent ID (required)
 *   --name, -n      Eval name (default: "Test Eval")
 *   --process, -p   Process queued jobs after triggering (for local dev)
 *   --watch, -w     Watch job progress via streaming
 *   --list, -l      List recent jobs instead of creating one
 *   --help, -h      Show help
 *
 * Examples:
 *   bun scripts/trigger-eval-job.ts -a agent_test_1 -n "Quality Check" -w
 *   bun scripts/trigger-eval-job.ts --list
 *   bun scripts/trigger-eval-job.ts -a agent_test_1 -p
 */

const API_BASE = process.env.API_URL || 'http://dev4:8787';

interface JobResponse {
  job_id: string;
  status: string;
  message?: string;
}

interface Job {
  id: string;
  type: string;
  status: string;
  progress: number;
  created_at: string;
  completed_at?: string;
  error?: string;
  result?: any;
}

async function listJobs(limit = 10): Promise<void> {
  console.log(`\nFetching recent jobs from ${API_BASE}...\n`);

  const res = await fetch(`${API_BASE}/api/jobs?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to list jobs: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { jobs: Job[] };

  if (data.jobs.length === 0) {
    console.log('No jobs found.');
    return;
  }

  console.log('Recent Jobs:');
  console.log('─'.repeat(80));

  for (const job of data.jobs) {
    const status = job.status.padEnd(10);
    const type = job.type.padEnd(15);
    const progress = `${job.progress}%`.padStart(4);
    const time = new Date(job.created_at).toLocaleTimeString();

    const statusColor = {
      completed: '\x1b[32m', // green
      failed: '\x1b[31m',    // red
      running: '\x1b[33m',   // yellow
      queued: '\x1b[36m',    // cyan
    }[job.status] || '\x1b[0m';

    console.log(`${statusColor}${status}\x1b[0m ${type} ${progress}  ${job.id}  (${time})`);

    if (job.error) {
      console.log(`         \x1b[31mError: ${job.error.slice(0, 60)}...\x1b[0m`);
    }
  }
  console.log('─'.repeat(80));
}

async function triggerEvalGeneration(agentId: string, name: string): Promise<string> {
  console.log(`\nTriggering eval generation for agent: ${agentId}`);
  console.log(`Eval name: ${name}`);
  console.log(`API: ${API_BASE}`);

  const res = await fetch(`${API_BASE}/api/agents/${agentId}/generate-eval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: `Test eval generated at ${new Date().toISOString()}`,
      model: 'anthropic/claude-sonnet-4-5',
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to trigger eval: ${res.status} - ${error}`);
  }

  const data = await res.json() as JobResponse;
  console.log(`\n✓ Job created: ${data.job_id}`);
  console.log(`  Status: ${data.status}`);

  return data.job_id;
}

async function processQueuedJobs(): Promise<void> {
  console.log('\nProcessing queued jobs...');

  const res = await fetch(`${API_BASE}/api/jobs/process`, {
    method: 'POST',
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to process jobs: ${res.status} - ${error}`);
  }

  const data = await res.json() as { processed: number; before_queued: number; after_queued: number };
  console.log(`✓ Processed ${data.processed} jobs`);
  console.log(`  Before: ${data.before_queued} queued, After: ${data.after_queued} queued`);
}

async function watchJob(jobId: string): Promise<void> {
  console.log(`\nWatching job: ${jobId}`);
  console.log('─'.repeat(50));

  const eventSource = new EventSource(`${API_BASE}/api/jobs/${jobId}/stream`);

  return new Promise((resolve, reject) => {
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const progress = `[${('█'.repeat(Math.floor(data.progress / 5)) + '░'.repeat(20 - Math.floor(data.progress / 5))).slice(0, 20)}]`;

        process.stdout.write(`\r${progress} ${data.progress}% - ${data.status}    `);

        if (data.status === 'completed') {
          console.log('\n\n✓ Job completed successfully!');
          if (data.result) {
            console.log('Result:', JSON.stringify(data.result, null, 2));
          }
          eventSource.close();
          resolve();
        } else if (data.status === 'failed') {
          console.log('\n\n✗ Job failed!');
          if (data.error) {
            console.log('Error:', data.error);
          }
          eventSource.close();
          resolve();
        }
      } catch (e) {
        // Ignore parse errors for heartbeat messages
      }
    };

    eventSource.onerror = (error) => {
      console.error('\nStream error:', error);
      eventSource.close();
      reject(error);
    };

    // Timeout after 5 minutes
    setTimeout(() => {
      console.log('\n\nTimeout reached, closing stream');
      eventSource.close();
      resolve();
    }, 5 * 60 * 1000);
  });
}

async function getJobStatus(jobId: string): Promise<Job> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(`Failed to get job: ${res.status}`);
  }
  return res.json() as Promise<Job>;
}

async function pollJobStatus(jobId: string): Promise<void> {
  console.log(`\nPolling job status: ${jobId}`);
  console.log('─'.repeat(50));

  let lastProgress = -1;

  while (true) {
    const job = await getJobStatus(jobId);

    if (job.progress !== lastProgress) {
      const progress = `[${('█'.repeat(Math.floor(job.progress / 5)) + '░'.repeat(20 - Math.floor(job.progress / 5))).slice(0, 20)}]`;
      process.stdout.write(`\r${progress} ${job.progress}% - ${job.status}    `);
      lastProgress = job.progress;
    }

    if (job.status === 'completed') {
      console.log('\n\n✓ Job completed successfully!');
      if (job.result) {
        console.log('Result:', JSON.stringify(job.result, null, 2));
      }
      break;
    } else if (job.status === 'failed') {
      console.log('\n\n✗ Job failed!');
      if (job.error) {
        console.log('Error:', job.error);
      }
      break;
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}

function printHelp(): void {
  console.log(`
Eval Job Trigger - Test eval generation on-demand

Usage:
  bun scripts/trigger-eval-job.ts [options]

Options:
  --agent, -a <id>    Agent ID to generate eval for (required unless --list)
  --name, -n <name>   Eval name (default: "Test Eval")
  --process, -p       Process queued jobs (for local dev without queue)
  --watch, -w         Watch job progress after triggering
  --list, -l          List recent jobs
  --help, -h          Show this help

Examples:
  # Trigger eval generation and watch progress
  bun scripts/trigger-eval-job.ts -a agent_test_1 -w

  # Trigger and process immediately (local dev)
  bun scripts/trigger-eval-job.ts -a agent_test_1 -p -w

  # List recent jobs
  bun scripts/trigger-eval-job.ts -l

Environment:
  API_URL             API base URL (default: http://dev4:8787)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let agentId: string | null = null;
  let evalName = 'Test Eval';
  let shouldProcess = false;
  let shouldWatch = false;
  let shouldList = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--agent':
      case '-a':
        agentId = args[++i];
        break;
      case '--name':
      case '-n':
        evalName = args[++i];
        break;
      case '--process':
      case '-p':
        shouldProcess = true;
        break;
      case '--watch':
      case '-w':
        shouldWatch = true;
        break;
      case '--list':
      case '-l':
        shouldList = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  try {
    if (shouldList) {
      await listJobs();
      return;
    }

    if (!agentId) {
      console.error('Error: --agent is required');
      printHelp();
      process.exit(1);
    }

    const jobId = await triggerEvalGeneration(agentId, evalName);

    if (shouldProcess) {
      await processQueuedJobs();
    }

    if (shouldWatch) {
      // Use polling instead of SSE for better compatibility
      await pollJobStatus(jobId);
    }
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
