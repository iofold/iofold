import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';
import { createGatewayClient, chatCompletion, DEFAULT_MODEL } from '../ai/gateway';
import { createDb, type Database } from '../db/client';
import { eq, and, asc, sql } from 'drizzle-orm';
import { tasksetTasks, traces, agents, agentVersions, integrations } from '../db/schema';
import { D1TraceCollector } from '../playground/tracing/d1-collector';

/**
 * Simple concurrency limiter - executes async functions with a max concurrency limit
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let completedCount = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];
      results[index] = await fn(item, index);
      completedCount++;
      onProgress?.(completedCount, items.length);
    }
  }

  // Start workers up to concurrency limit
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

export interface TasksetRunJobConfig {
  jobId: string;
  workspaceId: string;
  agentId: string;
  tasksetId: string;
  modelProvider?: string;
  modelId?: string;
  config?: {
    parallelism?: number;
    timeout_per_task_ms?: number;
  };
}

export interface TasksetRunJobDeps {
  db: D1Database;
  benchmarksDb?: D1Database;
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
  cfAccountId: string;
  cfGatewayId: string;
  cfGatewayToken?: string;
}

export interface TasksetRunJobResult {
  job_id: string;
  status: 'completed' | 'partial' | 'failed';
  task_count: number;
  completed_count: number;
  failed_count: number;
  average_score: number;
  average_execution_time_ms: number;
}

/**
 * TasksetRunJob - Execute all tasks in a taskset through the playground agent
 *
 * For each task:
 * 1. Load task from taskset_tasks
 * 2. Call playground agent with task user_message
 * 3. Capture response and agent steps
 * 4. Compare with expected_output using simple scoring:
 *    - Exact match = 1.0
 *    - Contains expected (substring) = 0.8
 *    - Otherwise, use LLM comparison
 * 5. Create a trace with source='taskset' and metadata containing:
 *    - taskId, tasksetId, jobId, expectedOutput, score, scoreReason
 * 6. Update job progress (stats stored in job result)
 */
export class TasksetRunJob {
  private jobManager: JobManager;
  private stream?: SSEStream;
  private drizzle: Database;

  constructor(
    private config: TasksetRunJobConfig,
    private deps: TasksetRunJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
    this.drizzle = createDb(deps.db);
  }

  async execute(stream?: SSEStream): Promise<TasksetRunJobResult> {
    this.stream = stream;

    try {
      // Update job to running
      await this.jobManager.updateJobStatus(this.config.jobId, 'running', 0);
      await this.emitProgress('initializing', 0);

      await this.emitProgress('fetching_agent', 5);

      // Step 2: Fetch agent details
      const agent = await this.fetchAgent();
      if (!agent) {
        throw new Error(`Agent ${this.config.agentId} not found`);
      }

      await this.emitProgress('fetching_tasks', 10);

      // Step 3: Fetch all tasks from taskset
      const tasks = await this.fetchTasks();
      if (tasks.length === 0) {
        throw new Error(`No tasks found in taskset ${this.config.tasksetId}`);
      }

      // Get parallelism from config (default: 4 concurrent tasks)
      const parallelism = this.config.config?.parallelism ?? 4;

      await this.emitProgress('executing_tasks', 15, {
        total_tasks: tasks.length,
        parallelism
      });

      // Step 4: Execute tasks in parallel with concurrency limit
      let completedCount = 0;
      let failedCount = 0;
      let totalScore = 0;
      let totalExecutionTime = 0;

      // Track results for each task
      type TaskResult = { success: true; score: number; execution_time_ms: number } | { success: false; error: string };

      const results = await runWithConcurrency<typeof tasks[0], TaskResult>(
        tasks,
        parallelism,
        async (task, _index) => {
          try {
            const result = await this.executeTask(task, agent);
            return { success: true as const, score: result.score, execution_time_ms: result.execution_time_ms };
          } catch (error: any) {
            console.error(`[TasksetRunJob] Task ${task.id} failed:`, error);
            // Record failed result as trace with error
            await this.recordFailedResult(task.id, error.message, task, agent.active_version_id);
            return { success: false as const, error: error.message };
          }
        },
        // Progress callback - called after each task completes
        (completed, total) => {
          const progress = 15 + ((completed / total) * 75);
          // Use void to not await - we don't want to block parallel execution
          void this.emitProgress('executing_tasks_parallel', progress, {
            completed_tasks: completed,
            total_tasks: total,
            parallelism,
            in_progress: Math.min(parallelism, total - completed)
          });
        }
      );

      // Aggregate results
      for (const result of results) {
        if (result.success) {
          completedCount++;
          totalScore += result.score;
          totalExecutionTime += result.execution_time_ms;
        } else {
          failedCount++;
        }
      }

      await this.emitProgress('finalizing', 95);

      // Step 5: Calculate final metrics
      const averageScore = completedCount > 0 ? totalScore / completedCount : 0;
      const averageExecutionTime = completedCount > 0 ? totalExecutionTime / completedCount : 0;

      // Step 6: Determine final status
      const finalStatus = failedCount === 0 ? 'completed' : failedCount < tasks.length ? 'partial' : 'failed';

      const result: TasksetRunJobResult = {
        job_id: this.config.jobId,
        status: finalStatus,
        task_count: tasks.length,
        completed_count: completedCount,
        failed_count: failedCount,
        average_score: averageScore,
        average_execution_time_ms: averageExecutionTime
      };

      // Mark job as completed (stores result in jobs table)
      await this.jobManager.completeJob(this.config.jobId, result);
      await this.emitProgress('completed', 100);

      return result;
    } catch (error: any) {
      console.error('[TasksetRunJob] Job failed:', error);

      await this.jobManager.failJob(this.config.jobId, error.message);

      if (this.stream) {
        this.stream.sendFailed(error.message, error.stack);
      }

      throw error;
    }
  }

