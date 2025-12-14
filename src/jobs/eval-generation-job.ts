import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { eq, sql } from 'drizzle-orm';
import { EvalGenerator } from '../eval-generator/generator';
import { EvalTester, type TestCaseResult } from '../eval-generator/tester';
import type { Trace } from '../types/trace';
import type { GenerateEvalJobResult } from '../types/api';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';
import { createDb, type Database } from '../db/client';
import { evals, feedback, traces, evalCandidateExecutions } from '../db/schema';

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
  /** Cloudflare Account ID for AI Gateway */
  cfAccountId: string;
  /** Cloudflare AI Gateway ID */
  cfGatewayId: string;
  /** Optional AI Gateway authentication token */
  cfGatewayToken?: string;
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
}

export class EvalGenerationJob {
  private jobManager: JobManager;
  private generator: EvalGenerator;
  private tester: EvalTester;
  private stream?: SSEStream;
  private drizzle: Database;

  constructor(
    private config: EvalGenerationJobConfig,
    private deps: EvalGenerationJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
    this.drizzle = createDb(deps.db);
    this.generator = new EvalGenerator({
      cfAccountId: deps.cfAccountId,
      cfGatewayId: deps.cfGatewayId,
      cfGatewayToken: deps.cfGatewayToken,
      model: config.model || 'anthropic/claude-sonnet-4-5'
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
      this.stream?.sendLog('info', 'Starting eval generation job...', {
        jobId: this.config.jobId,
        agentId: this.config.agentId
      });
      this.emitProgress('fetching_traces', 0);

      // Step 1: Fetch feedback from eval set
      this.stream?.sendLog('info', 'Fetching labeled traces for training...');
      const feedback = await this.fetchFeedback();
      if (feedback.positive.length === 0 || feedback.negative.length === 0) {
        throw new Error('Insufficient examples: need at least 1 positive and 1 negative example');
      }

      this.stream?.sendLog('info', 'Retrieved training examples', {
        positive: feedback.positive.length,
        negative: feedback.negative.length,
        total: feedback.positive.length + feedback.negative.length
      });

      this.emitProgress('calling_llm', 20);

      // Step 2: Generate eval code using LLM
      this.stream?.sendLog('info', 'Generating eval function with AI...', {
        model: this.config.model || 'anthropic/claude-sonnet-4-5'
      });
      const generationResult = await this.generator.generate({
        name: this.config.name,
        positiveExamples: feedback.positive,
        negativeExamples: feedback.negative
      });

      this.stream?.sendLog('info', 'AI generation completed', {
        model: generationResult.metadata.model,
        codeLength: generationResult.code.length
      });

      this.emitProgress('validating_code', 60);

      // Step 3: Test against training set
      // expectedScore: 1.0 = high quality (positive), 0.0 = low quality (negative)
      const testCases = [
        ...feedback.positive.map(trace => ({ trace, expectedScore: 1.0 })),
        ...feedback.negative.map(trace => ({ trace, expectedScore: 0.0 }))
      ];

      this.stream?.sendLog('info', 'Validating generated eval code...', {
        testCases: testCases.length
      });

      this.emitProgress('testing_accuracy', 70, {
        tested: 0,
        total: testCases.length
      });

      const testResult = await this.tester.test(generationResult.code, testCases);

      this.stream?.sendLog('info', 'Validation completed', {
        accuracy: `${(testResult.accuracy * 100).toFixed(1)}%`,
        correct: testResult.correct,
        incorrect: testResult.incorrect,
        errors: testResult.errors
      });

      this.emitProgress('saving_eval', 90);

      // Step 4: Save eval to database
      this.stream?.sendLog('info', 'Saving eval to database...');
      const evalId = `eval_${crypto.randomUUID()}`;

      // Get next version number for this agent
      const versionResult = await this.drizzle
        .select({
          nextVersion: sql<number>`COALESCE(MAX(${evals.version}), 0) + 1`
        })
        .from(evals)
        .where(eq(evals.agentId, this.config.agentId))
        .limit(1);
      const version = versionResult[0]?.nextVersion || 1;

      const now = new Date().toISOString();
      await this.drizzle.insert(evals).values({
        id: evalId,
        agentId: this.config.agentId,
        version,
        name: this.config.name,
        description: this.config.description || null,
        code: generationResult.code,
        modelUsed: generationResult.metadata.model,
        accuracy: testResult.accuracy,
        testResults: testResult as unknown as Record<string, unknown>,
        executionCount: 0,
        contradictionCount: 0,
        createdAt: now,
        updatedAt: now
      });

      // Step 5: Test execution results are stored in evals.test_results JSON
      // Note: eval_executions table is for GEPA eval_candidates flow, not simple evals
      // Results are already persisted via the INSERT INTO evals above

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
            expected: d.expectedScore,
            predicted: d.predictedScore,
            match: d.match,
            reason: d.feedback,
            execution_time_ms: d.executionTimeMs,
            error: d.error
          }))
        }
      };

      // Mark job as completed
      await this.jobManager.completeJob(this.config.jobId, result);
      this.stream?.sendLog('info', 'Eval generation completed successfully', {
        evalId,
        version,
        accuracy: `${(testResult.accuracy * 100).toFixed(1)}%`
      });
      this.emitProgress('completed', 100);

      return result;
    } catch (error: any) {
      console.error('Eval generation job failed:', error);
      this.stream?.sendLog('error', 'Eval generation failed', {
        error: error.message
      });
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
    const feedbackRecords = await this.drizzle
      .select({
        traceId: feedback.traceId,
        rating: feedback.rating,
        id: traces.id,
        externalTraceId: traces.traceId,
        source: traces.source,
        steps: traces.steps,
        rawData: traces.rawData
      })
      .from(feedback)
      .innerJoin(traces, eq(feedback.traceId, traces.id))
      .where(
        sql`${feedback.agentId} = ${this.config.agentId} AND ${feedback.rating} IN ('positive', 'negative')`
      );

    const positive: Trace[] = [];
    const negative: Trace[] = [];

    for (const record of feedbackRecords) {
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
        rawData = record.rawData
          ? (typeof record.rawData === 'string' ? JSON.parse(record.rawData) : record.rawData)
          : null;
      } catch (e) {
        console.warn(`Failed to parse raw_data for trace ${record.id}:`, e);
      }

      const trace: Trace = {
        id: record.id,
        trace_id: record.externalTraceId,
        source: record.source,
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
    results: TestCaseResult[]
  ): Promise<void> {
    // Store test executions in eval_candidate_executions table (GEPA flow)
    // Maps: eval_id -> eval_candidate_id, predictedScore -> score, feedback -> feedback
    if (results.length === 0) return;

    const now = new Date().toISOString();
    const values = results.map(result => ({
      id: crypto.randomUUID(),
      evalCandidateId: evalId,
      traceId: result.traceId,
      score: result.predictedScore,
      feedback: result.feedback,
      success: result.error ? false : true,
      durationMs: result.executionTimeMs,
      createdAt: now
    }));

    // Note: Drizzle doesn't support INSERT OR REPLACE directly
    // We would need to handle this with individual upserts or accept insert-only
    // For now, using insert-only to maintain compatibility
    await this.drizzle.insert(evalCandidateExecutions).values(values);
  }

  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
