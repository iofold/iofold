import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { eq, sql, inArray, and } from 'drizzle-orm';
import { PythonRunner } from '../sandbox/python-runner';
import type { Trace } from '../types/trace';
import type { ExecuteEvalJobResult } from '../types/api';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';
import { createDb, type Database } from '../db/client';
import { evals, traces, feedback, evalExecutions, evalComparison } from '../db/schema';

export interface EvalExecutionJobConfig {
  jobId: string;
  evalId: string;
  traceIds?: string[];
  force?: boolean;
  workspaceId: string;
}

export interface EvalExecutionJobDeps {
  db: D1Database;
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
}

export class EvalExecutionJob {
  private jobManager: JobManager;
  private runner: PythonRunner;
  private stream?: SSEStream;
  private drizzle: Database;

  constructor(
    private config: EvalExecutionJobConfig,
    private deps: EvalExecutionJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
    this.drizzle = createDb(deps.db);
    this.runner = new PythonRunner({
      sandboxBinding: deps.sandboxBinding,
      timeout: 5000
    });
  }

  async execute(stream?: SSEStream): Promise<ExecuteEvalJobResult> {
    this.stream = stream;

    try {
      // Update job to running
      await this.jobManager.updateJobStatus(this.config.jobId, 'running', 0);

      // Step 1: Fetch eval code
      const evalRecord = await this.drizzle
        .select({
          id: evals.id,
          code: evals.code,
          agentId: evals.agentId
        })
        .from(evals)
        .where(eq(evals.id, this.config.evalId))
        .limit(1);

      if (evalRecord.length === 0) {
        throw new Error(`Eval ${this.config.evalId} not found`);
      }

      const evalCode = evalRecord[0].code;
      const agentId = evalRecord[0].agentId;

      // Step 2: Get traces to execute against
      const traces = await this.fetchTraces(agentId);

      if (traces.length === 0) {
        throw new Error('No traces found to execute against');
      }

      this.emitProgress('running', 0, {
        completed: 0,
        total: traces.length
      });

      // Step 3: Execute eval against each trace
      const results: ExecuteEvalJobResult = {
        completed: 0,
        failed: 0,
        errors: []
      };

      const executionResults: Array<{
        traceId: string;
        result: boolean;
        reason: string;
        executionTimeMs: number;
        error?: string;
        stdout?: string;
        stderr?: string;
      }> = [];

      for (let i = 0; i < traces.length; i++) {
        const trace = traces[i];

        try {
          const execution = await this.executeOnTrace(evalCode, trace);
          executionResults.push({
            traceId: trace.id,
            result: execution.result,
            reason: execution.reason,
            executionTimeMs: execution.executionTimeMs,
            error: execution.error,
            stdout: execution.stdout,
            stderr: execution.stderr
          });

          if (execution.error) {
            results.failed++;
            results.errors.push({
              trace_id: trace.id,
              error: execution.error
            });
          } else {
            results.completed++;
          }
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            trace_id: trace.id,
            error: error.message
          });

          executionResults.push({
            traceId: trace.id,
            result: false,
            reason: '',
            executionTimeMs: 0,
            error: error.message
          });
        }

        // Emit progress
        const progress = Math.floor(((i + 1) / traces.length) * 100);
        const avgExecutionTime =
          executionResults.reduce((sum, r) => sum + r.executionTimeMs, 0) / executionResults.length;

        this.emitProgress('running', progress, {
          completed: results.completed,
          failed: results.failed,
          total: traces.length,
          avg_execution_time_ms: Math.round(avgExecutionTime)
        });
      }

      // Step 4: Store execution results in database
      await this.storeExecutionResults(this.config.evalId, executionResults);

      // Step 5: Update eval execution count
      await this.drizzle
        .update(evals)
        .set({
          executionCount: sql`${evals.executionCount} + ${results.completed}`,
          updatedAt: new Date().toISOString()
        })
        .where(eq(evals.id, this.config.evalId));

      // Mark job as completed
      await this.jobManager.completeJob(this.config.jobId, results);
      this.emitProgress('completed', 100, results);

