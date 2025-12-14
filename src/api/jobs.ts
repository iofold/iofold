import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { createDb, type Database } from '../db/client';
import { jobs } from '../db/schema';
import { JobManager } from '../jobs/job-manager';
import { JobWorker } from '../jobs/job-worker';
import { createAPIError, handleError, notFoundError } from '../utils/errors';
import { SSEStream, createSSEResponse } from '../utils/sse';
import type { Job } from '../types/api';

// Request schemas
const ListJobsSchema = z.object({
  type: z.enum(['import', 'generate', 'execute']).optional(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20)
});

export interface JobsAPIDeps {
  db: D1Database;
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
  encryptionKey?: string;
  /** Cloudflare Account ID for AI Gateway */
  cfAccountId: string;
  /** Cloudflare AI Gateway ID */
  cfGatewayId: string;
  /** Optional AI Gateway authentication token */
  cfGatewayToken?: string;
}

export class JobsAPI {
  private jobManager: JobManager;
  private db: D1Database;
  private sandboxBinding?: DurableObjectNamespace<Sandbox>;
  private encryptionKey: string;
  private cfAccountId: string;
  private cfGatewayId: string;
  private cfGatewayToken?: string;

  constructor(deps: JobsAPIDeps | D1Database) {
    // Support legacy constructor signature
    if ('prepare' in deps) {
      this.db = deps;
      this.encryptionKey = 'default-dev-key';
      this.cfAccountId = '';
      this.cfGatewayId = '';
    } else {
      this.db = deps.db;
      this.sandboxBinding = deps.sandboxBinding;
      this.encryptionKey = deps.encryptionKey || 'default-dev-key';
      this.cfAccountId = deps.cfAccountId;
      this.cfGatewayId = deps.cfGatewayId;
      this.cfGatewayToken = deps.cfGatewayToken;
    }
    this.jobManager = new JobManager(this.db);
  }

