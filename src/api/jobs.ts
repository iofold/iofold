import type { D1Database } from '@cloudflare/workers-types';
import { z } from 'zod';
import { JobManager } from '../jobs/job-manager';
import { handleError, notFoundError } from '../utils/errors';
import { SSEStream, createSSEResponse } from '../utils/sse';
import type { Job } from '../types/api';

// Request schemas
const ListJobsSchema = z.object({
  type: z.enum(['import', 'generate', 'execute']).optional(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20)
});

export class JobsAPI {
  private jobManager: JobManager;

  constructor(private db: D1Database) {
    this.jobManager = new JobManager(db);
  }

  // GET /api/jobs/:id - Get job status
  async getJob(jobId: string): Promise<Response> {
    try {
      const job = await this.jobManager.getJob(jobId);

      if (!job) {
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
  async streamJob(jobId: string): Promise<Response> {
    try {
      const job = await this.jobManager.getJob(jobId);

      if (!job) {
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
  async cancelJob(jobId: string): Promise<Response> {
    try {
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

  // Helper: Poll for job updates (simple polling implementation)
  private async pollJobUpdates(jobId: string, stream: SSEStream) {
    const pollInterval = 1000; // 1 second
    const maxPolls = 300; // 5 minutes max
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
}
