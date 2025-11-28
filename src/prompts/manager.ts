/**
 * System Prompt Manager
 *
 * Handles storage, deduplication, and querying of system prompt versions.
 * Links prompts to traces and tracks performance per prompt version.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { PromptExtractor, type ExtractedPrompt } from './extractor';
import type { Trace } from '../types/trace';

/**
 * System prompt record from database
 */
export interface SystemPrompt {
  id: string;
  workspace_id: string;
  agent_name: string;
  prompt_hash: string;
  content: string;
  metadata: Record<string, any> | null;
  first_seen_at: string;
  last_seen_at: string;
  trace_count: number;
}

/**
 * Prompt coverage statistics per eval
 */
export interface PromptCoverage {
  prompt_id: string;
  eval_id: string;
  execution_count: number;
  pass_count: number;
  fail_count: number;
  error_count: number;
  accuracy: number | null;
  first_execution_at: string | null;
  last_execution_at: string | null;
}

/**
 * Result of storing/linking a prompt
 */
export interface StorePromptResult {
  prompt_id: string;
  is_new: boolean;
  trace_count: number;
}

/**
 * PromptManager handles all prompt versioning operations
 */
export class PromptManager {
  private extractor: PromptExtractor;

  constructor(private db: D1Database) {
    this.extractor = new PromptExtractor();
  }

