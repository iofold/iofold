/**
 * Queue Producer - Enqueue jobs to Cloudflare Queue for background processing
 */

import { createDb, type Database } from '../db/client';
import { eq } from 'drizzle-orm';
import { jobs as jobsTable } from '../db/schema';
import type {
  QueueMessage,
  JobPayload,
  EnqueueResult,
  ImportJobPayload,
  GenerateJobPayload,
  ExecuteJobPayload,
  AgentDiscoveryJobPayload,
  TasksetRunJobPayload
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
  private drizzle: Database;

  constructor(deps: QueueProducerDeps) {
    this.queue = deps.queue;
    this.db = deps.db;
    this.drizzle = createDb(deps.db);
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
    agentId: string,
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
      agent_id: agentId,
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
   * Enqueue an agent discovery job
   */
  async enqueueAgentDiscoveryJob(
    workspaceId: string,
    options?: {
      similarityThreshold?: number;
      minClusterSize?: number;
      maxTraces?: number;
    }
  ): Promise<EnqueueResult> {
    const payload: AgentDiscoveryJobPayload = {
      type: 'agent_discovery',
      similarity_threshold: options?.similarityThreshold,
      min_cluster_size: options?.minClusterSize,
      max_traces: options?.maxTraces
    };

    return this.enqueueJob('agent_discovery' as JobType, workspaceId, payload);
  }

  /**
   * Enqueue a taskset run job
   */
  async enqueueTasksetRunJob(
    workspaceId: string,
    agentId: string,
    tasksetId: string,
    options?: {
      modelProvider?: string;
      modelId?: string;
      config?: {
        parallelism?: number;
        timeout_per_task_ms?: number;
      };
      taskCount?: number;
    }
  ): Promise<EnqueueResult> {
    const payload: TasksetRunJobPayload = {
      type: 'taskset_run',
      workspace_id: workspaceId,
      agent_id: agentId,
      taskset_id: tasksetId,
      model_provider: options?.modelProvider,
      model_id: options?.modelId,
      config: options?.config,
      task_count: options?.taskCount
    };

    return this.enqueueJob('taskset_run' as JobType, workspaceId, payload);
  }

  /**
   * Generic method to enqueue any job type
   */
  private async enqueueJob(
    type: JobType | 'monitor' | 'auto_refine' | 'agent_discovery' | 'taskset_run',
    workspaceId: string,
    payload: JobPayload
  ): Promise<EnqueueResult> {
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      // Create job record in database first
      await this.drizzle.insert(jobsTable).values({
        id: jobId,
        workspaceId,
        type,
        status: 'queued',
        progress: 0,
        createdAt: now,
        metadata: { workspaceId, ...payload }
      });

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
        await this.drizzle
          .update(jobsTable)
          .set({
            status: 'failed',
            error: errorMessage,
            completedAt: now
          })
          .where(eq(jobsTable.id, jobId));
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
      type: JobType | 'monitor' | 'auto_refine' | 'agent_discovery' | 'taskset_run';
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
      const jobValues = jobRecords.map(record => ({
        id: record.id,
        workspaceId: record.workspaceId,
        type: record.type as JobType,
        status: 'queued' as const,
        progress: 0,
        createdAt: now,
        metadata: JSON.parse(record.metadata)
      }));

      await this.drizzle.insert(jobsTable).values(jobValues);

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
