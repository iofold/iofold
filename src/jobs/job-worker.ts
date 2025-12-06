import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { JobManager } from './job-manager';
import type { Job, JobType } from '../types/api';
import { TraceImportJob } from './trace-import-job';
import { EvalGenerationJob } from './eval-generation-job';
import { EvalExecutionJob } from './eval-execution-job';

export interface JobWorkerDeps {
  db: D1Database;
  anthropicApiKey?: string;
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
  encryptionKey: string;
}

export class JobWorker {
  private manager: JobManager;
  private db: D1Database;
  private anthropicApiKey?: string;
  private sandboxBinding?: DurableObjectNamespace<Sandbox>;
  private encryptionKey: string;

  constructor(deps: JobWorkerDeps) {
    this.db = deps.db;
    this.anthropicApiKey = deps.anthropicApiKey;
    this.sandboxBinding = deps.sandboxBinding;
    this.encryptionKey = deps.encryptionKey;
    this.manager = new JobManager(deps.db);
  }

  /**
   * Process pending jobs (public method called via ctx.waitUntil)
   * This is the Cloudflare Workers pattern - jobs are processed on each request,
   * not via background polling.
   */
  async processJobs(): Promise<void> {
    try {
      await this.processPendingJobs();
    } catch (error) {
      console.error('[JobWorker] Error processing jobs:', error);
    }
  }

  /**
   * Process all pending jobs
   */
  private async processPendingJobs(): Promise<void> {
    // Fetch all queued jobs across all workspaces
    const result = await this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE status = 'queued'
         ORDER BY created_at ASC
         LIMIT 10`
      )
      .all();

    if (!result.results || result.results.length === 0) {
      return;
    }

    console.log(`[JobWorker] Processing ${result.results.length} queued job(s)`);

    // Process each job sequentially (simple implementation)
    for (const jobRecord of result.results) {
      try {
        console.log(`[JobWorker] Starting job ${jobRecord.id} (${jobRecord.type})`);
        const job = this.jobFromRecord(jobRecord);
        await this.processJob(job);
        console.log(`[JobWorker] Completed job ${jobRecord.id}`);
      } catch (error) {
        console.error(`[JobWorker] Failed job ${jobRecord.id}:`, error);
      }
    }
  }

  /**
   * Process a single job based on its type
   */
  private async processJob(job: Job): Promise<void> {
    // Mark as running
    await this.manager.updateJobStatus(job.id, 'running', 0);

    try {
      // Execute job based on type
      switch (job.type) {
        case 'import':
          await this.processImportJob(job);
          break;
        case 'generate':
          await this.processGenerateJob(job);
          break;
        case 'execute':
          await this.processExecuteJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      // Mark as completed
      await this.manager.completeJob(job.id, { success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[JobWorker] Job ${job.id} failed: ${message}`);
      await this.manager.failJob(job.id, message);
    }
  }

  /**
   * Process trace import job
   */
  private async processImportJob(job: Job): Promise<void> {
    // Get job metadata
    const metadata = await this.manager.getJobMetadata(job.id);
    if (!metadata) {
      throw new Error('Job metadata not found');
    }

    // Extract integration_id and filters from metadata
    const integrationId = (metadata as any).integration_id;
    const filters = (metadata as any).filters;
    const workspaceId = metadata.workspaceId;

    if (!integrationId || !workspaceId) {
      throw new Error('Missing required job metadata: integration_id or workspaceId');
    }

    // Create and execute TraceImportJob
    const importJob = new TraceImportJob(
      {
        jobId: job.id,
        integrationId,
        workspaceId,
        filters
      },
      {
        db: this.db,
        encryptionKey: this.encryptionKey
      }
    );

    await importJob.execute();
  }

  /**
   * Process eval generation job
   */
  private async processGenerateJob(job: Job): Promise<void> {
    if (!this.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Get job metadata
    const metadata = await this.manager.getJobMetadata(job.id);
    if (!metadata) {
      throw new Error('Job metadata not found');
    }

    const agentId = (metadata as any).agent_id;
    const name = (metadata as any).name;
    const description = (metadata as any).description;
    const model = (metadata as any).model;
    const customInstructions = (metadata as any).custom_instructions;
    const workspaceId = metadata.workspaceId;

    if (!agentId || !name || !workspaceId) {
      throw new Error('Missing required job metadata: agent_id, name, or workspaceId');
    }

    // Create and execute EvalGenerationJob
    const genJob = new EvalGenerationJob(
      {
        jobId: job.id,
        agentId,
        name,
        description,
        model,
        customInstructions,
        workspaceId
      },
      {
        db: this.db,
        anthropicApiKey: this.anthropicApiKey,
        sandboxBinding: this.sandboxBinding
      }
    );

    await genJob.execute();
  }

  /**
   * Process eval execution job
   */
  private async processExecuteJob(job: Job): Promise<void> {
    // Get job metadata
    const metadata = await this.manager.getJobMetadata(job.id);
    if (!metadata) {
      throw new Error('Job metadata not found');
    }

    const evalId = (metadata as any).eval_id;
    const traceIds = (metadata as any).trace_ids;
    const workspaceId = metadata.workspaceId;

    if (!evalId || !workspaceId) {
      throw new Error('Missing required job metadata: eval_id or workspaceId');
    }

    // Create and execute EvalExecutionJob
    const execJob = new EvalExecutionJob(
      {
        jobId: job.id,
        evalId,
        traceIds,
        workspaceId
      },
      {
        db: this.db,
        sandboxBinding: this.sandboxBinding
      }
    );

    await execJob.execute();
  }

  /**
   * Helper to convert database record to Job type
   */
  private jobFromRecord(record: any): Job {
    return {
      id: record.id as string,
      workspace_id: record.workspace_id as string,
      type: record.type as JobType,
      status: record.status as 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
      progress: record.progress as number,
      created_at: record.created_at as string,
      started_at: record.started_at as string | null,
      completed_at: record.completed_at as string | null,
      result: record.result ? JSON.parse(record.result as string) : undefined,
      error: record.error as string | undefined
    };
  }
}