  /**
   * Fetch agent details including prompt template from active version
   */
  private async fetchAgent(): Promise<{
    id: string;
    name: string;
    prompt_template: string;
    active_version_id: string | null;
  } | null> {
    const result = await this.drizzle
      .select({
        id: agents.id,
        name: agents.name,
        activeVersionId: agents.activeVersionId,
        promptTemplate: agentVersions.promptTemplate
      })
      .from(agents)
      .leftJoin(agentVersions, eq(agents.activeVersionId, agentVersions.id))
      .where(and(
        eq(agents.id, this.config.agentId),
        eq(agents.workspaceId, this.config.workspaceId)
      ))
      .limit(1);

    if (!result[0]) return null;

    return {
      id: result[0].id,
      name: result[0].name,
      prompt_template: result[0].promptTemplate || '',
      active_version_id: result[0].activeVersionId
    };
  }

  /**
   * Fetch all tasks from taskset
   */
  private async fetchTasks(): Promise<
    Array<{
      id: string;
      user_message: string;
      expected_output: string | null;
      source: string;
      metadata: any;
    }>
  > {
    const results = await this.drizzle
      .select({
        id: tasksetTasks.id,
        userMessage: tasksetTasks.userMessage,
        expectedOutput: tasksetTasks.expectedOutput,
        source: tasksetTasks.source,
        metadata: tasksetTasks.metadata
      })
      .from(tasksetTasks)
      .where(eq(tasksetTasks.tasksetId, this.config.tasksetId))
      .orderBy(asc(tasksetTasks.createdAt));

    return results.map(record => ({
      id: record.id,
      user_message: record.userMessage,
      expected_output: record.expectedOutput,
      source: record.source,
      metadata: record.metadata
    }));
  }

  /**
   * Get or create a taskset integration for this workspace
   * This ensures taskset traces have a proper integration reference
   */
  private async getOrCreateTasksetIntegration(): Promise<string> {
    const existing = await this.drizzle
      .select({ id: integrations.id })
      .from(integrations)
      .where(and(
        eq(integrations.workspaceId, this.config.workspaceId),
        eq(integrations.platform, 'taskset')
      ))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    const integrationId = `int_taskset_${crypto.randomUUID()}`;
    await this.drizzle.insert(integrations).values({
      id: integrationId,
      workspaceId: this.config.workspaceId,
      name: 'Taskset Runs',
      platform: 'taskset',
      apiKeyEncrypted: 'none',
      status: 'active',
    });
    return integrationId;
  }

