/**
 * System Prompt Manager
 *
 * Handles storage, deduplication, and querying of system prompt versions.
 * Links prompts to traces and tracks performance per prompt version.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { PromptExtractor, type ExtractedPrompt } from './extractor';
import type { Trace } from '../types/trace';
import { createDb, type Database } from '../db/client';
import { eq, and, desc, sql } from 'drizzle-orm';
import { systemPrompts, traces, evalExecutions } from '../db/schema';

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
  private drizzle: Database;

  constructor(private db: D1Database) {
    this.extractor = new PromptExtractor();
    this.drizzle = createDb(db);
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
    const existing = await this.drizzle
      .select({ id: systemPrompts.id, traceCount: systemPrompts.traceCount })
      .from(systemPrompts)
      .where(and(
        eq(systemPrompts.workspaceId, workspaceId),
        eq(systemPrompts.promptHash, promptHash)
      ))
      .limit(1);

    let promptId: string;
    let isNew = false;
    let traceCount = 1;

    if (existing.length > 0) {
      // Update existing prompt's trace count and last_seen_at
      promptId = existing[0].id;
      traceCount = (existing[0].traceCount || 0) + 1;

      await this.drizzle
        .update(systemPrompts)
        .set({
          traceCount,
          lastSeenAt: new Date().toISOString()
        })
        .where(eq(systemPrompts.id, promptId));
    } else {
      // Insert new prompt
      promptId = crypto.randomUUID();
      isNew = true;
      const now = new Date().toISOString();

      await this.drizzle.insert(systemPrompts).values({
        id: promptId,
        workspaceId,
        agentName: extracted.agentName,
        promptHash,
        content: extracted.content,
        metadata: extracted.metadata || null,
        firstSeenAt: now,
        lastSeenAt: now,
        traceCount: 1
      });
    }

    // Link trace to prompt
    await this.drizzle
      .update(traces)
      .set({ systemPromptId: promptId })
      .where(eq(traces.id, trace.id));

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
    const result = await this.drizzle
      .select()
      .from(systemPrompts)
      .where(eq(systemPrompts.id, promptId))
      .limit(1);

    if (result.length === 0) return null;

    return this.rowToPrompt(result[0]);
  }

  /**
   * Get prompt by workspace and hash
   */
  async getPromptByHash(
    workspaceId: string,
    promptHash: string
  ): Promise<SystemPrompt | null> {
    const result = await this.drizzle
      .select()
      .from(systemPrompts)
      .where(and(
        eq(systemPrompts.workspaceId, workspaceId),
        eq(systemPrompts.promptHash, promptHash)
      ))
      .limit(1);

    if (result.length === 0) return null;

    return this.rowToPrompt(result[0]);
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
    let query = this.drizzle
      .select()
      .from(systemPrompts)
      .where(
        options?.agentName
          ? and(
              eq(systemPrompts.workspaceId, workspaceId),
              eq(systemPrompts.agentName, options.agentName)
            )
          : eq(systemPrompts.workspaceId, workspaceId)
      )
      .orderBy(desc(systemPrompts.lastSeenAt));

    if (options?.limit) {
      query = query.limit(options.limit) as any;
    }

    if (options?.offset) {
      query = query.offset(options.offset) as any;
    }

    const result = await query;

    return result.map(row => this.rowToPrompt(row));
  }

  /**
   * Get unique agent names in a workspace
   */
  async getAgentNames(workspaceId: string): Promise<string[]> {
    const result = await this.drizzle
      .selectDistinct({ agentName: systemPrompts.agentName })
      .from(systemPrompts)
      .where(eq(systemPrompts.workspaceId, workspaceId))
      .orderBy(systemPrompts.agentName);

    return result.map(row => row.agentName);
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
    // Compute prompt-level accuracy on-the-fly using executions joined to traces.
    // Note: Using raw SQL here as Drizzle's aggregation with complex CASE is verbose
    const coverageResult = await this.db
      .prepare(
        `SELECT
           sp.id as system_prompt_id,
           sp.agent_name,
           sp.first_seen_at,
           COUNT(*) as execution_count,
           CAST(SUM(CASE WHEN ee.predicted_result = 1 THEN 1 ELSE 0 END) AS REAL) / CAST(COUNT(*) AS REAL) as accuracy
         FROM eval_executions ee
         JOIN traces t ON ee.trace_id = t.id
         JOIN system_prompts sp ON t.system_prompt_id = sp.id
         WHERE ee.eval_id = ?
         GROUP BY sp.id, sp.agent_name, sp.first_seen_at
         HAVING COUNT(*) >= ?
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
   * Convert database row to SystemPrompt
   */
  private rowToPrompt(row: any): SystemPrompt {
    return {
      id: row.id,
      workspace_id: row.workspaceId,
      agent_name: row.agentName,
      prompt_hash: row.promptHash,
      content: row.content,
      metadata: row.metadata || null,
      first_seen_at: row.firstSeenAt,
      last_seen_at: row.lastSeenAt,
      trace_count: row.traceCount || 0
    };
  }
}
