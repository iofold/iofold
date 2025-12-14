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
  AgentDiscoveryJobPayload,
  RolloutTaskPayload,
  GEPAOptimizationJobPayload,
  TasksetRunJobPayload,
  RetryAttempt
} from '../types/queue';
import { JobManager } from '../jobs/job-manager';
import { TraceImportJob } from '../jobs/trace-import-job';
import { EvalGenerationJob } from '../jobs/eval-generation-job';
import { EvalExecutionJob } from '../jobs/eval-execution-job';
import { AgentDiscoveryJob } from '../jobs/agent-discovery-job';
import { GEPAOptimizationJob } from '../jobs/gepa-optimization-job';
import { TasksetRunJob } from '../jobs/taskset-run-job';
import { classifyError, isRetryable, getErrorCategoryDescription, type ErrorCategory } from '../errors/classifier';
import { calculateBackoffDelay, shouldRetry as shouldRetryBackoff, DEFAULT_RETRY_CONFIG } from '../retry/backoff';
import { createDb, type Database } from '../db/client';
import { eq, sql } from 'drizzle-orm';
import { jobs, jobRetryHistory, rolloutResults } from '../db/schema';

/**
 * Custom error class for rollout task timeouts
 */
class RolloutTimeoutError extends Error {
  constructor() {
    super('Task timeout');
    this.name = 'RolloutTimeoutError';
  }
}

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
 * Result of error handling for a message
 */
export interface MessageErrorResult {
  shouldRetry: boolean;
  moveToDlq: boolean;
  errorCategory: ErrorCategory;
  delayMs: number;
  retryHistory?: RetryAttempt[];
  suggestedAction?: string;
}

/**
 * Consumer dependencies
 */
export interface QueueConsumerDeps {
  db: D1Database;
  benchmarksDb?: D1Database;
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
  encryptionKey: string;
  deadLetterQueue?: DeadLetterQueue;
  /** Workers AI binding for embeddings */
  ai?: Ai;
  /** Vectorize binding for vector storage */
  vectorize?: VectorizeIndex;
  /** Cloudflare Account ID for AI Gateway (required for LLM calls) */
  cfAccountId: string;
  /** Cloudflare AI Gateway ID (required for LLM calls) */
  cfGatewayId: string;
  /** Optional AI Gateway authentication token */
  cfGatewayToken?: string;
  /** Queue binding for enqueueing follow-up jobs */
  queue?: any;
}

/**
 * QueueConsumer processes jobs from Cloudflare Queues
 */
export class QueueConsumer {
  private db: D1Database;
  private drizzle: Database;
  private benchmarksDb?: D1Database;
  private sandboxBinding?: DurableObjectNamespace<Sandbox>;
  private encryptionKey: string;
  private deadLetterQueue?: DeadLetterQueue;
  private ai?: Ai;
  private vectorize?: VectorizeIndex;
  private cfAccountId: string;
  private cfGatewayId: string;
  private cfGatewayToken?: string;
  private queue?: any;
  private jobManager: JobManager;

