import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { PythonRunner } from '../sandbox/python-runner';
import type { Trace } from '../types/trace';
import type { ExecuteEvalJobResult } from '../types/api';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';

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

  constructor(
    private config: EvalExecutionJobConfig,
    private deps: EvalExecutionJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
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
      const evalRecord = await this.deps.db
        .prepare('SELECT id, code, eval_set_id FROM evals WHERE id = ?')
        .bind(this.config.evalId)
        .first();

      if (!evalRecord) {
        throw new Error(`Eval ${this.config.evalId} not found`);
      }

      const evalCode = evalRecord.code as string;
      const evalSetId = evalRecord.eval_set_id as string;

      // Step 2: Get traces to execute against
      const traces = await this.fetchTraces(evalSetId);

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
      await this.deps.db
        .prepare(
          `UPDATE evals
           SET execution_count = execution_count + ?,
               updated_at = ?
           WHERE id = ?`
        )
        .bind(results.completed, new Date().toISOString(), this.config.evalId)
        .run();

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

  private async fetchTraces(evalSetId: string): Promise<Trace[]> {
    let query: string;
    let bindings: any[];

    if (this.config.traceIds && this.config.traceIds.length > 0) {
      // Execute against specific traces
      const placeholders = this.config.traceIds.map(() => '?').join(',');
      query = `SELECT * FROM traces WHERE id IN (${placeholders})`;
      bindings = this.config.traceIds;
    } else {
      // Execute against all traces in eval set (that have feedback)
      query = `
        SELECT DISTINCT t.*
        FROM traces t
        JOIN feedback f ON t.id = f.trace_id
        WHERE f.eval_set_id = ?
      `;
      bindings = [evalSetId];
    }

    const results = await this.deps.db.prepare(query).bind(...bindings).all();

    return results.results.map(record => ({
      id: record.id as string,
      trace_id: record.trace_id as string,
      source: record.source as 'langfuse' | 'langsmith' | 'openai',
      steps: JSON.parse(record.normalized_data as string),
      raw_data: JSON.parse(record.raw_data as string)
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
    const now = new Date().toISOString();

    // Use INSERT OR REPLACE to handle re-execution (force = true)
    const statements = results.map(result =>
      this.deps.db
        .prepare(
          `INSERT OR REPLACE INTO eval_executions (
            id, eval_id, trace_id, result, reason, execution_time_ms,
            error, stdout, stderr, created_at
          ) VALUES (
            (SELECT id FROM eval_executions WHERE eval_id = ? AND trace_id = ?),
            ?, ?, ?, ?, ?, ?, ?, ?
          )`
        )
        .bind(
          evalId,
          result.traceId,
          evalId,
          result.traceId,
          result.result ? 1 : 0,
          result.reason,
          result.executionTimeMs,
          result.error || null,
          result.stdout || null,
          result.stderr || null,
          now
        )
    );

    if (statements.length > 0) {
      await this.deps.db.batch(statements);
    }

    // Update contradiction count
    await this.updateContradictionCount(evalId);
  }

  private async updateContradictionCount(evalId: string): Promise<void> {
    // Count contradictions using the eval_comparison view
    const result = await this.deps.db
      .prepare(
        `SELECT COUNT(*) as count
         FROM eval_comparison
         WHERE eval_id = ? AND is_contradiction = 1`
      )
      .bind(evalId)
      .first();

    const count = result?.count as number || 0;

    await this.deps.db
      .prepare('UPDATE evals SET contradiction_count = ? WHERE id = ?')
      .bind(count, evalId)
      .run();
  }

  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
