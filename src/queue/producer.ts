/**
 * Queue Producer - Enqueue jobs to Cloudflare Queue for background processing
 */

import type {
  QueueMessage,
  JobPayload,
  EnqueueResult,
  ImportJobPayload,
  GenerateJobPayload,
  ExecuteJobPayload,
  MonitorJobPayload,
  AutoRefineJobPayload
} from '../types/queue';
import type { JobType } from '../types/api';

/**
 * Cloudflare Queue binding type
 */
export interface Queue {
  send(message: QueueMessage): Promise<void>;
  sendBatch(messages: { body: QueueMessage }[]): Promise<void>;
}

/**
 * Producer dependencies
 */
export interface QueueProducerDeps {
  queue: Queue;
  db: D1Database;
}

/**
 * QueueProducer handles enqueueing jobs to Cloudflare Queues
 */
export class QueueProducer {
  private queue: Queue;
  private db: D1Database;

  constructor(deps: QueueProducerDeps) {
    this.queue = deps.queue;
    this.db = deps.db;
  }

  /**
   * Enqueue a trace import job
   */
  async enqueueImportJob(
    workspaceId: string,
    integrationId: string,
    filters?: ImportJobPayload['filters']
  ): Promise<EnqueueResult> {
    const payload: ImportJobPayload = {
      type: 'import',
      integration_id: integrationId,
      filters
    };

    return this.enqueueJob('import', workspaceId, payload);
  }

  /**
   * Enqueue an eval generation job
   */
  async enqueueGenerateJob(
    workspaceId: string,
    evalSetId: string,
    name: string,
    options?: {
      description?: string;
      model?: string;
      customInstructions?: string;
      parentEvalId?: string;
      includeContradictions?: boolean;
    }
  ): Promise<EnqueueResult> {
    const payload: GenerateJobPayload = {
      type: 'generate',
      eval_set_id: evalSetId,
      name,
      description: options?.description,
      model: options?.model,
      custom_instructions: options?.customInstructions,
      parent_eval_id: options?.parentEvalId,
      include_contradictions: options?.includeContradictions
    };

    return this.enqueueJob('generate', workspaceId, payload);
  }

  /**
   * Enqueue an eval execution job
   */
  async enqueueExecuteJob(
    workspaceId: string,
    evalId: string,
    traceIds?: string[]
  ): Promise<EnqueueResult> {
    const payload: ExecuteJobPayload = {
      type: 'execute',
      eval_id: evalId,
      trace_ids: traceIds
    };

    return this.enqueueJob('execute', workspaceId, payload);
  }

  /**
   * Enqueue a monitoring job (typically triggered by cron)
   */
  async enqueueMonitorJob(
    workspaceId: string,
    evalIds?: string[],
    windowDays?: number
  ): Promise<EnqueueResult> {
    const payload: MonitorJobPayload = {
      type: 'monitor',
      eval_ids: evalIds,
      window_days: windowDays
    };

    return this.enqueueJob('monitor' as JobType, workspaceId, payload);
  }

  /**
   * Enqueue an auto-refinement job
   */
  async enqueueAutoRefineJob(
    workspaceId: string,
    evalId: string,
    alertId: string,
    triggerMetrics: AutoRefineJobPayload['trigger_metrics']
  ): Promise<EnqueueResult> {
    const payload: AutoRefineJobPayload = {
      type: 'auto_refine',
      eval_id: evalId,
      alert_id: alertId,
      trigger_metrics: triggerMetrics
    };

    return this.enqueueJob('auto_refine' as JobType, workspaceId, payload);
  }

  /**
   * Generic method to enqueue any job type
   */
  private async enqueueJob(
    type: JobType | 'monitor' | 'auto_refine',
    workspaceId: string,
    payload: JobPayload
  ): Promise<EnqueueResult> {
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      // Create job record in database first
      await this.db
        .prepare(
          `INSERT INTO jobs (id, workspace_id, type, status, progress, created_at, metadata)
           VALUES (?, ?, ?, 'queued', 0, ?, ?)`
        )
        .bind(
          jobId,
          workspaceId,
          type,
          now,
          JSON.stringify({ workspaceId, ...payload })
        )
        .run();

      // Create queue message
      const message: QueueMessage = {
        job_id: jobId,
        type,
        workspace_id: workspaceId,
        payload,
        attempt: 1,
        created_at: now
      };

      // Send to queue
      await this.queue.send(message);

      console.log(`[QueueProducer] Enqueued job ${jobId} (${type})`);

      return {
        success: true,
        job_id: jobId
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[QueueProducer] Failed to enqueue job: ${errorMessage}`);

      // Try to mark the job as failed if it was created
      try {
        await this.db
          .prepare(
            `UPDATE jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`
          )
          .bind(errorMessage, now, jobId)
          .run();
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        job_id: jobId,
        error: errorMessage
      };
    }
  }

  /**
   * Enqueue multiple jobs in a batch (more efficient for bulk operations)
   */
  async enqueueBatch(
    jobs: Array<{
      type: JobType | 'monitor' | 'auto_refine';
      workspaceId: string;
      payload: JobPayload;
    }>
  ): Promise<EnqueueResult[]> {
    const results: EnqueueResult[] = [];
    const messages: { body: QueueMessage }[] = [];
    const jobRecords: Array<{
      id: string;
      workspaceId: string;
      type: string;
      metadata: string;
    }> = [];
    const now = new Date().toISOString();

    // Prepare all job records and messages
    for (const job of jobs) {
      const jobId = crypto.randomUUID();
      jobRecords.push({
        id: jobId,
        workspaceId: job.workspaceId,
        type: job.type,
        metadata: JSON.stringify({ workspaceId: job.workspaceId, ...job.payload })
      });

      messages.push({
        body: {
          job_id: jobId,
          type: job.type,
          workspace_id: job.workspaceId,
          payload: job.payload,
          attempt: 1,
          created_at: now
        }
      });
    }

    try {
      // Batch insert job records
      const statements = jobRecords.map(record =>
        this.db
          .prepare(
            `INSERT INTO jobs (id, workspace_id, type, status, progress, created_at, metadata)
             VALUES (?, ?, ?, 'queued', 0, ?, ?)`
          )
          .bind(record.id, record.workspaceId, record.type, now, record.metadata)
      );

      await this.db.batch(statements);

      // Send all messages to queue
      await this.queue.sendBatch(messages);

      // All succeeded
      for (const record of jobRecords) {
        results.push({
          success: true,
          job_id: record.id
        });
      }

      console.log(`[QueueProducer] Batch enqueued ${jobs.length} jobs`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[QueueProducer] Batch enqueue failed: ${errorMessage}`);

      // Mark all as failed
      for (const record of jobRecords) {
        results.push({
          success: false,
          job_id: record.id,
          error: errorMessage
        });
      }
    }

    return results;
  }
}
