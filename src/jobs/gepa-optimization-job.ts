/**
 * GEPAOptimizationJob - Background job for GEPA prompt optimization
 *
 * Flow:
 * 1. Update gepa_runs status to 'running'
 * 2. Get agent's eval code (from evals table if eval_id provided)
 * 3. Build configuration for Python runner
 * 4. Spawn Python sandbox with gepa_runner.py
 * 5. Stream progress updates from stderr → update gepa_runs
 * 6. Handle completion → create new agent version with optimized prompt
 * 7. Update gepa_runs with best_prompt, best_score, and version_id
 * 8. Handle errors → update status to 'failed' with error message
 */

import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { PythonRunner, GEPA_ALLOWED_IMPORTS } from '../sandbox/python-runner';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';
import type { GEPAOptimizationJobPayload } from '../types/queue';

export interface GEPAOptimizationJobConfig {
  jobId: string;
  runId: string;
  agentId: string;
  evalId?: string;
  evalCode?: string;
  seedPrompt: string;
  testCases: Array<{
    user_message: string;
    expected_output?: string;
  }>;
  trainSplit?: number;
  maxMetricCalls?: number;
  parallelism?: number;
  pollTimeoutSeconds?: number;
  scoreThreshold?: number;
  apiBaseUrl: string;
  sessionToken: string;
  workspaceId: string;
}

export interface GEPAOptimizationJobDeps {
  db: D1Database;
  sandboxBinding?: DurableObjectNamespace<Sandbox>;
  /** Cloudflare Account ID for AI Gateway */
  cfAccountId: string;
  /** Cloudflare AI Gateway ID */
  cfGatewayId: string;
  /** Optional AI Gateway authentication token */
  cfGatewayToken?: string;
}

interface GEPAResult {
  best_prompt: string;
  best_score: number;
  total_candidates: number;
  total_metric_calls: number;
  all_candidates: Array<{
    system_prompt: string;
    score: number;
  }>;
}

export class GEPAOptimizationJob {
  private jobManager: JobManager;
  private runner: PythonRunner;
  private stream?: SSEStream;

  constructor(
    private config: GEPAOptimizationJobConfig,
    private deps: GEPAOptimizationJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
    this.runner = new PythonRunner({
      sandboxBinding: deps.sandboxBinding,
      timeout: 1800000, // 30 minutes for GEPA optimization
      allowedImports: GEPA_ALLOWED_IMPORTS // Allow httpx, openai, time, etc.
    });
  }

  async execute(stream?: SSEStream): Promise<GEPAResult> {
    this.stream = stream;

    try {
      // Update job to running
      await this.jobManager.updateJobStatus(this.config.jobId, 'running', 0);
      this.emitProgress('initializing', 0);

      // Step 1: Update gepa_runs status to 'running'
      const now = new Date().toISOString();
      await this.deps.db
        .prepare(
          `UPDATE gepa_runs
           SET status = 'running',
               started_at = ?
           WHERE id = ?`
        )
        .bind(now, this.config.runId)
        .run();

      this.emitProgress('fetching_eval_code', 5);

      // Step 2: Get eval code
      const evalCode = await this.getEvalCode();

      this.emitProgress('preparing_test_cases', 10);

      // Step 3: Split test cases into train/val
      const { trainset, valset } = this.splitTrainVal(this.config.testCases);

      this.emitProgress('preparing_sandbox', 15);

      // Step 4: Build configuration for Python sandbox
      const gepaConfig = this.buildGEPAConfig(evalCode, trainset, valset);

      this.emitProgress('running_gepa', 20);

      // Step 5: Execute GEPA optimization in Python sandbox
      const result = await this.runGEPAOptimization(gepaConfig);

      // Step 6: Create agent version with optimized prompt
      const versionId = await this.createAgentVersion(result.best_prompt, result.best_score, result.total_candidates);

      // Step 7: Update gepa_runs with results and version_id
      await this.updateGEPARunResults(result, versionId);

      // Mark job as completed
      await this.jobManager.completeJob(this.config.jobId, result);
      this.emitProgress('completed', 100, { ...result, version_id: versionId });

      return result;
    } catch (error: any) {
      console.error('[GEPAOptimizationJob] Job failed:', error);

      // Update gepa_runs status to failed
      await this.deps.db
        .prepare(
          `UPDATE gepa_runs
           SET status = 'failed',
               error = ?,
               completed_at = ?
           WHERE id = ?`
        )
        .bind(error.message, new Date().toISOString(), this.config.runId)
        .run();

      await this.jobManager.failJob(this.config.jobId, error.message);

      if (this.stream) {
        this.stream.sendFailed(error.message, error.stack);
      }

      throw error;
    }
  }

  /**
   * Get eval code from config or database
   */
  private async getEvalCode(): Promise<string> {
    // If eval code provided directly, use it
    if (this.config.evalCode) {
      return this.config.evalCode;
    }

    // Otherwise, fetch from evals table
    if (!this.config.evalId) {
      throw new Error('Either evalId or evalCode must be provided');
    }

    const evalRecord = await this.deps.db
      .prepare('SELECT code FROM evals WHERE id = ?')
      .bind(this.config.evalId)
      .first();

    if (!evalRecord) {
      throw new Error(`Eval ${this.config.evalId} not found`);
    }

    return evalRecord.code as string;
  }

