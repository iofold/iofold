import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';
import { createGatewayClient, chatCompletion, DEFAULT_MODEL } from '../ai/gateway';
import { createDb, type Database } from '../db/client';
import { eq, and, asc } from 'drizzle-orm';
import { tasksetRuns, tasksetTasks, tasksetRunResults, agents, agentVersions } from '../db/schema';

export interface TasksetRunJobConfig {
  jobId: string;
  runId: string;
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
  run_id: string;
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
 * 3. Capture response
 * 4. Compare with expected_output using simple scoring:
 *    - Exact match = 1.0
 *    - Contains expected (substring) = 0.8
 *    - Otherwise, use LLM comparison
 * 5. Insert result to taskset_run_results (trace_id is optional/null)
 * 6. Update taskset_runs progress
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
      this.emitProgress('initializing', 0);

      // Step 1: Update run status to 'running' and set started_at
      await this.drizzle
        .update(tasksetRuns)
        .set({
          status: 'running',
          startedAt: new Date().toISOString()
        })
        .where(eq(tasksetRuns.id, this.config.runId));

      this.emitProgress('fetching_agent', 5);

      // Step 2: Fetch agent details
      const agent = await this.fetchAgent();
      if (!agent) {
        throw new Error(`Agent ${this.config.agentId} not found`);
      }

      this.emitProgress('fetching_tasks', 10);

      // Step 3: Fetch all tasks from taskset
      const tasks = await this.fetchTasks();
      if (tasks.length === 0) {
        throw new Error(`No tasks found in taskset ${this.config.tasksetId}`);
      }

      this.emitProgress('executing_tasks', 15, {
        total_tasks: tasks.length
      });

      // Step 4: Execute each task
      let completedCount = 0;
      let failedCount = 0;
      let totalScore = 0;
      let totalExecutionTime = 0;

      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const progress = 15 + ((i / tasks.length) * 75);

        this.emitProgress('executing_task', progress, {
          current_task: i + 1,
          total_tasks: tasks.length,
          task_id: task.id
        });

        try {
          const result = await this.executeTask(task, agent);

          completedCount++;
          totalScore += result.score;
          totalExecutionTime += result.execution_time_ms;

          // Update run progress
          await this.drizzle
            .update(tasksetRuns)
            .set({ completedCount })
            .where(eq(tasksetRuns.id, this.config.runId));
        } catch (error: any) {
          console.error(`[TasksetRunJob] Task ${task.id} failed:`, error);

          failedCount++;

          // Record failed result
          await this.recordFailedResult(task.id, error.message);

          // Update run progress
          await this.drizzle
            .update(tasksetRuns)
            .set({ failedCount })
            .where(eq(tasksetRuns.id, this.config.runId));
        }
      }

      this.emitProgress('finalizing', 95);

      // Step 5: Calculate final metrics
      const averageScore = completedCount > 0 ? totalScore / completedCount : 0;
      const averageExecutionTime = completedCount > 0 ? totalExecutionTime / completedCount : 0;

      // Step 6: Update run status to final state
      const finalStatus = failedCount === 0 ? 'completed' : failedCount < tasks.length ? 'partial' : 'failed';

      await this.drizzle
        .update(tasksetRuns)
        .set({
          status: finalStatus,
          completedAt: new Date().toISOString()
        })
        .where(eq(tasksetRuns.id, this.config.runId));

      const result: TasksetRunJobResult = {
        run_id: this.config.runId,
        status: finalStatus,
        task_count: tasks.length,
        completed_count: completedCount,
        failed_count: failedCount,
        average_score: averageScore,
        average_execution_time_ms: averageExecutionTime
      };

      // Mark job as completed
      await this.jobManager.completeJob(this.config.jobId, result);
      this.emitProgress('completed', 100);

      return result;
    } catch (error: any) {
      console.error('[TasksetRunJob] Job failed:', error);

      // Update run status to failed
      await this.drizzle
        .update(tasksetRuns)
        .set({
          status: 'failed',
          error: error.message,
          completedAt: new Date().toISOString()
        })
        .where(eq(tasksetRuns.id, this.config.runId));

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
   * Execute a single task
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
    const sessionId = `taskset-run-${this.config.runId}-${task.id}`;

    // Import createPlaygroundDeepAgent dynamically
    const { createPlaygroundDeepAgent } = await import('../playground/agent-deepagents');

    // Build dynamic system prompt with task metadata (like ART-E benchmark does)
    // This allows tasks to specify context like inbox_address, query_date, etc.
    const systemPrompt = this.buildSystemPrompt(agent.prompt_template, task.metadata);

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

    // Execute agent with timeout (2 minutes default - email tools may take longer)
    const timeoutMs = this.config.config?.timeout_per_task_ms || 120000;
    const messages = [{ role: 'user' as const, content: task.user_message }];

    const response = await Promise.race([
      playgroundAgent.invoke(messages),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Task timeout')), timeoutMs)
      ),
    ]);

    const executionTimeMs = Date.now() - startTime;

    // Trace creation is optional for taskset runs. The traces table requires an
    // integration_id (FK to integrations table), but taskset runs are standalone
    // executions without a trace integration. All execution data is stored in
    // taskset_run_results instead, including response, score, and execution time.
    const traceId: string | null = null;

    // Compare response with expected output
    const { score, scoreReason } = await this.compareOutput(response, task.expected_output);

    // Store result
    const resultId = this.generateId('trr');
    const status = score >= 0.7 ? 'completed' : 'failed';

    await this.drizzle
      .insert(tasksetRunResults)
      .values({
        id: resultId,
        runId: this.config.runId,
        taskId: task.id,
        status,
        response,
        expectedOutput: task.expected_output,
        score,
        scoreReason,
        traceId,
        executionTimeMs,
        createdAt: new Date().toISOString()
      });

    return { score, execution_time_ms: executionTimeMs };
  }

  /**
   * Build system prompt by substituting template variables with task metadata
   *
   * Following the ART-E benchmark approach: the agent's prompt template can
   * contain variables like {{variable_name}} which get replaced with values
   * from the task's metadata.
   *
   * Example template:
   *   "Today's date is {{query_date}}. The user's inbox is {{inbox_address}}."
   *
   * Example metadata:
   *   { "query_date": "2001-05-15", "inbox_address": "jeff.dasovich@enron.com" }
   *
   * Result:
   *   "Today's date is 2001-05-15. The user's inbox is jeff.dasovich@enron.com."
   */
  private buildSystemPrompt(agentTemplate: string, metadata: any): string {
    if (!metadata || typeof metadata !== 'object') {
      return agentTemplate;
    }

    // Replace all {{variable}} patterns with values from metadata
    return agentTemplate.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      if (varName in metadata && metadata[varName] != null) {
        return String(metadata[varName]);
      }
      // Keep original placeholder if no value provided
      return match;
    });
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
   * Record a failed task result
   */
  private async recordFailedResult(taskId: string, errorMessage: string): Promise<void> {
    const resultId = this.generateId('trr');

    await this.drizzle
      .insert(tasksetRunResults)
      .values({
        id: resultId,
        runId: this.config.runId,
        taskId,
        status: 'failed',
        error: errorMessage,
        score: 0.0,
        createdAt: new Date().toISOString()
      });
  }

  /**
   * Generate ID with prefix
   */
  private generateId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }

  /**
   * Emit progress event to stream
   */
  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