  /**
   * Extract and store system prompt from a trace
   * Links the trace to the prompt and deduplicates by content hash
   */
  async storePromptFromTrace(
    trace: Trace,
    workspaceId: string
  ): Promise<StorePromptResult | null> {
    // Extract prompt from trace
    const extracted = this.extractor.extract(trace);
    if (!extracted) {
      return null;
    }

    // Hash the content for deduplication
    const promptHash = await this.extractor.hashPromptContent(extracted.content);

    // Try to find existing prompt with this hash
    const existing = await this.db
      .prepare(
        `SELECT id, trace_count FROM system_prompts
         WHERE workspace_id = ? AND prompt_hash = ?`
      )
      .bind(workspaceId, promptHash)
      .first();

    let promptId: string;
    let isNew = false;
    let traceCount = 1;

    if (existing) {
      // Update existing prompt's trace count and last_seen_at
      promptId = existing.id as string;
      traceCount = (existing.trace_count as number) + 1;

      await this.db
        .prepare(
          `UPDATE system_prompts
           SET trace_count = ?, last_seen_at = ?
           WHERE id = ?`
        )
        .bind(traceCount, new Date().toISOString(), promptId)
        .run();
    } else {
      // Insert new prompt
      promptId = crypto.randomUUID();
      isNew = true;
      const now = new Date().toISOString();

      await this.db
        .prepare(
          `INSERT INTO system_prompts
           (id, workspace_id, agent_name, prompt_hash, content, metadata, first_seen_at, last_seen_at, trace_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
        )
        .bind(
          promptId,
          workspaceId,
          extracted.agentName,
          promptHash,
          extracted.content,
          extracted.metadata ? JSON.stringify(extracted.metadata) : null,
          now,
          now
        )
        .run();
    }

    // Link trace to prompt
    await this.db
      .prepare(
        `UPDATE traces SET system_prompt_id = ? WHERE id = ?`
      )
      .bind(promptId, trace.id)
      .run();

    return {
      prompt_id: promptId,
      is_new: isNew,
      trace_count: traceCount
    };
  }

  /**
   * Get a prompt by ID
   */
  async getPrompt(promptId: string): Promise<SystemPrompt | null> {
    const result = await this.db
      .prepare(`SELECT * FROM system_prompts WHERE id = ?`)
      .bind(promptId)
      .first();

    if (!result) return null;

    return this.rowToPrompt(result);
  }

  /**
   * Get prompt by workspace and hash
   */
  async getPromptByHash(
    workspaceId: string,
    promptHash: string
  ): Promise<SystemPrompt | null> {
    const result = await this.db
      .prepare(
        `SELECT * FROM system_prompts
         WHERE workspace_id = ? AND prompt_hash = ?`
      )
      .bind(workspaceId, promptHash)
      .first();

    if (!result) return null;

    return this.rowToPrompt(result);
  }

  /**
   * List prompts for a workspace with optional filtering
   */
  async listPrompts(
    workspaceId: string,
    options?: {
      agentName?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<SystemPrompt[]> {
    let query = `SELECT * FROM system_prompts WHERE workspace_id = ?`;
    const params: any[] = [workspaceId];

    if (options?.agentName) {
      query += ' AND agent_name = ?';
      params.push(options.agentName);
    }

    query += ' ORDER BY last_seen_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const result = await this.db.prepare(query).bind(...params).all();

    return result.results.map(row => this.rowToPrompt(row));
  }

  /**
   * Get unique agent names in a workspace
   */
  async getAgentNames(workspaceId: string): Promise<string[]> {
    const result = await this.db
      .prepare(
        `SELECT DISTINCT agent_name FROM system_prompts
         WHERE workspace_id = ?
         ORDER BY agent_name`
      )
      .bind(workspaceId)
      .all();

    return result.results.map(row => row.agent_name as string);
  }

  /**
   * Get prompt coverage statistics for an eval
   */
  async getPromptCoverage(evalId: string): Promise<PromptCoverage[]> {
    const result = await this.db
      .prepare(
        `SELECT
           epc.*,
           sp.agent_name,
           sp.content,
           sp.trace_count as prompt_trace_count
         FROM eval_prompt_coverage epc
         JOIN system_prompts sp ON epc.system_prompt_id = sp.id
         WHERE epc.eval_id = ?
         ORDER BY epc.execution_count DESC`
      )
      .bind(evalId)
      .all();

    return result.results.map(row => ({
      prompt_id: row.system_prompt_id as string,
      eval_id: row.eval_id as string,
      execution_count: row.execution_count as number,
      pass_count: row.pass_count as number,
      fail_count: row.fail_count as number,
      error_count: row.error_count as number,
      accuracy: row.accuracy as number | null,
      first_execution_at: row.first_execution_at as string | null,
      last_execution_at: row.last_execution_at as string | null
    }));
  }

  /**
   * Update prompt coverage statistics after eval execution
   */
  async updatePromptCoverage(
    evalId: string,
    promptId: string,
    passed: boolean,
    hadError: boolean
  ): Promise<void> {
    const now = new Date().toISOString();

    // Try to update existing record
    const updateResult = await this.db
      .prepare(
        `UPDATE eval_prompt_coverage
         SET
           execution_count = execution_count + 1,
           pass_count = pass_count + ?,
           fail_count = fail_count + ?,
           error_count = error_count + ?,
           last_execution_at = ?,
           updated_at = ?
         WHERE eval_id = ? AND system_prompt_id = ?`
      )
      .bind(
        passed ? 1 : 0,
        passed || hadError ? 0 : 1,
        hadError ? 1 : 0,
        now,
        now,
        evalId,
        promptId
      )
      .run();

    // If no rows updated, insert new record
    if (!updateResult.meta.changes || updateResult.meta.changes === 0) {
      const id = crypto.randomUUID();
      await this.db
        .prepare(
          `INSERT INTO eval_prompt_coverage
           (id, eval_id, system_prompt_id, execution_count, pass_count, fail_count, error_count, first_execution_at, last_execution_at, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          evalId,
          promptId,
          passed ? 1 : 0,
          passed || hadError ? 0 : 1,
          hadError ? 1 : 0,
          now,
          now,
          now,
          now
        )
        .run();
    }

    // Update accuracy calculation
    await this.db
      .prepare(
        `UPDATE eval_prompt_coverage
         SET accuracy = CAST(pass_count AS REAL) / CAST(execution_count AS REAL)
         WHERE eval_id = ? AND system_prompt_id = ? AND execution_count > 0`
      )
      .bind(evalId, promptId)
      .run();
  }

  /**
   * Detect prompt drift by comparing accuracy across prompt versions
   */
  async detectPromptDrift(
    evalId: string,
    minExecutions: number = 10,
    driftThreshold: number = 0.10
  ): Promise<{
    hasDrift: boolean;
    baseline_accuracy: number | null;
    drifted_prompts: Array<{
      prompt_id: string;
      agent_name: string;
      accuracy: number;
      drift: number;
      execution_count: number;
    }>;
  }> {
    // Get all prompt coverage for this eval
    const coverageResult = await this.db
      .prepare(
        `SELECT
           epc.system_prompt_id,
           epc.execution_count,
           epc.accuracy,
           sp.agent_name
         FROM eval_prompt_coverage epc
         JOIN system_prompts sp ON epc.system_prompt_id = sp.id
         WHERE epc.eval_id = ? AND epc.execution_count >= ?
         ORDER BY sp.first_seen_at ASC`
      )
      .bind(evalId, minExecutions)
      .all();

    if (coverageResult.results.length < 2) {
      return {
        hasDrift: false,
        baseline_accuracy: null,
        drifted_prompts: []
      };
    }

    // First prompt (oldest) is the baseline
    const baseline = coverageResult.results[0];
    const baselineAccuracy = baseline.accuracy as number;

    if (!baselineAccuracy) {
      return {
        hasDrift: false,
        baseline_accuracy: null,
        drifted_prompts: []
      };
    }

    // Check for drift in subsequent prompts
    const driftedPrompts = [];
    for (let i = 1; i < coverageResult.results.length; i++) {
      const prompt = coverageResult.results[i];
      const accuracy = prompt.accuracy as number;

      if (accuracy !== null) {
        const drift = baselineAccuracy - accuracy;
        if (Math.abs(drift) >= driftThreshold) {
          driftedPrompts.push({
            prompt_id: prompt.system_prompt_id as string,
            agent_name: prompt.agent_name as string,
            accuracy,
            drift,
            execution_count: prompt.execution_count as number
          });
        }
      }
    }

    return {
      hasDrift: driftedPrompts.length > 0,
      baseline_accuracy: baselineAccuracy,
      drifted_prompts: driftedPrompts
    };
  }

  /**
   * Record a prompt iteration (for refinement tracking)
   */
  async recordIteration(
    workspaceId: string,
    agentName: string,
    currentPromptId: string,
    parentPromptId: string | null,
    changeSummary?: string,
    improvementMetrics?: Record<string, any>
  ): Promise<string> {
    // Get iteration number
    let iterationNumber = 1;
    if (parentPromptId) {
      const parentIteration = await this.db
        .prepare(
          `SELECT MAX(iteration_number) as max_iteration
           FROM prompt_iterations
           WHERE workspace_id = ? AND agent_name = ?`
        )
        .bind(workspaceId, agentName)
        .first();

      if (parentIteration?.max_iteration) {
        iterationNumber = (parentIteration.max_iteration as number) + 1;
      }
    }

    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO prompt_iterations
         (id, workspace_id, agent_name, parent_prompt_id, current_prompt_id, iteration_number, change_summary, improvement_metrics, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        workspaceId,
        agentName,
        parentPromptId,
        currentPromptId,
        iterationNumber,
        changeSummary || null,
        improvementMetrics ? JSON.stringify(improvementMetrics) : null,
        new Date().toISOString()
      )
      .run();

    return id;
  }

  /**
   * Get iteration history for an agent
   */
  async getIterationHistory(
    workspaceId: string,
    agentName: string
  ): Promise<Array<{
    id: string;
    parent_prompt_id: string | null;
    current_prompt_id: string;
    iteration_number: number;
    change_summary: string | null;
    improvement_metrics: Record<string, any> | null;
    created_at: string;
  }>> {
    const result = await this.db
      .prepare(
        `SELECT * FROM prompt_iterations
         WHERE workspace_id = ? AND agent_name = ?
         ORDER BY iteration_number DESC`
      )
      .bind(workspaceId, agentName)
      .all();

    return result.results.map(row => ({
      id: row.id as string,
      parent_prompt_id: row.parent_prompt_id as string | null,
      current_prompt_id: row.current_prompt_id as string,
      iteration_number: row.iteration_number as number,
      change_summary: row.change_summary as string | null,
      improvement_metrics: row.improvement_metrics
        ? JSON.parse(row.improvement_metrics as string)
        : null,
      created_at: row.created_at as string
    }));
  }

  /**
   * Convert database row to SystemPrompt
   */
  private rowToPrompt(row: any): SystemPrompt {
    return {
      id: row.id as string,
      workspace_id: row.workspace_id as string,
      agent_name: row.agent_name as string,
      prompt_hash: row.prompt_hash as string,
      content: row.content as string,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
      first_seen_at: row.first_seen_at as string,
      last_seen_at: row.last_seen_at as string,
      trace_count: row.trace_count as number
    };
  }
}