  // GET /api/jobs/:id - Get job status
  async getJob(jobId: string, workspaceId?: string): Promise<Response> {
    try {
      const job = await this.jobManager.getJob(jobId);

      if (!job) {
        return notFoundError('Job', jobId);
      }

      // Verify workspace ownership if workspaceId provided
      if (workspaceId && job.workspace_id !== workspaceId) {
        return notFoundError('Job', jobId);
      }

      return new Response(JSON.stringify(job), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return handleError(error);
    }
  }

  // GET /api/jobs/:id/stream - Stream job progress via SSE
  async streamJob(jobId: string, workspaceId?: string): Promise<Response> {
    try {
      const job = await this.jobManager.getJob(jobId);

      if (!job) {
        return notFoundError('Job', jobId);
      }

      // Verify workspace ownership if workspaceId provided
      if (workspaceId && job.workspace_id !== workspaceId) {
        return notFoundError('Job', jobId);
      }

      const stream = new SSEStream();
      const readableStream = stream.createStream();

      // Send initial status
      stream.sendProgress({
        status: job.status,
        progress: job.progress
      });

      // If job is already completed/failed, send final event and close
      if (job.status === 'completed') {
        stream.sendCompleted(job.result);
        setTimeout(() => stream.close(), 100);
      } else if (job.status === 'failed') {
        stream.sendFailed(job.error || 'Job failed', '');
        setTimeout(() => stream.close(), 100);
      } else if (job.status === 'cancelled') {
        stream.sendFailed('Job cancelled', '');
        setTimeout(() => stream.close(), 100);
      } else if (job.status === 'queued') {
        // Check if job has been queued for too long (stale job detection)
        const createdAt = new Date(job.created_at);
        const now = new Date();
        const ageMs = now.getTime() - createdAt.getTime();
        const STALE_THRESHOLD_MS = 30000; // 30 seconds

        if (ageMs > STALE_THRESHOLD_MS) {
          // Job is stale - likely no queue worker processing it
          stream.sendFailed('Job timed out', 'Job was queued but never started. This may happen in local development without a queue worker.');
          setTimeout(() => stream.close(), 100);
        } else {
          // Poll for updates (in a real implementation, this would be event-driven)
          this.pollJobUpdates(jobId, stream);
        }
      } else {
        // Poll for updates (in a real implementation, this would be event-driven)
        this.pollJobUpdates(jobId, stream);
      }

      return createSSEResponse(readableStream);
    } catch (error) {
      console.error('Stream job error:', error);
      return handleError(error);
    }
  }

  // POST /api/jobs/:id/cancel - Cancel a running job
  async cancelJob(jobId: string, workspaceId?: string): Promise<Response> {
    try {
      // Verify ownership before cancellation
      if (workspaceId) {
        const job = await this.jobManager.getJob(jobId);
        if (!job) {
          return notFoundError('Job', jobId);
        }
        if (job.workspace_id !== workspaceId) {
          return notFoundError('Job', jobId);
        }
      }

      const success = await this.jobManager.cancelJob(jobId);

      if (!success) {
        return new Response(
          JSON.stringify({
            error: 'Cannot cancel job - either not found or already completed'
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      const job = await this.jobManager.getJob(jobId);

      return new Response(
        JSON.stringify({
          id: job!.id,
          status: job!.status
        }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      return handleError(error);
    }
  }

  // GET /api/jobs - List recent jobs
  async listJobs(workspaceId: string, queryParams: URLSearchParams): Promise<Response> {
    try {
      const params = {
        type: queryParams.get('type') || undefined,
        status: queryParams.get('status') || undefined,
        limit: queryParams.get('limit') ? parseInt(queryParams.get('limit')!) : undefined
      };

      const validated = ListJobsSchema.parse(params);

      const jobs = await this.jobManager.listJobs(workspaceId, {
        type: validated.type,
        status: validated.status,
        limit: validated.limit
      });

      return new Response(
        JSON.stringify({ jobs }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      return handleError(error);
    }
  }

  // GET /api/jobs/:id/retries - Get retry history for a job
  async getJobRetries(jobId: string, workspaceId?: string): Promise<Response> {
    try {
      // Verify job exists and belongs to workspace
      const job = await this.jobManager.getJob(jobId);
      if (!job) {
        return notFoundError('Job', jobId);
      }

      // Verify workspace ownership if workspaceId provided
      if (workspaceId && job.workspace_id !== workspaceId) {
        return notFoundError('Job', jobId);
      }

      // Get retry history
      const retries = await this.jobManager.getJobRetryHistory(jobId);

      return new Response(JSON.stringify({
        job_id: jobId,
        total_attempts: retries.length,
        retries: retries.map(r => ({
          attempt: r.attempt,
          error: r.error,
          error_category: r.error_category,
          delay_ms: r.delay_ms,
          timestamp: r.created_at
        }))
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return handleError(error);
    }
  }

  // POST /api/jobs/:id/retry - Manually retry a failed job
  async retryJob(jobId: string, workspaceId?: string): Promise<Response> {
    try {
      // Verify job exists and is failed
      const job = await this.jobManager.getJob(jobId);
      if (!job) {
        return notFoundError('Job', jobId);
      }

      // Verify workspace ownership if workspaceId provided
      if (workspaceId && job.workspace_id !== workspaceId) {
        return notFoundError('Job', jobId);
      }

      if (job.status !== 'failed') {
        return createAPIError('INVALID_STATE', `Cannot retry job with status ${job.status}`, 400);
      }

      // Reset job status to queued
      const drizzle = createDb(this.db);
      await drizzle
        .update(jobs)
        .set({
          status: 'queued',
          progress: 0,
          error: null,
          errorCategory: null,
          retryCount: sql`${jobs.retryCount} + 1`,
          nextRetryAt: sql`datetime('now')`,
          completedAt: null
        })
        .where(eq(jobs.id, jobId));

      // Re-enqueue to queue (if queue binding available)
      // This would typically be done via the producer

      return new Response(JSON.stringify({
        success: true,
        job_id: jobId,
        message: 'Job queued for retry'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return handleError(error);
    }
  }

  // Helper: Poll for job updates (simple polling implementation)
  private async pollJobUpdates(jobId: string, stream: SSEStream) {
    const pollInterval = 1000; // 1 second
    const maxPolls = 120; // 2 minutes max to allow time for LLM calls
    const STALE_QUEUED_THRESHOLD_MS = 30000; // 30 seconds for queued jobs
    let polls = 0;

    const interval = setInterval(async () => {
      try {
        polls++;

        const job = await this.jobManager.getJob(jobId);

        if (!job) {
          stream.sendFailed('Job not found', '');
          stream.close();
          clearInterval(interval);
          return;
        }

        // Send progress update
        stream.sendProgress({
          status: job.status,
          progress: job.progress
        });

        // Check if job is done
        if (job.status === 'completed') {
          stream.sendCompleted(job.result);
          stream.close();
          clearInterval(interval);
        } else if (job.status === 'failed') {
          stream.sendFailed(job.error || 'Job failed', '');
          stream.close();
          clearInterval(interval);
        } else if (job.status === 'cancelled') {
          stream.sendFailed('Job cancelled', '');
          stream.close();
          clearInterval(interval);
        } else if (job.status === 'queued') {
          // Check if job has been queued for too long (stale job detection)
          const createdAt = new Date(job.created_at);
          const now = new Date();
          const ageMs = now.getTime() - createdAt.getTime();

          if (ageMs > STALE_QUEUED_THRESHOLD_MS) {
            stream.sendFailed('Job timed out', 'Job was queued but never started. This may happen in local development without a queue worker.');
            stream.close();
            clearInterval(interval);
          }
        }

        // Timeout after max polls
        if (polls >= maxPolls) {
          stream.sendFailed('Polling timeout', 'Job took too long to complete');
          stream.close();
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Poll error:', error);
        stream.sendFailed('Polling error', (error as Error).message);
        stream.close();
        clearInterval(interval);
      }
    }, pollInterval);
  }

  // POST /api/jobs/process - Process queued jobs (for local development)
  async processQueuedJobs(): Promise<Response> {
    try {
      // Count queued jobs first
      const drizzle = createDb(this.db);
      const countResult = await drizzle
        .select({ count: sql<number>`COUNT(*)` })
        .from(jobs)
        .where(eq(jobs.status, 'queued'))
        .get();

      const queuedCount = countResult?.count || 0;

      if (queuedCount === 0) {
        return new Response(JSON.stringify({
          success: true,
          message: 'No queued jobs to process',
          processed: 0
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Create job worker and process jobs
      const worker = new JobWorker({
        db: this.db,
        cfAccountId: this.cfAccountId,
        cfGatewayId: this.cfGatewayId,
        cfGatewayToken: this.cfGatewayToken,
        sandboxBinding: this.sandboxBinding,
        encryptionKey: this.encryptionKey
      });

      await worker.processJobs();

      // Get updated count
      const afterResult = await drizzle
        .select({ count: sql<number>`COUNT(*)` })
        .from(jobs)
        .where(eq(jobs.status, 'queued'))
        .get();

      const processedCount = queuedCount - (afterResult?.count || 0);

      return new Response(JSON.stringify({
        success: true,
        message: `Processed ${processedCount} job(s)`,
        before_queued: queuedCount,
        after_queued: afterResult?.count || 0,
        processed: processedCount
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return handleError(error);
    }
  }
}
