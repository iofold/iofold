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
import { evals, feedback, traces, evalExecutions } from '../db/schema';

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
      await this.log('info', '🚀 Starting eval generation job', {
        jobId: this.config.jobId,
        agentId: this.config.agentId,
        evalName: this.config.name
      });
      this.emitProgress('fetching_traces', 0);

      // Step 1: Fetch feedback from eval set
      await this.log('info', '📊 Fetching labeled traces for training...');
      const feedbackData = await this.fetchFeedback();
      if (feedbackData.positive.length === 0 || feedbackData.negative.length === 0) {
        await this.log('error', '❌ Insufficient examples', {
          positive: feedbackData.positive.length,
          negative: feedbackData.negative.length,
          required: 'At least 1 positive and 1 negative example'
        });
        throw new Error('Insufficient examples: need at least 1 positive and 1 negative example');
      }

      await this.log('info', '✅ Retrieved training examples', {
        positive: feedbackData.positive.length,
        negative: feedbackData.negative.length,
        total: feedbackData.positive.length + feedbackData.negative.length
      });

      // Log sample trace IDs for context
      const positiveIds = feedbackData.positive.map(t => t.trace_id || t.id).slice(0, 3);
      const negativeIds = feedbackData.negative.map(t => t.trace_id || t.id).slice(0, 3);
      await this.log('info', '📋 Sample trace IDs', {
        positiveExamples: positiveIds,
        negativeExamples: negativeIds,
        note: `Showing first 3 of each (${feedbackData.positive.length} positive, ${feedbackData.negative.length} negative)`
      });

      this.emitProgress('calling_llm', 20);

      // Step 2: Generate eval code using LLM
      const modelToUse = this.config.model || 'anthropic/claude-sonnet-4-5';
      await this.log('info', '🤖 Generating eval function with AI...', {
        model: modelToUse,
        positiveExamples: feedbackData.positive.length,
        negativeExamples: feedbackData.negative.length
      });

      await this.log('info', '📝 Analyzing trace patterns to identify quality criteria...');

      // Log preview of what's being sent to LLM
      const samplePositive = feedbackData.positive[0];
      const sampleNegative = feedbackData.negative[0];
      await this.log('info', '🔍 Sending traces to LLM for pattern analysis', {
        samplePositiveSteps: samplePositive?.steps?.length || 0,
        sampleNegativeSteps: sampleNegative?.steps?.length || 0,
        evalName: this.config.name,
        customInstructions: this.config.customInstructions ? 'Provided' : 'None'
      });

      const generationResult = await this.generator.generate({
        name: this.config.name,
        positiveExamples: feedbackData.positive,
        negativeExamples: feedbackData.negative
      });

      await this.log('info', '✅ AI generation completed', {
        model: generationResult.metadata.model,
        codeLength: `${generationResult.code.length} characters`,
        tokensUsed: generationResult.metadata.tokensUsed || 'N/A'
      });

      // Log generated code preview
      const codeLines = generationResult.code.split('\n');
      const codePreview = codeLines.slice(0, 8).join('\n') + (codeLines.length > 8 ? '\n...' : '');
      await this.log('info', '💻 Generated eval function preview', {
        preview: codePreview,
        totalLines: codeLines.length,
        totalChars: generationResult.code.length
      });

      // Log token usage and cost if available
      if (generationResult.metadata.tokensUsed || generationResult.metadata.cost) {
        await this.log('info', '💰 LLM usage metrics', {
          promptTokens: generationResult.metadata.promptTokens || 'N/A',
          completionTokens: generationResult.metadata.completionTokens || 'N/A',
          totalTokens: generationResult.metadata.tokensUsed || 'N/A',
          estimatedCost: generationResult.metadata.cost ? `$${generationResult.metadata.cost.estimatedCostUSD.toFixed(4)}` : 'N/A'
        });
      }

      this.emitProgress('validating_code', 60);

      // Step 3: Test against training set
      // expectedScore: 1.0 = high quality (positive), 0.0 = low quality (negative)
      const testCases = [
        ...feedbackData.positive.map(trace => ({ trace, expectedScore: 1.0 })),
        ...feedbackData.negative.map(trace => ({ trace, expectedScore: 0.0 }))
      ];

      await this.log('info', '🧪 Validating generated eval code...', {
        testCases: testCases.length,
        description: 'Running eval function against labeled traces to measure accuracy'
      });

      this.emitProgress('testing_accuracy', 70, {
        tested: 0,
        total: testCases.length
      });

      const testResult = await this.tester.test(generationResult.code, testCases);

      const accuracyPercent = (testResult.accuracy * 100).toFixed(1);
      const accuracyEmoji = testResult.accuracy >= 0.8 ? '🎯' : testResult.accuracy >= 0.6 ? '📊' : '⚠️';
      await this.log('info', `${accuracyEmoji} Validation completed`, {
        accuracy: `${accuracyPercent}%`,
        correct: testResult.correct,
        incorrect: testResult.incorrect,
        errors: testResult.errors,
        total: testResult.total
      });

      // Log per-trace results summary
      const mismatches = testResult.details.filter(d => !d.match);
      const errorCases = testResult.details.filter(d => d.error);

      if (mismatches.length > 0) {
        await this.log('info', '🔄 Mismatched predictions', {
          count: mismatches.length,
          samples: mismatches.slice(0, 3).map(d => ({
            traceId: d.traceId.substring(0, 20) + '...',
            expected: d.expectedScore === 1.0 ? 'positive' : 'negative',
            predicted: d.predictedScore >= 0.5 ? 'positive' : 'negative',
            reason: d.feedback?.substring(0, 100) || 'No reason'
          }))
        });
      }

      if (errorCases.length > 0) {
        await this.log('warn', '❗ Execution errors during validation', {
          count: errorCases.length,
          samples: errorCases.slice(0, 2).map(d => ({
            traceId: d.traceId.substring(0, 20) + '...',
            error: d.error?.substring(0, 150) || 'Unknown error'
          }))
        });
      }

      if (testResult.accuracy < 0.6) {
        await this.log('warn', '⚠️ Low accuracy detected - consider adding more labeled examples');
      }

      this.emitProgress('saving_eval', 90);

      // Step 4: Save eval to database
      await this.log('info', '💾 Saving eval to database...');
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

      await this.log('info', '✅ Eval saved to database', {
        evalId,
        version,
        name: this.config.name
      });

      // Mark job as completed
      await this.log('info', '🎉 Eval generation completed successfully!', {
        evalId,
        version,
        accuracy: `${(testResult.accuracy * 100).toFixed(1)}%`,
        testResults: {
          correct: testResult.correct,
          incorrect: testResult.incorrect,
          errors: testResult.errors
        }
      });

      await this.jobManager.completeJob(this.config.jobId, result);
      this.emitProgress('completed', 100);

      return result;
    } catch (error: any) {
      console.error('Eval generation job failed:', error);
      await this.log('error', '❌ Eval generation failed', {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
      await this.jobManager.failJob(this.config.jobId, error.message);

      if (this.stream) {
        this.stream.sendFailed(error.message, error.stack);
      }

      throw error;
    }
  }

  /**
   * Log a message to both SSE stream (if available) and persist to job metadata
   */
  private async log(
    level: 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    // Send to SSE stream if available
    this.stream?.sendLog(level, message, data);

    // Always persist to job metadata for LiveJobMonitor polling
    await this.jobManager.addJobLog(this.config.jobId, level, message, data);
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
        source: record.source as 'langfuse' | 'langsmith' | 'openai' | 'playground',
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
    // Store test executions in eval_executions table (consolidated schema)
    if (results.length === 0) return;

    const now = new Date().toISOString();
    const values = results.map(result => ({
      id: crypto.randomUUID(),
      evalId: evalId,
      traceId: result.traceId,
      score: result.predictedScore,
      feedback: result.feedback,
      success: result.error ? false : true,
      executionTimeMs: result.executionTimeMs,
      executedAt: now
    }));

    // Note: Drizzle doesn't support INSERT OR REPLACE directly
    // We would need to handle this with individual upserts or accept insert-only
    // For now, using insert-only to maintain compatibility
    await this.drizzle.insert(evalExecutions).values(values);
  }

  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