  /**
   * Execute a single task and create a trace with the results
   * Uses D1TraceCollector to create traces in the same format as playground
   */
  private async executeTask(
    task: {
      id: string;
      user_message: string;
      expected_output: string | null;
      source: string;
      metadata: any;
    },
    agent: {
      id: string;
      name: string;
      prompt_template: string;
      active_version_id: string | null;
    }
  ): Promise<{
    score: number;
    execution_time_ms: number;
  }> {
    const startTime = Date.now();
    const sessionId = `taskset-run-${this.config.jobId}-${task.id}`;

    // Import createPlaygroundDeepAgent dynamically
    const { createPlaygroundDeepAgent } = await import('../playground/agent-deepagents');

    // Use the agent's prompt template directly without variable injection
    // The task's user_message contains the complete question (ART-E spec)
    const systemPrompt = agent.prompt_template;

    // Create agent instance
    const playgroundAgent = await createPlaygroundDeepAgent({
      db: this.deps.db,
      benchmarksDb: this.deps.benchmarksDb, // For email tools (Enron dataset)
      sandbox: this.deps.sandboxBinding,
      sessionId,
      systemPrompt,
      modelProvider: (this.config.modelProvider as any) || 'anthropic',
      modelId: this.config.modelId || 'claude-sonnet-4-5',
      env: {
        DB: this.deps.db,
        BENCHMARKS_DB: this.deps.benchmarksDb,
        CF_ACCOUNT_ID: this.deps.cfAccountId,
        CF_AI_GATEWAY_ID: this.deps.cfGatewayId,
        CF_AI_GATEWAY_TOKEN: this.deps.cfGatewayToken,
        SANDBOX: this.deps.sandboxBinding,
      } as any,
      agentId: agent.id,
    });

    // Get or create taskset integration
    const integrationId = await this.getOrCreateTasksetIntegration();

    // Generate trace ID early so we can track everything
    const traceId = `trace_${crypto.randomUUID()}`;

    // Custom metadata object (will be updated with score after execution)
    const tasksetMetadata: Record<string, unknown> = {
      tasksetSource: true,
      taskId: task.id,
      tasksetId: this.config.tasksetId,
      jobId: this.config.jobId,
      expectedOutput: task.expected_output,
      taskSource: task.source,
      taskMetadata: task.metadata,
    };

    // Initialize trace collector (same as playground but with taskset source)
    const collector = new D1TraceCollector(this.deps.db);
    collector.startTrace(traceId, {
      workspaceId: this.config.workspaceId,
      sessionId,
      agentId: agent.id,
      agentVersionId: agent.active_version_id || '',
      modelProvider: (this.config.modelProvider as any) || 'anthropic',
      modelId: this.config.modelId || 'claude-sonnet-4-5',
      integrationId,
      source: 'taskset',  // Use taskset as source (not playground)
      customMetadata: tasksetMetadata,
    });

    // Track active tool call spans
    const toolSpans = new Map<string, string>();
    let response = '';

    // Create main LLM generation span
    const agentMessages = [{ role: 'user' as const, content: task.user_message }];
    const mainSpanId = collector.startSpan({
      traceId,
      name: 'LLM Generation',
      input: {
        messages: agentMessages,
        model: this.config.modelId || 'claude-sonnet-4-5',
        provider: this.config.modelProvider || 'anthropic',
      },
    });
    collector.logGeneration({
      traceId,
      spanId: mainSpanId,
      name: 'LLM Generation',
      input: { messages: agentMessages },
    });

    // Execute agent with timeout using streaming (to capture spans properly)
    const timeoutMs = this.config.config?.timeout_per_task_ms || 120000;
    let hasError = false;
    let errorMessage: string | undefined;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Task timeout')), timeoutMs)
      );

