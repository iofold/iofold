import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { eq, sql } from 'drizzle-orm';
import { DeepEvalAgent } from '../services/eval/deep-eval-agent';
import type { GenerateEvalJobResult } from '../types/api';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';
import { createDb, type Database } from '../db/client';
import { evals } from '../db/schema';

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
  private stream?: SSEStream;
  private drizzle: Database;

  constructor(
    private config: EvalGenerationJobConfig,
    private deps: EvalGenerationJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
    this.drizzle = createDb(deps.db);
  }

  async execute(stream?: SSEStream): Promise<GenerateEvalJobResult> {
    this.stream = stream;

    try {
      // Update job to running
      await this.jobManager.updateJobStatus(this.config.jobId, 'running', 0);
      await this.log('info', 'Starting deep eval agent', {
        jobId: this.config.jobId,
        agentId: this.config.agentId,
        evalName: this.config.name,
      });
      this.emitProgress('initializing', 0);

      // Create deep eval agent
      const agent = new DeepEvalAgent({
        agentId: this.config.agentId,
        evalName: this.config.name,
        db: this.deps.db,
        env: {
          CF_ACCOUNT_ID: this.deps.cfAccountId,
          CF_GATEWAY_ID: this.deps.cfGatewayId,
          CF_GATEWAY_TOKEN: this.deps.cfGatewayToken,
        } as any,
        sandbox: this.deps.sandboxBinding,
        onLog: (level, message, data) => this.log(level, message, data),
      });

      this.emitProgress('running_agent', 10);

      // Run the agent
      const agentResult = await agent.generate();

      await this.log('info', 'Agent completed', {
        accuracy: `${(agentResult.accuracy * 100).toFixed(1)}%`,
        iterations: agentResult.iterations,
      });

      this.emitProgress('saving_eval', 90);

      // Save eval to database
      const evalId = `eval_${crypto.randomUUID()}`;
      const versionResult = await this.drizzle
        .select({
          nextVersion: sql<number>`COALESCE(MAX(${evals.version}), 0) + 1`,
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
        code: agentResult.code,
        modelUsed: 'anthropic/claude-sonnet-4-5',
        accuracy: agentResult.accuracy,
        testResults: { iterations: agentResult.iterations } as Record<string, unknown>,
        executionCount: 0,
        contradictionCount: 0,
        createdAt: now,
        updatedAt: now,
      });

      const result: GenerateEvalJobResult = {
        eval_id: evalId,
        accuracy: agentResult.accuracy,
        test_results: {
          correct: 0,
          incorrect: 0,
          errors: 0,
          total: 0,
          details: [],
        },
      };

      await this.log('info', 'Eval saved', { evalId, version, accuracy: agentResult.accuracy });
      await this.jobManager.completeJob(this.config.jobId, result);
      this.emitProgress('completed', 100);

      return result;
    } catch (error: any) {
      console.error('Eval generation job failed:', error);
      await this.log('error', 'Eval generation failed', {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
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

  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
