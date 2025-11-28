/**
 * Queue Consumer - Process jobs from Cloudflare Queue with retry logic
 */

import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import type {
  QueueMessage,
  DeadLetterMessage,
  ConsumerBatchResult,
  ImportJobPayload,
  GenerateJobPayload,
  ExecuteJobPayload,
  MonitorJobPayload,
  AutoRefineJobPayload
} from '../types/queue';
import { JobManager } from '../jobs/job-manager';
import { TraceImportJob } from '../jobs/trace-import-job';
import { EvalGenerationJob } from '../jobs/eval-generation-job';
import { EvalExecutionJob } from '../jobs/eval-execution-job';

/**
 * Cloudflare Queue message batch type
 */
export interface MessageBatch<T> {
  readonly queue: string;
  readonly messages: Message<T>[];
  ackAll(): void;
  retryAll(): void;
}

export interface Message<T> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: T;
  ack(): void;
  retry(): void;
}

/**
 * Dead letter queue binding (accepts any message)
 */
export interface DeadLetterQueue {
  send(message: DeadLetterMessage | any): Promise<void>;
}

/**
 * Consumer dependencies
 */
export interface QueueConsumerDeps {
  db: D1Database;
  anthropicApiKey?: string;
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
  encryptionKey: string;
  deadLetterQueue?: DeadLetterQueue;
}

/**
 * QueueConsumer processes jobs from Cloudflare Queues
 */
export class QueueConsumer {
  private db: D1Database;
  private anthropicApiKey?: string;
  private sandboxBinding?: DurableObjectNamespace<Sandbox>;
  private encryptionKey: string;
  private deadLetterQueue?: DeadLetterQueue;
  private jobManager: JobManager;

  constructor(deps: QueueConsumerDeps) {
    this.db = deps.db;
    this.anthropicApiKey = deps.anthropicApiKey;
    this.sandboxBinding = deps.sandboxBinding;
    this.encryptionKey = deps.encryptionKey;
    this.deadLetterQueue = deps.deadLetterQueue;
    this.jobManager = new JobManager(deps.db);
  }