      // Stream events from the agent (like playground does)
      const streamPromise = (async () => {
        for await (const event of playgroundAgent.stream(agentMessages)) {
          // Track text for response
          if (event.type === 'text-delta' && event.text) {
            response += event.text;
          }

          // Track tool calls in collector
          if (event.type === 'tool-call-start' && event.toolCallId && event.toolName) {
            const spanId = collector.startSpan({
              traceId,
              parentSpanId: mainSpanId,
              name: event.toolName,
              input: { toolName: event.toolName },
            });
            toolSpans.set(event.toolCallId, spanId);
          } else if (event.type === 'tool-call-args' && event.toolCallId && event.args) {
            const spanId = toolSpans.get(event.toolCallId);
            if (spanId) {
              try {
                const parsedArgs = JSON.parse(event.args);
                collector.logToolCall({
                  traceId,
                  spanId,
                  toolName: 'tool',
                  input: parsedArgs,
                });
              } catch {
                collector.logToolCall({
                  traceId,
                  spanId,
                  toolName: 'tool',
                  input: { raw: event.args },
                });
              }
            }
          } else if (event.type === 'tool-result' && event.toolCallId && event.result) {
            const spanId = toolSpans.get(event.toolCallId);
            if (spanId) {
              let resultData: unknown;
              try {
                resultData = JSON.parse(event.result);
              } catch {
                resultData = event.result;
              }
              collector.logToolResult(spanId, resultData);
              collector.endSpan(spanId);
            }
          } else if (event.type === 'error') {
            hasError = true;
            errorMessage = typeof event.error === 'string'
              ? event.error
              : (event.error as any)?.message || 'Unknown error';
          }
        }
        return response;
      })();

