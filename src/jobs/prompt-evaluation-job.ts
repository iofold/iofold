import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { EvalTester, type TestCase } from '../eval-generator/tester';
import type { Trace } from '../types/trace';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';

export interface PromptEvaluationJobConfig {
  jobId: string;
  agentVersionId: string;
  workspaceId: string;
  maxTraces?: number;
}

export interface PromptEvaluationJobDeps {
  db: D1Database;
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
}

export interface PromptEvaluationJobResult {
  candidate_version_id: string;
  candidate_accuracy: number;
  active_version_id: string | null;
  active_accuracy: number | null;
  accuracy_delta: number | null;
  eval_results: Array<{
    eval_id: string;
    eval_name: string;
    passed: number;
    failed: number;
    errors: number;
  }>;
  recommendation: 'promote' | 'reject' | 'needs_review';
}

export class PromptEvaluationJob {
  private jobManager: JobManager;
  private tester: EvalTester;
  private stream?: SSEStream;

  constructor(
    private config: PromptEvaluationJobConfig,
    private deps: PromptEvaluationJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
    this.tester = new EvalTester({
      sandboxBinding: deps.sandboxBinding
    });
  }

  async execute(stream?: SSEStream): Promise<PromptEvaluationJobResult> {
    this.stream = stream;

    try {
      // Update job to running
      await this.jobManager.updateJobStatus(this.config.jobId, 'running', 0);
      this.emitProgress('fetching_versions', 0);

      // Step 1: Fetch candidate version and active version from D1
      const candidateVersion = await this.fetchCandidateVersion();
      if (!candidateVersion) {
        throw new Error(`Agent version ${this.config.agentVersionId} not found`);
      }

      const activeVersion = await this.fetchActiveVersion(candidateVersion.agent_id);

      this.emitProgress('fetching_traces', 10);

      // Step 2: Fetch historical traces assigned to this agent (up to maxTraces)
      const traces = await this.fetchHistoricalTraces(
        candidateVersion.agent_id,
        activeVersion?.id || null,
        this.config.maxTraces || 50
      );

      if (traces.length === 0) {
        throw new Error('No historical traces found for this agent');
      }

      this.emitProgress('fetching_evals', 20);

      // Step 3: Fetch all evals for this agent
      const evals = await this.fetchAgentEvals(candidateVersion.agent_id);

      if (evals.length === 0) {
        throw new Error('No evals found for this agent');
      }

      this.emitProgress('running_evals', 30, {
        total_evals: evals.length,
        total_traces: traces.length
      });

      // Step 4: Run each eval on historical trace outputs
      const evalResults: Array<{
        eval_id: string;
        eval_name: string;
        passed: number;
        failed: number;
        errors: number;
      }> = [];

      let totalCorrect = 0;
      let totalTests = 0;

      for (let i = 0; i < evals.length; i++) {
        const evalRecord = evals[i];

        this.emitProgress('running_evals', 30 + (i / evals.length) * 50, {
          current_eval: evalRecord.name,
          eval_progress: `${i + 1}/${evals.length}`
        });

        // Test this eval against all traces
        // expectedScore: 1.0 = expect high quality (MVP: we don't have expected results, just check execution)
        const testCases: TestCase[] = traces.map(trace => ({
          trace,
          expectedScore: 1.0
        }));

        const testResult = await this.tester.test(evalRecord.code, testCases);

        evalResults.push({
          eval_id: evalRecord.id,
          eval_name: evalRecord.name,
          passed: testResult.correct,
          failed: testResult.incorrect,
          errors: testResult.errors
        });

        totalCorrect += testResult.correct;
        totalTests += testResult.total;
      }

      this.emitProgress('calculating_metrics', 80);

      // Step 5: Calculate accuracy metrics
      const candidateAccuracy = totalTests > 0 ? totalCorrect / totalTests : 0;
      const activeAccuracy = activeVersion?.accuracy || null;
      const accuracyDelta = activeAccuracy !== null ? candidateAccuracy - activeAccuracy : null;

      // Step 6: Update candidate version with accuracy
      await this.deps.db
        .prepare(
          `UPDATE agent_versions
           SET accuracy = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          candidateAccuracy,
          new Date().toISOString(),
          this.config.agentVersionId
        )
        .run();

      this.emitProgress('generating_recommendation', 90);

      // Step 7: Generate recommendation
      const recommendation = this.getRecommendation(accuracyDelta, candidateAccuracy);

      const result: PromptEvaluationJobResult = {
        candidate_version_id: this.config.agentVersionId,
        candidate_accuracy: candidateAccuracy,
        active_version_id: activeVersion?.id || null,
        active_accuracy: activeAccuracy,
        accuracy_delta: accuracyDelta,
        eval_results: evalResults,
        recommendation
      };

      // Mark job as completed
      await this.jobManager.completeJob(this.config.jobId, result);
      this.emitProgress('completed', 100);

      return result;
    } catch (error: any) {
      console.error('Prompt evaluation job failed:', error);
      await this.jobManager.failJob(this.config.jobId, error.message);

      if (this.stream) {
        this.stream.sendFailed(error.message, error.stack);
      }

      throw error;
    }
  }

  private async fetchCandidateVersion(): Promise<{
    id: string;
    agent_id: string;
    version: number;
    prompt_template: string;
    variables: string[];
  } | null> {
    const result = await this.deps.db
      .prepare(
        `SELECT id, agent_id, version, prompt_template, variables
         FROM agent_versions
         WHERE id = ?`
      )
      .bind(this.config.agentVersionId)
      .first();

    if (!result) return null;

    return {
      id: result.id as string,
      agent_id: result.agent_id as string,
      version: result.version as number,
      prompt_template: result.prompt_template as string,
      variables: result.variables ? JSON.parse(result.variables as string) : []
    };
  }

  private async fetchActiveVersion(agentId: string): Promise<{
    id: string;
    accuracy: number | null;
  } | null> {
    const result = await this.deps.db
      .prepare(
        `SELECT av.id, av.accuracy
         FROM agents a
         JOIN agent_versions av ON a.active_version_id = av.id
         WHERE a.id = ?`
      )
      .bind(agentId)
      .first();

    if (!result) return null;

    return {
      id: result.id as string,
      accuracy: result.accuracy !== null ? (result.accuracy as number) : null
    };
  }

  private async fetchHistoricalTraces(
    agentId: string,
    activeVersionId: string | null,
    maxTraces: number
  ): Promise<Trace[]> {
    let query: string;
    let bindings: any[];

    if (activeVersionId) {
      // Fetch traces assigned to the active version
      query = `
        SELECT id, external_id, integration_id, trace_data
        FROM traces
        WHERE agent_version_id = ?
        LIMIT ?
      `;
      bindings = [activeVersionId, maxTraces];
    } else {
      // No active version yet, fetch any traces assigned to this agent
      query = `
        SELECT t.id, t.external_id, t.integration_id, t.trace_data
        FROM traces t
        JOIN agent_versions av ON t.agent_version_id = av.id
        WHERE av.agent_id = ?
        LIMIT ?
      `;
      bindings = [agentId, maxTraces];
    }

    const results = await this.deps.db.prepare(query).bind(...bindings).all();

    return results.results.map(record => {
      const traceData = JSON.parse(record.trace_data as string);
      return {
        id: record.id as string,
        trace_id: record.external_id as string,
        source: 'langfuse' as const, // MVP: assume langfuse
        steps: traceData.steps || [],
        raw_data: traceData
      };
    });
  }

  private async fetchAgentEvals(agentId: string): Promise<
    Array<{
      id: string;
      name: string;
      code: string;
    }>
  > {
    // Fetch evals directly linked to this agent
    const results = await this.deps.db
      .prepare(
        `SELECT id, name, code
         FROM evals
         WHERE agent_id = ?
         AND status = 'active'`
      )
      .bind(agentId)
      .all();

    return results.results.map(record => ({
      id: record.id as string,
      name: record.name as string,
      code: record.code as string
    }));
  }

  private getRecommendation(delta: number | null, candidateAccuracy: number): 'promote' | 'reject' | 'needs_review' {
    if (delta === null) return 'promote'; // First version
    if (delta >= 0.05) return 'promote';   // 5%+ improvement
    if (delta <= -0.05) return 'reject';   // 5%+ regression
    return 'needs_review';                  // Marginal change
  }

  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