  constructor(deps: QueueConsumerDeps) {
    this.db = deps.db;
    this.drizzle = createDb(deps.db);
    this.benchmarksDb = deps.benchmarksDb;
    this.sandboxBinding = deps.sandboxBinding;
    this.encryptionKey = deps.encryptionKey;
    this.deadLetterQueue = deps.deadLetterQueue;
    this.ai = deps.ai;
    this.vectorize = deps.vectorize;
    this.cfAccountId = deps.cfAccountId;
    this.cfGatewayId = deps.cfGatewayId;
    this.cfGatewayToken = deps.cfGatewayToken;
    this.queue = deps.queue;
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
        const errorResult = await this.handleMessageError(message, error);

        if (errorResult.shouldRetry) {
          // Update message with retry metadata before retry
          message.body.attempt++;
          message.body.error_category = errorResult.errorCategory;
          message.body.last_error_at = new Date().toISOString();
          message.body.retry_history = errorResult.retryHistory;

          message.retry();
          result.retried++;
          console.log(
            `[QueueConsumer] Retrying message ${message.id} in ${errorResult.delayMs}ms ` +
            `(attempt ${message.body.attempt}, category: ${errorResult.errorCategory})`
          );
        } else {
          // Move to DLQ
          await this.moveToDeadLetterQueueEnhanced(message.body, error, errorResult);
          message.ack();
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
        case 'agent_discovery':
          await this.processAgentDiscoveryJob(job_id, workspace_id, payload as AgentDiscoveryJobPayload);
          break;
        case 'rollout_task':
          await this.processRolloutTask(job_id, workspace_id, payload as RolloutTaskPayload);
          break;
        case 'gepa_optimization':
          await this.processGEPAOptimizationJob(job_id, workspace_id, payload as GEPAOptimizationJobPayload);
          break;
        case 'taskset_run':
          await this.processTasksetRunJob(job_id, workspace_id, payload as TasksetRunJobPayload);
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
        encryptionKey: this.encryptionKey,
        queue: this.queue
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
    const genJob = new EvalGenerationJob(
      {
        jobId,
        agentId: payload.agent_id,
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
        cfAccountId: this.cfAccountId,
        cfGatewayId: this.cfGatewayId,
        cfGatewayToken: this.cfGatewayToken,
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
   * Process agent discovery job
   */
  private async processAgentDiscoveryJob(
    jobId: string,
    workspaceId: string,
    payload: AgentDiscoveryJobPayload
  ): Promise<void> {
    if (!this.ai) {
      throw new Error('Workers AI binding not configured');
    }
    if (!this.vectorize) {
      throw new Error('Vectorize binding not configured');
    }

    const discoveryJob = new AgentDiscoveryJob(
      {
        jobId,
        workspaceId,
        similarityThreshold: payload.similarity_threshold,
        minClusterSize: payload.min_cluster_size,
        maxTracesToProcess: payload.max_traces
      },
      {
        db: this.db,
        ai: this.ai,
        vectorize: this.vectorize,
        cfAccountId: this.cfAccountId,
        cfGatewayId: this.cfGatewayId,
        cfGatewayToken: this.cfGatewayToken,
      }
    );

    await discoveryJob.execute();
  }

  /**
   * Process GEPA optimization job
   */
  private async processGEPAOptimizationJob(
    jobId: string,
    workspaceId: string,
    payload: GEPAOptimizationJobPayload
  ): Promise<void> {
    const optimizationJob = new GEPAOptimizationJob(
      {
        jobId,
        runId: payload.run_id,
        agentId: payload.agent_id,
        evalId: payload.eval_id,
        evalCode: payload.eval_code,
        seedPrompt: payload.seed_prompt,
        testCases: payload.test_cases,
        trainSplit: payload.train_split,
        maxMetricCalls: payload.max_metric_calls,
        parallelism: payload.parallelism,
        pollTimeoutSeconds: payload.poll_timeout_seconds,
        scoreThreshold: payload.score_threshold,
        apiBaseUrl: payload.api_base_url,
        sessionToken: payload.session_token,
        workspaceId
      },
      {
        db: this.db,
        sandboxBinding: this.sandboxBinding,
        cfAccountId: this.cfAccountId,
        cfGatewayId: this.cfGatewayId,
        cfGatewayToken: this.cfGatewayToken,
      }
    );

    await optimizationJob.execute();
  }

  /**
   * Process taskset run job
   */
  private async processTasksetRunJob(
    jobId: string,
    workspaceId: string,
    payload: TasksetRunJobPayload
  ): Promise<void> {
    const tasksetRunJob = new TasksetRunJob(
      {
        jobId,
        workspaceId,
        agentId: payload.agent_id,
        tasksetId: payload.taskset_id,
        modelProvider: payload.model_provider,
        modelId: payload.model_id,
        config: payload.config
      },
      {
        db: this.db,
        benchmarksDb: this.benchmarksDb,
        sandboxBinding: this.sandboxBinding,
        cfAccountId: this.cfAccountId,
        cfGatewayId: this.cfGatewayId,
        cfGatewayToken: this.cfGatewayToken,
      }
    );

    await tasksetRunJob.execute();
  }

  /**
   * Process rollout task (GEPA integration)
   * Executes agent with candidate system prompt and collects trace
   */
  private async processRolloutTask(
    jobId: string,
    workspaceId: string,
    payload: RolloutTaskPayload
  ): Promise<void> {
    const startTime = Date.now();
    const sessionId = `rollout-${payload.batch_id}-${payload.task_id}`;
    const timeoutMs = payload.config?.timeout_per_task_ms || 30000;

    // Import createPlaygroundDeepAgent dynamically to avoid circular dependencies
    const { createPlaygroundDeepAgent } = await import('../playground/agent-deepagents');

    try {
      // 1. Create agent with candidate system prompt
      const agent = await createPlaygroundDeepAgent({
        db: this.db,
        sandbox: this.sandboxBinding,
        sessionId,
        systemPrompt: payload.system_prompt,
        modelProvider: 'anthropic',
        modelId: payload.config?.model_id || 'claude-sonnet-4-5',
        env: {
          DB: this.db,
          CF_ACCOUNT_ID: this.cfAccountId,
          CF_AI_GATEWAY_ID: this.cfGatewayId,
          CF_AI_GATEWAY_TOKEN: this.cfGatewayToken,
          SANDBOX: this.sandboxBinding,
        } as any,
        agentId: payload.agent_id,
      });

      // 2. Execute agent with timeout
      const messages = [{ role: 'user' as const, content: payload.user_message }];

      const result = await Promise.race([
        agent.invoke(messages),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new RolloutTimeoutError()), timeoutMs)
        ),
      ]);

      const executionTimeMs = Date.now() - startTime;

      // 3. Build simple trace with input/output for eval function
      const traceId = `rollout_${payload.batch_id}_${payload.task_id}`;

      const simpleTrace = [{
        step_id: 'step_0',
        trace_id: traceId,
        timestamp: new Date().toISOString(),
        input: { user_message: payload.user_message },
        output: { response: result },
        messages_added: [
          { role: 'user' as const, content: payload.user_message },
          { role: 'assistant' as const, content: result }
        ],
        tool_calls: [],
        metadata: {
          system_prompt: payload.system_prompt,
          model_id: payload.config?.model_id || 'claude-sonnet-4-5',
          execution_time_ms: executionTimeMs
        }
      }];

      // 4. Store successful result in rollout_results
      const resultId = this.generateResultId('rr');
      await this.drizzle.insert(rolloutResults).values({
        id: resultId,
        batchId: payload.batch_id,
        taskId: payload.task_id,
        status: 'completed',
        trace: simpleTrace,
        executionTimeMs
      });

      console.log(`[RolloutTask] Completed task ${payload.task_id} in ${executionTimeMs}ms`);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const isTimeout = error?.name === 'RolloutTimeoutError' ||
                        errorMessage.includes('timeout') ||
                        errorMessage.includes('Timeout');
      const status = isTimeout ? 'timeout' : 'failed';

      console.error(`[RolloutTask] Task ${payload.task_id} ${status}:`, errorMessage);

      // Store failure result
      const resultId = this.generateResultId('rr');
      await this.drizzle.insert(rolloutResults).values({
        id: resultId,
        batchId: payload.batch_id,
        taskId: payload.task_id,
        status,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime
      });
    }
  }

  /**
   * Generate ID with prefix for rollout results
   */
  private generateResultId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }

  /**
   * Handle message error with classification and retry decisions
   */
  async handleMessageError(
    message: { body: QueueMessage; ack: () => void; retry: () => void },
    error: unknown
  ): Promise<MessageErrorResult> {
    const queueMessage = message.body;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCategory = classifyError(error);
    const now = new Date().toISOString();

    // Build retry history
    const retryHistory: RetryAttempt[] = [
      ...(queueMessage.retry_history || []),
      {
        attempt: queueMessage.attempt,
        error: errorMessage,
        error_category: errorCategory,
        delay_ms: 0, // Will be set below if retrying
        timestamp: now
      }
    ];

    // Check if we should retry
    const canRetry = isRetryable(errorCategory) &&
                     shouldRetryBackoff(queueMessage.attempt, errorCategory, DEFAULT_RETRY_CONFIG);

    if (!canRetry) {
      // Move to DLQ
      const suggestedAction = this.getSuggestedAction(errorCategory);

      return {
        shouldRetry: false,
        moveToDlq: true,
        errorCategory,
        delayMs: 0,
        retryHistory,
        suggestedAction
      };
    }

    // Calculate backoff delay
    const delayMs = calculateBackoffDelay(queueMessage.attempt, errorCategory, DEFAULT_RETRY_CONFIG);

    // Update the last retry record with actual delay
    retryHistory[retryHistory.length - 1].delay_ms = delayMs;

    // Record retry attempt in database
    await this.recordRetryAttempt(queueMessage.job_id, queueMessage.attempt, errorMessage, errorCategory, delayMs);

    return {
      shouldRetry: true,
      moveToDlq: false,
      errorCategory,
      delayMs,
      retryHistory
    };
  }