      response = await Promise.race([streamPromise, timeoutPromise]);
    } catch (error: any) {
      hasError = true;
      errorMessage = error.message || 'Task execution failed';
      response = `Error: ${errorMessage}`;
    }

    const executionTimeMs = Date.now() - startTime;

    // End main span with output
    collector.endSpan(mainSpanId, {
      output: response,
      usage: { totalTokens: 0 }, // We don't have token counts here
    });

    // Compare response with expected output
    const { score, scoreReason } = await this.compareOutput(response, task.expected_output);

    // Update custom metadata with score results before ending trace
    // Since tasksetMetadata is passed by reference, updating it here will
    // be reflected when the trace is flushed
    tasksetMetadata.score = score;
    tasksetMetadata.scoreReason = scoreReason;
    tasksetMetadata.executionTimeMs = executionTimeMs;
    tasksetMetadata.hasErrors = hasError || score < 0.7;
    if (errorMessage) {
      tasksetMetadata.error = errorMessage;
    }

    // End trace (will flush to DB with proper LangGraphExecutionStep format)
    await collector.endTrace(traceId, response);

    return { score, execution_time_ms: executionTimeMs };
  }

  /**
   * Compare agent response with expected output
   *
   * Scoring strategy:
   * 1. If no expected output, return score 1.0 (task completed)
   * 2. Exact match (case-insensitive, trimmed) = 1.0
   * 3. Response contains expected (substring) = 0.8
   * 4. Otherwise, use LLM to compare and score 0.0-1.0
   */
  private async compareOutput(
    response: string,
    expectedOutput: string | null
  ): Promise<{ score: number; scoreReason: string }> {
    // No expected output means we just check if agent responded
    if (!expectedOutput) {
      return {
        score: response && response.trim().length > 0 ? 1.0 : 0.0,
        scoreReason: response ? 'Agent provided response (no expected output)' : 'Agent did not respond'
      };
    }

    const normalizedResponse = response.trim().toLowerCase();
    const normalizedExpected = expectedOutput.trim().toLowerCase();

    // Exact match
    if (normalizedResponse === normalizedExpected) {
      return {
        score: 1.0,
        scoreReason: 'Exact match'
      };
    }

    // Substring match
    if (normalizedResponse.includes(normalizedExpected)) {
      return {
        score: 0.8,
        scoreReason: 'Response contains expected output'
      };
    }

    // Use LLM to compare
    return await this.llmCompare(response, expectedOutput);
  }

  /**
   * Use LLM to compare response with expected output
   */
  private async llmCompare(
    response: string,
    expectedOutput: string
  ): Promise<{ score: number; scoreReason: string }> {
    try {
      const client = createGatewayClient({
        CF_ACCOUNT_ID: this.deps.cfAccountId,
        CF_AI_GATEWAY_ID: this.deps.cfGatewayId,
        CF_AI_GATEWAY_TOKEN: this.deps.cfGatewayToken,
      });

      const prompt = `You are an evaluation judge. Compare the agent's response with the expected output and determine how well it matches.

Expected Output:
${expectedOutput}

Agent Response:
${response}

Score the match on a scale of 0.0 to 1.0:
- 1.0: Perfect match or semantically equivalent
- 0.7-0.9: Mostly correct, minor differences
- 0.4-0.6: Partially correct
- 0.0-0.3: Incorrect or missing key information

Respond with JSON only:
{
  "score": 0.0-1.0,
  "reason": "brief explanation"
}`;

      const result = await chatCompletion(client, {
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        maxTokens: 256,
      });

      // Parse LLM response
      const parsed = JSON.parse(result.content);
      return {
        score: Math.max(0, Math.min(1, parsed.score)),
        scoreReason: parsed.reason || 'LLM comparison'
      };
    } catch (error: any) {
      console.error('[TasksetRunJob] LLM comparison failed:', error);
      // Fallback: return medium score
      return {
        score: 0.5,
        scoreReason: `LLM comparison failed: ${error.message}`
      };
    }
  }

  /**
   * Record a failed task as a trace with error information
   */
  private async recordFailedResult(
    taskId: string,
    errorMessage: string,
    task?: {
      user_message: string;
      expected_output: string | null;
      source: string;
      metadata: any;
    },
    agentVersionId?: string | null
  ): Promise<void> {
    const now = new Date().toISOString();
    const traceId = this.generateId('trc');

    // Build steps with error
    const steps: unknown[] = task ? [
      {
        type: 'user_message',
        content: task.user_message,
        timestamp: now,
      },
      {
        type: 'error',
        error: errorMessage,
        timestamp: now,
      },
    ] : [
      {
        type: 'error',
        error: errorMessage,
        timestamp: now,
      },
    ];

    await this.drizzle
      .insert(traces)
      .values({
        id: traceId,
        workspaceId: this.config.workspaceId,
        integrationId: null,
        traceId: `taskset-${this.config.jobId}-${taskId}`,
        source: 'taskset',
        timestamp: now,
        metadata: {
          tasksetSource: true,
          taskId,
          tasksetId: this.config.tasksetId,
          jobId: this.config.jobId,
          expectedOutput: task?.expected_output ?? null,
          score: 0.0,
          scoreReason: `Error: ${errorMessage}`,
          taskSource: task?.source,
          taskMetadata: task?.metadata,
          error: errorMessage,
        },
        steps,
        inputPreview: task?.user_message?.substring(0, 200) ?? '',
        outputPreview: `Error: ${errorMessage.substring(0, 180)}`,
        stepCount: steps.length,
        hasErrors: true,
        agentVersionId: agentVersionId ?? null,
        assignmentStatus: 'assigned',
        importedAt: now,
      });
  }

  /**
   * Generate ID with prefix
   */
  private generateId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }

  /**
   * Emit progress event to stream and update database
   */
  private async emitProgress(status: string, progress: number, extra?: any) {
    // Build human-readable message from status and extra data
    const message = this.buildStatusMessage(status, extra);

    // Update progress in database with log message (for SSE polling)
    await this.jobManager.updateJobProgress(this.config.jobId, Math.round(progress), message);

    // Also send to direct SSE stream if available
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
      this.stream.sendLog('info', message);
    }
  }

  /**
   * Build human-readable status message
   */
  private buildStatusMessage(status: string, extra?: any): string {
    switch (status) {
      case 'initializing':
        return 'Initializing taskset run...';
      case 'fetching_agent':
        return 'Fetching agent configuration...';
      case 'fetching_tasks':
        return 'Loading tasks from taskset...';
      case 'executing_tasks':
        return `Starting parallel execution of ${extra?.total_tasks || 0} tasks (parallelism: ${extra?.parallelism || 4})`;
      case 'executing_tasks_parallel':
        return `Executing tasks: ${extra?.completed_tasks || 0}/${extra?.total_tasks || 0} completed (${extra?.in_progress || 0} in progress)`;
      case 'executing_task':
        return `Executing task ${extra?.current_task || 0}/${extra?.total_tasks || 0}`;
      case 'finalizing':
        return 'Finalizing results...';
      case 'completed':
        return 'Taskset run completed successfully';
      default:
        return status;
    }
  }
}