  /**
   * Split test cases into train and validation sets
   */
  private splitTrainVal(testCases: Array<{ user_message: string; expected_output?: string }>): {
    trainset: Array<{ task: Record<string, any>; task_metadata: Record<string, any> }>;
    valset: Array<{ task: Record<string, any>; task_metadata: Record<string, any> }>;
  } {
    const trainSplit = this.config.trainSplit || 0.7;
    const trainSize = Math.floor(testCases.length * trainSplit);

    // Shuffle test cases for random split
    const shuffled = [...testCases].sort(() => Math.random() - 0.5);

    // Convert test cases to the format expected by GEPA runner
    const trainset = shuffled.slice(0, trainSize).map(tc => ({
      task: {
        user_message: tc.user_message,
        expected_output: tc.expected_output || null
      },
      task_metadata: {}
    }));

    const valset = shuffled.slice(trainSize).map(tc => ({
      task: {
        user_message: tc.user_message,
        expected_output: tc.expected_output || null
      },
      task_metadata: {}
    }));

    return { trainset, valset };
  }

  /**
   * Build configuration object for GEPA Python runner
   */
  private buildGEPAConfig(
    evalCode: string,
    trainset: Array<{ task: Record<string, any>; task_metadata: Record<string, any> }>,
    valset: Array<{ task: Record<string, any>; task_metadata: Record<string, any> }>
  ): Record<string, any> {
    // Build AI Gateway URL
    const aiGatewayUrl = `https://gateway.ai.cloudflare.com/v1/${this.deps.cfAccountId}/${this.deps.cfGatewayId}/openai`;

    return {
      api_base_url: this.config.apiBaseUrl,
      session_token: this.config.sessionToken,
      agent_id: this.config.agentId,
      eval_code: evalCode,
      seed_prompt: this.config.seedPrompt,
      trainset,
      valset,
      ai_gateway_url: aiGatewayUrl,
      ai_gateway_token: this.deps.cfGatewayToken || '',
      max_metric_calls: this.config.maxMetricCalls || 50,
      parallelism: this.config.parallelism || 5,
      poll_timeout_seconds: this.config.pollTimeoutSeconds || 600
    };
  }

  /**
   * Run GEPA optimization in Python sandbox
   */
  private async runGEPAOptimization(config: Record<string, any>): Promise<GEPAResult> {
    // Build Python script that imports gepa_runner and runs optimization
    const pythonScript = `
import json
import sys
from gepa_runner import run_gepa_optimization

# Read config from stdin
config = json.loads(sys.stdin.read())

try:
    result = run_gepa_optimization(config)
    print(json.dumps({"success": True, "result": result}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
    sys.exit(1)
`;

    // Execute Python script with config passed via stdin
    const configJson = JSON.stringify(config);

    // For now, we'll use a simple execution approach
    // In production, this would stream stderr for progress updates
    const execution = await this.runner.execute(pythonScript);

    if (!execution.success) {
      throw new Error(`GEPA optimization failed: ${execution.error}`);
    }

    // Parse result
    const output = execution.output || '';
    let parsed: { success: boolean; result?: GEPAResult; error?: string };

    try {
      parsed = JSON.parse(output);
    } catch (e) {
      throw new Error(`Failed to parse GEPA result: ${output}`);
    }

    if (!parsed.success || !parsed.result) {
      throw new Error(`GEPA optimization failed: ${parsed.error || 'Unknown error'}`);
    }

    return parsed.result;
  }

  /**
   * Create a new agent version with the optimized prompt
   */
  private async createAgentVersion(
    optimizedPrompt: string,
    bestScore: number,
    totalCandidates: number
  ): Promise<string> {
    // Get the current active version to use as parent
    const agent = await this.deps.db
      .prepare('SELECT active_version_id FROM agents WHERE id = ?')
      .bind(this.config.agentId)
      .first();

    // Get the next version number
    const maxVersionResult = await this.deps.db
      .prepare('SELECT MAX(version) as max_version FROM agent_versions WHERE agent_id = ?')
      .bind(this.config.agentId)
      .first();

    const nextVersion = (maxVersionResult?.max_version as number || 0) + 1;

    // Create new version with GEPA optimization metadata
    const versionId = `ver_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const metadata = {
      gepa_run_id: this.config.runId,
      best_score: bestScore,
      total_candidates: totalCandidates,
      optimization_type: 'gepa'
    };

    await this.deps.db
      .prepare(
        `INSERT INTO agent_versions (id, agent_id, version, prompt_template, variables, source,
                                      parent_version_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        versionId,
        this.config.agentId,
        nextVersion,
        optimizedPrompt,
        JSON.stringify([]), // No variables for GEPA-optimized prompts
        'ai_improved', // Source indicates AI-generated improvement
        agent?.active_version_id || null,
        'candidate', // Start as candidate, user can promote to active
        now
      )
      .run();

    return versionId;
  }

  /**
   * Update gepa_runs table with optimization results
   */
  private async updateGEPARunResults(result: GEPAResult, versionId: string): Promise<void> {
    const now = new Date().toISOString();

    await this.deps.db
      .prepare(
        `UPDATE gepa_runs
         SET status = 'completed',
             best_prompt = ?,
             best_score = ?,
             total_candidates = ?,
             progress_metric_calls = ?,
             optimized_version_id = ?,
             completed_at = ?
         WHERE id = ?`
      )
      .bind(
        result.best_prompt,
        result.best_score,
        result.total_candidates,
        result.total_metric_calls,
        versionId,
        now,
        this.config.runId
      )
      .run();
  }

  /**
   * Emit progress update via SSE stream
   */
  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
