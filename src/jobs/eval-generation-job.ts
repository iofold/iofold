import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { EvalGenerator } from '../eval-generator/generator';
import { EvalTester } from '../eval-generator/tester';
import type { Trace } from '../types/trace';
import type { GenerateEvalJobResult } from '../types/api';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';

export interface EvalGenerationJobConfig {
  jobId: string;
  agentId: string;
  name: string;
  description?: string;
  model?: string;
  customInstructions?: string;
  workspaceId: string;
  /** Parent eval ID for refinement (auto-refine jobs) */
  parentEvalId?: string;
  /** Include contradicting cases in generation */
  includeContradictions?: boolean;
}

export interface EvalGenerationJobDeps {
  db: D1Database;
  anthropicApiKey: string;
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
}

export class EvalGenerationJob {
  private jobManager: JobManager;
  private generator: EvalGenerator;
  private tester: EvalTester;
  private stream?: SSEStream;

  constructor(
    private config: EvalGenerationJobConfig,
    private deps: EvalGenerationJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
    this.generator = new EvalGenerator({
      anthropicApiKey: deps.anthropicApiKey,
      model: config.model || 'claude-sonnet-4-5-20250929'
    });
    this.tester = new EvalTester({
      sandboxBinding: deps.sandboxBinding
    });
  }

  async execute(stream?: SSEStream): Promise<GenerateEvalJobResult> {
    this.stream = stream;

    try {
      // Update job to running
      await this.jobManager.updateJobStatus(this.config.jobId, 'running', 0);
      this.emitProgress('fetching_traces', 0);

      // Step 1: Fetch feedback from eval set
      const feedback = await this.fetchFeedback();
      if (feedback.positive.length === 0 || feedback.negative.length === 0) {
        throw new Error('Insufficient examples: need at least 1 positive and 1 negative example');
      }

      this.emitProgress('calling_llm', 20);

      // Step 2: Generate eval code using LLM
      const generationResult = await this.generator.generate({
        name: this.config.name,
        positiveExamples: feedback.positive,
        negativeExamples: feedback.negative
      });

      this.emitProgress('validating_code', 60);

      // Step 3: Test against training set
      const testCases = [
        ...feedback.positive.map(trace => ({ trace, expectedPass: true })),
        ...feedback.negative.map(trace => ({ trace, expectedPass: false }))
      ];

      this.emitProgress('testing_accuracy', 70, {
        tested: 0,
        total: testCases.length
      });

      const testResult = await this.tester.test(generationResult.code, testCases);

      this.emitProgress('saving_eval', 90);

      // Step 4: Save eval to database
      const evalId = `eval_${crypto.randomUUID()}`;

      // Get next version number for this agent
      const versionResult = await this.deps.db
        .prepare('SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM evals WHERE agent_id = ?')
        .bind(this.config.agentId)
        .first();
      const version = (versionResult?.next_version as number) || 1;

      await this.deps.db
        .prepare(
          `INSERT INTO evals (
            id, agent_id, version, name, description, code, model_used,
            accuracy, test_results, execution_count, contradiction_count,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          evalId,
          this.config.agentId,
          version,
          this.config.name,
          this.config.description || null,
          generationResult.code,
          generationResult.metadata.model,
          testResult.accuracy,
          JSON.stringify(testResult),
          0,
          0,
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run();

      // Step 5: Store test execution results
      await this.storeTestExecutions(evalId, testResult.details);

      const result: GenerateEvalJobResult = {
        eval_id: evalId,
        accuracy: testResult.accuracy,
        test_results: {
          correct: testResult.correct,
          incorrect: testResult.incorrect,
          errors: testResult.errors,
          total: testResult.total,
          details: testResult.details.map(d => ({
            trace_id: d.traceId,
            expected: d.expected,
            predicted: d.predicted,
            match: d.match,
            reason: d.reason,
            execution_time_ms: d.executionTimeMs,
            error: d.error
          }))
        }
      };

      // Mark job as completed
      await this.jobManager.completeJob(this.config.jobId, result);
      this.emitProgress('completed', 100);

      return result;
    } catch (error: any) {
      console.error('Eval generation job failed:', error);
      await this.jobManager.failJob(this.config.jobId, error.message);

      if (this.stream) {
        this.stream.sendFailed(error.message, error.stack);
      }

      throw error;
    }
  }

  private async fetchFeedback(): Promise<{
    positive: Trace[];
    negative: Trace[];
  }> {
    // Fetch all feedback for the agent
    const feedbackRecords = await this.deps.db
      .prepare(
        `SELECT f.trace_id, f.rating, t.id, t.trace_id as external_trace_id,
                t.source, t.steps, t.raw_data
         FROM feedback f
         JOIN traces t ON f.trace_id = t.id
         WHERE f.agent_id = ? AND f.rating IN ('positive', 'negative')`
      )
      .bind(this.config.agentId)
      .all();

    const positive: Trace[] = [];
    const negative: Trace[] = [];

    for (const record of feedbackRecords.results) {
      // Parse steps - can be stored as JSON string or as raw data
      let steps = [];
      try {
        steps = typeof record.steps === 'string'
          ? JSON.parse(record.steps)
          : (record.steps || []);
      } catch (e) {
        console.warn(`Failed to parse steps for trace ${record.id}:`, e);
        steps = [];
      }

      // Parse raw_data - can be null or JSON string
      let rawData = null;
      try {
        rawData = record.raw_data
          ? (typeof record.raw_data === 'string' ? JSON.parse(record.raw_data) : record.raw_data)
          : null;
      } catch (e) {
        console.warn(`Failed to parse raw_data for trace ${record.id}:`, e);
      }

      const trace: Trace = {
        id: record.id as string,
        trace_id: record.external_trace_id as string,
        source: record.source as 'langfuse' | 'langsmith' | 'openai',
        steps,
        raw_data: rawData
      };

      if (record.rating === 'positive') {
        positive.push(trace);
      } else if (record.rating === 'negative') {
        negative.push(trace);
      }
    }

    return { positive, negative };
  }

  private async storeTestExecutions(
    evalId: string,
    results: Array<{
      traceId: string;
      predicted: boolean;
      reason: string;
      executionTimeMs: number;
      error?: string;
    }>
  ): Promise<void> {
    const statements = results.map(result =>
      this.deps.db
        .prepare(
          `INSERT OR REPLACE INTO eval_executions (
            id, eval_id, trace_id, predicted_result, predicted_reason, execution_time_ms, executed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          evalId,
          result.traceId,
          result.predicted ? 1 : 0,
          result.reason,
          result.executionTimeMs,
          new Date().toISOString()
        )
    );

    if (statements.length > 0) {
      await this.deps.db.batch(statements);
    }
  }

  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