  /**
   * Record retry attempt in database for audit trail
   */
  private async recordRetryAttempt(
    jobId: string,
    attempt: number,
    error: string,
    errorCategory: ErrorCategory,
    delayMs: number
  ): Promise<void> {
    const id = `retry_${crypto.randomUUID()}`;

    await this.drizzle.insert(jobRetryHistory).values({
      id,
      jobId,
      attempt,
      error,
      errorCategory,
      delayMs
    });

    // Update job record with retry info
    const now = new Date().toISOString();
    const nextRetrySeconds = Math.ceil(delayMs / 1000);
    await this.drizzle
      .update(jobs)
      .set({
        retryCount: attempt,
        errorCategory,
        lastErrorAt: now,
        nextRetryAt: sql`datetime('now', '+' || ${nextRetrySeconds} || ' seconds')`
      })
      .where(eq(jobs.id, jobId));
  }

  /**
   * Get suggested action for error category
   */
  private getSuggestedAction(category: ErrorCategory): string {
    const actions: Record<ErrorCategory, string> = {
      transient_network: 'Check network connectivity and retry',
      transient_rate_limit: 'Wait for rate limit reset and retry',
      transient_server: 'Wait for service recovery and retry',
      transient_db_lock: 'Retry after a short delay',
      permanent_validation: 'Review input data and fix validation errors',
      permanent_auth: 'Check API credentials and permissions',
      permanent_not_found: 'Verify resource exists before retrying',
      permanent_security: 'Review code for security violations',
      unknown: 'Investigate error and determine appropriate action'
    };
    return actions[category];
  }

  /**
   * Move failed message to dead letter queue with enhanced metadata
   */
  private async moveToDeadLetterQueueEnhanced(
    message: QueueMessage,
    error: unknown,
    errorResult: MessageErrorResult
  ): Promise<void> {
    console.log(`[QueueConsumer] Moving job ${message.job_id} to dead letter queue (${errorResult.errorCategory})`);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const requiresUserAction = errorResult.errorCategory.startsWith('permanent_');

    const dlqMessage: DeadLetterMessage = {
      original_message: message,
      error: errorMessage,
      error_category: errorResult.errorCategory,
      final_attempt: message.attempt,
      failed_at: new Date().toISOString(),
      retry_history: errorResult.retryHistory || [],
      requires_user_action: requiresUserAction,
      suggested_action: errorResult.suggestedAction
    };

    if (this.deadLetterQueue) {
      await this.deadLetterQueue.send(dlqMessage);
    } else {
      console.error(`[QueueConsumer] DLQ not configured, job ${message.job_id} permanently failed:`, dlqMessage);
    }

    // Update job status to failed with enhanced DLQ info
    const now = new Date().toISOString();
    await this.drizzle
      .update(jobs)
      .set({
        status: 'failed',
        error: `Failed after ${message.attempt} attempts: ${errorMessage}`,
        errorCategory: errorResult.errorCategory,
        completedAt: now,
        metadata: sql`json_set(
          COALESCE(metadata, '{}'),
          '$.moved_to_dlq', true,
          '$.final_attempt', ${message.attempt},
          '$.requires_user_action', ${requiresUserAction},
          '$.suggested_action', ${errorResult.suggestedAction || null}
        )`
      })
      .where(eq(jobs.id, message.job_id));
  }

  /**
   * Move failed message to dead letter queue (legacy method for backwards compatibility)
   */
  private async moveToDeadLetterQueue(
    message: QueueMessage,
    error: string
  ): Promise<void> {
    console.log(`[QueueConsumer] Moving job ${message.job_id} to dead letter queue`);

    const dlqMessage: DeadLetterMessage = {
      original_message: message,
      error,
      error_category: 'unknown',
      final_attempt: message.attempt,
      failed_at: new Date().toISOString(),
      retry_history: message.retry_history || [],
      requires_user_action: true,
      suggested_action: 'Investigate error and determine appropriate action'
    };

    if (this.deadLetterQueue) {
      await this.deadLetterQueue.send(dlqMessage);
    } else {
      // If no DLQ configured, just log the failure
      console.error(`[QueueConsumer] DLQ not configured, job ${message.job_id} permanently failed:`, dlqMessage);
    }

    // Update job status to failed with DLQ info
    const now = new Date().toISOString();
    await this.drizzle
      .update(jobs)
      .set({
        status: 'failed',
        error: `Failed after ${message.attempt} attempts: ${error}`,
        completedAt: now,
        metadata: sql`json_set(COALESCE(metadata, '{}'), '$.moved_to_dlq', true, '$.final_attempt', ${message.attempt})`
      })
      .where(eq(jobs.id, message.job_id));
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