  /**
   * Process a batch of queue messages
   * This is the entry point called by Cloudflare Workers queue handler
   */
  async processBatch(batch: MessageBatch<QueueMessage>): Promise<ConsumerBatchResult> {
    const result: ConsumerBatchResult = {
      processed: batch.messages.length,
      succeeded: 0,
      failed: 0,
      retried: 0
    };

    console.log(`[QueueConsumer] Processing batch of ${batch.messages.length} messages from ${batch.queue}`);

    for (const message of batch.messages) {
      try {
        await this.processMessage(message);
        message.ack();
        result.succeeded++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[QueueConsumer] Message ${message.id} failed: ${errorMessage}`);

        // Check if we should retry or move to DLQ
        const queueMessage = message.body;
        const maxRetries = 3;

        if (queueMessage.attempt < maxRetries) {
          // Update attempt count for retry
          queueMessage.attempt++;
          message.retry();
          result.retried++;
          console.log(`[QueueConsumer] Retrying message ${message.id} (attempt ${queueMessage.attempt})`);
        } else {
          // Move to dead letter queue
          await this.moveToDeadLetterQueue(queueMessage, errorMessage);
          message.ack(); // Ack to remove from main queue
          result.failed++;
        }
      }
    }

    console.log(
      `[QueueConsumer] Batch complete: ${result.succeeded} succeeded, ${result.retried} retried, ${result.failed} failed`
    );

    return result;
  }

  /**
   * Process a single queue message
   */
  private async processMessage(message: Message<QueueMessage>): Promise<void> {
    const { job_id, type, workspace_id, payload, attempt } = message.body;

    console.log(`[QueueConsumer] Processing job ${job_id} (${type}), attempt ${attempt}`);

    // Mark job as running
    await this.jobManager.updateJobStatus(job_id, 'running', 0);

    try {
      // Route to appropriate handler
      switch (type) {
        case 'import':
          await this.processImportJob(job_id, workspace_id, payload as ImportJobPayload);
          break;
        case 'generate':
          await this.processGenerateJob(job_id, workspace_id, payload as GenerateJobPayload);
          break;
        case 'execute':
          await this.processExecuteJob(job_id, workspace_id, payload as ExecuteJobPayload);
          break;
        case 'monitor':
          await this.processMonitorJob(job_id, workspace_id, payload as MonitorJobPayload);
          break;
        case 'auto_refine':
          await this.processAutoRefineJob(job_id, workspace_id, payload as AutoRefineJobPayload);
          break;
        default:
          throw new Error(`Unknown job type: ${type}`);
      }

      // Mark job as completed
      await this.jobManager.completeJob(job_id, { success: true });
      console.log(`[QueueConsumer] Job ${job_id} completed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.jobManager.failJob(job_id, errorMessage);
      throw error; // Re-throw for retry handling
    }
  }

  /**
   * Process trace import job
   */
  private async processImportJob(
    jobId: string,
    workspaceId: string,
    payload: ImportJobPayload
  ): Promise<void> {
    const importJob = new TraceImportJob(
      {
        jobId,
        integrationId: payload.integration_id,
        workspaceId,
        filters: payload.filters
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
  private async processGenerateJob(
    jobId: string,
    workspaceId: string,
    payload: GenerateJobPayload
  ): Promise<void> {
    if (!this.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const genJob = new EvalGenerationJob(
      {
        jobId,
        evalSetId: payload.eval_set_id,
        name: payload.name,
        description: payload.description,
        model: payload.model,
        customInstructions: payload.custom_instructions,
        workspaceId,
        parentEvalId: payload.parent_eval_id,
        includeContradictions: payload.include_contradictions
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
  private async processExecuteJob(
    jobId: string,
    workspaceId: string,
    payload: ExecuteJobPayload
  ): Promise<void> {
    const execJob = new EvalExecutionJob(
      {
        jobId,
        evalId: payload.eval_id,
        traceIds: payload.trace_ids,
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
   * Process monitoring job (triggered by cron)
   */
  private async processMonitorJob(
    jobId: string,
    workspaceId: string,
    payload: MonitorJobPayload
  ): Promise<void> {
    // TODO: Implement PerformanceMonitor in Phase 3
    // For now, log and complete
    console.log(`[QueueConsumer] Monitor job ${jobId} - monitoring ${payload.eval_ids?.length || 'all'} evals`);

    // Update job progress
    await this.jobManager.updateJobStatus(jobId, 'running', 50);

    // Placeholder for Phase 3 implementation
    // const monitor = new PerformanceMonitor({ db: this.db });
    // await monitor.runMonitoring(payload.eval_ids, payload.window_days);

    await this.jobManager.updateJobStatus(jobId, 'running', 100);
  }

  /**
   * Process auto-refinement job
   */
  private async processAutoRefineJob(
    jobId: string,
    workspaceId: string,
    payload: AutoRefineJobPayload
  ): Promise<void> {
    if (!this.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // TODO: Implement AutoRefineManager in Phase 3
    // For now, log and complete
    console.log(
      `[QueueConsumer] Auto-refine job ${jobId} - refining eval ${payload.eval_id} triggered by alert ${payload.alert_id}`
    );

    // Update job progress
    await this.jobManager.updateJobStatus(jobId, 'running', 50);

    // Placeholder for Phase 3 implementation
    // const refiner = new AutoRefineManager({
    //   db: this.db,
    //   anthropicApiKey: this.anthropicApiKey,
    //   sandboxBinding: this.sandboxBinding
    // });
    // await refiner.refineEval(payload.eval_id, payload.alert_id, payload.trigger_metrics);

    await this.jobManager.updateJobStatus(jobId, 'running', 100);
  }

  /**
   * Move failed message to dead letter queue
   */
  private async moveToDeadLetterQueue(
    message: QueueMessage,
    error: string
  ): Promise<void> {
    console.log(`[QueueConsumer] Moving job ${message.job_id} to dead letter queue`);

    const dlqMessage: DeadLetterMessage = {
      original_message: message,
      error,
      final_attempt: message.attempt,
      failed_at: new Date().toISOString()
    };

    if (this.deadLetterQueue) {
      await this.deadLetterQueue.send(dlqMessage);
    } else {
      // If no DLQ configured, just log the failure
      console.error(`[QueueConsumer] DLQ not configured, job ${message.job_id} permanently failed:`, dlqMessage);
    }

    // Update job status to failed with DLQ info
    await this.db
      .prepare(
        `UPDATE jobs SET
         status = 'failed',
         error = ?,
         completed_at = ?,
         metadata = json_set(COALESCE(metadata, '{}'), '$.moved_to_dlq', true, '$.final_attempt', ?)
         WHERE id = ?`
      )
      .bind(
        `Failed after ${message.attempt} attempts: ${error}`,
        new Date().toISOString(),
        message.attempt,
        message.job_id
      )
      .run();
  }
}

/**
 * Create the queue handler export for Cloudflare Workers
 */
export function createQueueHandler(deps: QueueConsumerDeps) {
  const consumer = new QueueConsumer(deps);

  return async (batch: MessageBatch<QueueMessage>): Promise<void> => {
    await consumer.processBatch(batch);
  };
}