      return results;
    } catch (error: any) {
      console.error('Eval execution job failed:', error);
      await this.jobManager.failJob(this.config.jobId, error.message);

      if (this.stream) {
        this.stream.sendFailed(error.message, error.stack);
      }

      throw error;
    }
  }

  private async fetchTraces(agentId: string): Promise<Trace[]> {
    let results;

    if (this.config.traceIds && this.config.traceIds.length > 0) {
      // Execute against specific traces
      results = await this.drizzle
        .select()
        .from(traces)
        .where(inArray(traces.id, this.config.traceIds));
    } else {
      // Execute against all traces for agent (that have feedback)
      results = await this.drizzle
        .selectDistinct({
          id: traces.id,
          traceId: traces.traceId,
          source: traces.source,
          steps: traces.steps,
          rawData: traces.rawData
        })
        .from(traces)
        .innerJoin(feedback, eq(traces.id, feedback.traceId))
        .where(eq(feedback.agentId, agentId));
    }

    return results.map(record => ({
      id: record.id,
      trace_id: record.traceId,
      source: record.source as 'langfuse' | 'langsmith' | 'openai' | 'playground',
      steps: typeof record.steps === 'string' ? JSON.parse(record.steps) : record.steps,
      raw_data: typeof record.rawData === 'string' ? JSON.parse(record.rawData as string) : record.rawData
    }));
  }

  private async executeOnTrace(
    evalCode: string,
    trace: Trace
  ): Promise<{
    result: boolean;
    reason: string;
    executionTimeMs: number;
    error?: string;
    stdout?: string;
    stderr?: string;
  }> {
    // Prepare trace data
    const traceData = {
      trace_id: trace.trace_id,
      steps: trace.steps.map(step => ({
        input: step.input,
        output: step.output,
        tool_calls: step.tool_calls,
        error: step.error
      }))
    };

    // Extract function name
    const functionNameMatch = evalCode.match(/def\s+(\w+)\s*\(/);
    const functionName = functionNameMatch ? functionNameMatch[1] : 'eval_function';

    // Build execution code
    const traceJson = JSON.stringify(traceData).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const executionCode = `
import json

${evalCode}

trace_data = json.loads("${traceJson}")
result = ${functionName}(trace_data)
result_dict = {"passed": result[0], "reason": result[1]}
print(json.dumps(result_dict))
`;

    // Execute
    const execution = await this.runner.execute(executionCode);

    if (!execution.success) {
      return {
        result: false,
        reason: '',
        executionTimeMs: execution.executionTimeMs,
        error: execution.error,
        stdout: execution.output,
        stderr: execution.error
      };
    }

    // Parse result
    const output = execution.output || '';
    const resultMatch = output.match(/\{"passed":\s*(true|false),\s*"reason":\s*"([^"]*)"\}/);

    if (!resultMatch) {
      return {
        result: false,
        reason: '',
        executionTimeMs: execution.executionTimeMs,
        error: `Could not parse eval result. Output: ${output}`,
        stdout: output
      };
    }

    return {
      result: resultMatch[1] === 'true',
      reason: resultMatch[2],
      executionTimeMs: execution.executionTimeMs,
      stdout: output
    };
  }

  private async storeExecutionResults(
    evalId: string,
    results: Array<{
      traceId: string;
      result: boolean;
      reason: string;
      executionTimeMs: number;
      error?: string;
      stdout?: string;
      stderr?: string;
    }>
  ): Promise<void> {
    if (results.length === 0) return;

    const now = new Date().toISOString();

    // Handle INSERT OR REPLACE by checking for existing records first
    for (const result of results) {
      // Check if execution already exists
      const existing = await this.drizzle
        .select({ id: evalExecutions.id })
        .from(evalExecutions)
        .where(
          and(
            eq(evalExecutions.evalId, evalId),
            eq(evalExecutions.traceId, result.traceId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing record
        await this.drizzle
          .update(evalExecutions)
          .set({
            predictedResult: result.result,
            predictedReason: result.reason,
            executionTimeMs: result.executionTimeMs,
            error: result.error || null,
            stdout: result.stdout || null,
            stderr: result.stderr || null,
            executedAt: now
          })
          .where(eq(evalExecutions.id, existing[0].id));
      } else {
        // Insert new record
        await this.drizzle.insert(evalExecutions).values({
          id: crypto.randomUUID(),
          evalId,
          traceId: result.traceId,
          predictedResult: result.result,
          predictedReason: result.reason,
          executionTimeMs: result.executionTimeMs,
          error: result.error || null,
          stdout: result.stdout || null,
          stderr: result.stderr || null,
          executedAt: now
        });
      }
    }

    // Update contradiction count
    await this.updateContradictionCount(evalId);
  }

  private async updateContradictionCount(evalId: string): Promise<void> {
    // Count contradictions using the eval_comparison view (Drizzle type-safe)
    const result = await this.drizzle
      .select({
        count: sql<number>`COUNT(*)`
      })
      .from(evalComparison)
      .where(and(
        eq(evalComparison.evalId, evalId),
        eq(evalComparison.isContradiction, 1)
      ));

    const count = result[0]?.count || 0;

    await this.drizzle
      .update(evals)
      .set({ contradictionCount: count })
      .where(eq(evals.id, evalId));
  }

  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
