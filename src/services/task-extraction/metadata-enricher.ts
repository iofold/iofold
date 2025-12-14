/**
 * TaskMetadataEnricher - Enriches DataInst with metadata from traces, feedback, and heuristics
 *
 * Part of GEPA Phase 1C-1 implementation
 */

/// <reference types="@cloudflare/workers-types" />

import { DataInst, TraceSummary, TraceFeedbackPair } from '../../types/datainst';
import { VectorService } from '../vector-service';
import { EmbeddingService } from '../embedding-service';
import { Trace } from '../../types/trace';
import { createDb, type Database } from '../../db/client';
import { eq, and, isNotNull, ne, desc, inArray, sql } from 'drizzle-orm';
import { traces, traceSummaries, feedback, agentVersions } from '../../db/schema';

/**
 * Configuration options for enrichment
 */
export interface EnrichmentOptions {
  /** Enable finding similar high-rated traces via vector similarity */
  enableSimilarTraces?: boolean;

  /** Enable finding traces with human feedback */
  enableFeedbackTraces?: boolean;

  /** Enable task categorization using heuristics */
  enableTaskCategorization?: boolean;

  /** Minimum similarity score for trace matching (0-1) */
  similarTraceMinScore?: number;

  /** Maximum number of similar traces to include */
  similarTraceLimit?: number;

  /** Maximum number of feedback traces to include */
  feedbackTraceLimit?: number;
}

/**
 * Default enrichment options
 */
const DEFAULT_OPTIONS: Required<EnrichmentOptions> = {
  enableSimilarTraces: true,
  enableFeedbackTraces: true,
  enableTaskCategorization: true,
  similarTraceMinScore: 0.7,
  similarTraceLimit: 5,
  feedbackTraceLimit: 3,
};

/**
 * Database row types
 */
interface TraceRow {
  id: string;
  trace_id: string;
  steps: string;
  metadata: string | null;
}

interface FeedbackRow {
  trace_id: string;
  rating: string;
  rating_detail: string | null;
}

interface TraceSummaryRow {
  trace_id: string;
  summary: string;
  key_behaviors: string | null;
}

/**
 * TaskMetadataEnricher
 *
 * Enriches DataInst records with metadata by:
 * 1. Finding similar high-rated traces using vector similarity
 * 2. Finding traces with specific human feedback
 * 3. Categorizing task type using heuristics
 * 4. Caching trace summaries for reuse
 */
export class TaskMetadataEnricher {
  private drizzle: Database;

  constructor(
    private db: D1Database,
    private vectorService: VectorService,
    private embeddingService: EmbeddingService,
    private ai: Ai
  ) {
    this.drizzle = createDb(db);
  }

  /**
   * Enrich a DataInst with metadata
   *
   * @param dataInst - The DataInst to enrich
   * @param agentId - The agent ID for filtering traces
   * @param options - Enrichment options
   * @returns Enriched DataInst
   */
  async enrich(
    dataInst: DataInst,
    agentId: string,
    options?: EnrichmentOptions
  ): Promise<DataInst> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Run enrichments in parallel where possible
    const [similarTraces, feedbackTraces, taskInfo] = await Promise.all([
      opts.enableSimilarTraces
        ? this.findSimilarHighRatedTraces(
            dataInst.task.user_message,
            agentId,
            opts.similarTraceMinScore,
            opts.similarTraceLimit
          )
        : Promise.resolve([]),

      opts.enableFeedbackTraces
        ? this.findTracesWithFeedback(agentId, opts.feedbackTraceLimit)
        : Promise.resolve([]),

      opts.enableTaskCategorization
        ? this.categorizeTask(dataInst.task.user_message)
        : Promise.resolve({ task_type: undefined, difficulty: undefined, domain: undefined }),
    ]);

    // Update task_metadata
    dataInst.task_metadata = {
      ...dataInst.task_metadata,
      similar_high_rated_traces: similarTraces.length > 0 ? similarTraces : undefined,
      traces_with_specific_feedback: feedbackTraces.length > 0 ? feedbackTraces : undefined,
      task_type: taskInfo.task_type,
      difficulty: taskInfo.difficulty,
      domain: taskInfo.domain,
    };

    return dataInst;
  }

  /**
   * Find similar high-rated traces using vector similarity
   *
   * @param userMessage - The task message to find similar traces for
   * @param agentId - Filter by agent ID
   * @param minScore - Minimum similarity score (0-1)
   * @param limit - Maximum number of results
   * @returns Array of trace summaries
   */
  private async findSimilarHighRatedTraces(
    userMessage: string,
    agentId: string,
    minScore: number,
    limit: number
  ): Promise<TraceSummary[]> {
    try {
      // Generate embedding for the user message
      const queryVector = await this.embeddingService.embed(userMessage);

      // Query for similar traces
      // Note: Vectorize doesn't support complex filtering, so we filter in memory
      const vectorResults = await this.vectorService.query(queryVector, {
        topK: limit * 3, // Get more candidates for filtering
        returnMetadata: true,
      });

      if (vectorResults.matches.length === 0) {
        return [];
      }

      // Get trace IDs that match similarity threshold
      const candidateTraceIds = vectorResults.matches
        .filter(m => m.score >= minScore)
        .map(m => m.id)
        .slice(0, limit * 2); // Still get more for filtering

      if (candidateTraceIds.length === 0) {
        return [];
      }

      // Query database for traces with positive feedback and matching agent
      const results = await this.drizzle
        .select({
          id: traces.id,
          traceId: traces.traceId,
          rating: feedback.rating
        })
        .from(traces)
        .innerJoin(feedback, eq(traces.id, feedback.traceId))
        .innerJoin(agentVersions, eq(traces.agentVersionId, agentVersions.id))
        .where(
          and(
            inArray(traces.id, candidateTraceIds),
            eq(agentVersions.agentId, agentId),
            eq(feedback.rating, 'positive')
          )
        )
        .limit(limit);

      if (results.length === 0) {
        return [];
      }

      // Get or generate summaries for these traces
      const summaries = await Promise.all(
        results.map(async (row) => {
          const summary = await this.getOrGenerateTraceSummary(row.id);
          const matchScore = vectorResults.matches.find(m => m.id === row.id)?.score ?? 0;

          return {
            trace_id: row.traceId,
            summary: summary.summary,
            human_score: 1.0, // Positive rating maps to 1.0
            key_behaviors: summary.key_behaviors,
          };
        })
      );

      return summaries;
    } catch (error) {
      console.error('Error finding similar high-rated traces:', error);
      return [];
    }
  }

  /**
   * Find traces with specific human feedback
   *
   * @param agentId - Filter by agent ID
   * @param limit - Maximum number of results
   * @returns Array of trace feedback pairs
   */
  private async findTracesWithFeedback(
    agentId: string,
    limit: number
  ): Promise<TraceFeedbackPair[]> {
    try {
      const results = await this.drizzle
        .select({
          traceId: traces.traceId,
          rating: feedback.rating,
          ratingDetail: feedback.ratingDetail
        })
        .from(traces)
        .innerJoin(feedback, eq(traces.id, feedback.traceId))
        .innerJoin(agentVersions, eq(traces.agentVersionId, agentVersions.id))
        .where(
          and(
            eq(agentVersions.agentId, agentId),
            isNotNull(feedback.ratingDetail),
            ne(feedback.ratingDetail, '')
          )
        )
        .orderBy(desc(feedback.createdAt))
        .limit(limit);

      if (results.length === 0) {
        return [];
      }

      return results.map(row => ({
        trace_id: row.traceId,
        human_feedback: row.ratingDetail!,
        human_score: this.ratingToScore(row.rating),
      }));
    } catch (error) {
      console.error('Error finding traces with feedback:', error);
      return [];
    }
  }

  /**
   * Categorize task using heuristics
   *
   * @param userMessage - The task message to categorize
   * @returns Task categorization
   */
  private async categorizeTask(userMessage: string): Promise<{
    task_type?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    domain?: string;
  }> {
    const lowerMessage = userMessage.toLowerCase();

    // Task type heuristics
    let task_type: string | undefined;
    if (
      lowerMessage.includes('write') ||
      lowerMessage.includes('code') ||
      lowerMessage.includes('implement') ||
      lowerMessage.includes('create function')
    ) {
      task_type = 'code_generation';
    } else if (
      lowerMessage.includes('what is') ||
      lowerMessage.includes('explain') ||
      lowerMessage.includes('how do') ||
      lowerMessage.includes('?')
    ) {
      task_type = 'qa';
    } else if (
      lowerMessage.includes('classify') ||
      lowerMessage.includes('categorize') ||
      lowerMessage.includes('is this')
    ) {
      task_type = 'classification';
    } else if (
      lowerMessage.includes('extract') ||
      lowerMessage.includes('find') ||
      lowerMessage.includes('get the')
    ) {
      task_type = 'extraction';
    }

    // Domain heuristics
    let domain: string | undefined;
    if (
      lowerMessage.includes('code') ||
      lowerMessage.includes('program') ||
      lowerMessage.includes('function') ||
      lowerMessage.includes('debug')
    ) {
      domain = 'coding';
    } else if (
      lowerMessage.includes('math') ||
      lowerMessage.includes('calculate') ||
      lowerMessage.includes('solve')
    ) {
      domain = 'math';
    } else if (
      lowerMessage.includes('help') ||
      lowerMessage.includes('issue') ||
      lowerMessage.includes('problem')
    ) {
      domain = 'support';
    } else if (
      lowerMessage.includes('write a story') ||
      lowerMessage.includes('creative') ||
      lowerMessage.includes('imagine')
    ) {
      domain = 'creative';
    }

    // Difficulty heuristics (simple length-based for now)
    let difficulty: 'easy' | 'medium' | 'hard' | undefined;
    const wordCount = userMessage.split(/\s+/).length;
    if (wordCount < 10) {
      difficulty = 'easy';
    } else if (wordCount < 30) {
      difficulty = 'medium';
    } else {
      difficulty = 'hard';
    }

    return { task_type, difficulty, domain };
  }

  /**
   * Get or generate a trace summary (with caching)
   *
   * @param traceId - The trace ID (internal DB ID, not external trace_id)
   * @returns Trace summary with key behaviors
   */
  private async getOrGenerateTraceSummary(
    traceId: string
  ): Promise<{ summary: string; key_behaviors: string[] }> {
    // Check cache first
    const cached = await this.drizzle
      .select({
        summary: traceSummaries.summary,
        keyBehaviors: traceSummaries.keyBehaviors
      })
      .from(traceSummaries)
      .where(eq(traceSummaries.traceId, traceId))
      .limit(1);

    if (cached.length > 0 && cached[0]) {
      return {
        summary: cached[0].summary,
        key_behaviors: cached[0].keyBehaviors ?? [],
      };
    }

    // Generate new summary
    const traceResults = await this.drizzle
      .select({
        id: traces.id,
        traceId: traces.traceId,
        steps: traces.steps,
        metadata: traces.metadata
      })
      .from(traces)
      .where(eq(traces.id, traceId))
      .limit(1);

    if (traceResults.length === 0) {
      return {
        summary: 'Trace not found',
        key_behaviors: [],
      };
    }

    const trace = traceResults[0];
    const summary = await this.generateTraceSummary({
      id: trace.id,
      trace_id: trace.traceId,
      steps: JSON.stringify(trace.steps),
      metadata: trace.metadata ? JSON.stringify(trace.metadata) : null
    });

    // Cache the summary
    try {
      await this.drizzle
        .insert(traceSummaries)
        .values({
          traceId: traceId,
          summary: summary.summary,
          keyBehaviors: summary.key_behaviors
        });
    } catch (error) {
      console.error('Error caching trace summary:', error);
    }

    return summary;
  }

  /**
   * Generate a trace summary using Workers AI
   *
   * @param trace - The trace row from database
   * @returns Generated summary with key behaviors
   */
  private async generateTraceSummary(
    trace: TraceRow
  ): Promise<{ summary: string; key_behaviors: string[] }> {
    try {
      const steps: any[] = JSON.parse(trace.steps);

      // Extract key information from trace
      const userMessages = steps
        .flatMap(s => s.messages_added || [])
        .filter(m => m.role === 'user')
        .map(m => m.content);

      const assistantMessages = steps
        .flatMap(s => s.messages_added || [])
        .filter(m => m.role === 'assistant')
        .map(m => m.content);

      const toolCalls = steps.flatMap(s => s.tool_calls || []).map(t => t.tool_name);

      // Create a prompt for summarization
      const prompt = `Summarize this agent trace execution in 2-3 sentences, focusing on what the agent did well:

User Request: ${userMessages[0] || 'N/A'}

Agent Response Preview: ${assistantMessages[0]?.substring(0, 200) || 'N/A'}

Tools Used: ${toolCalls.join(', ') || 'None'}

Provide a JSON response with:
{
  "summary": "2-3 sentence summary",
  "key_behaviors": ["behavior 1", "behavior 2", "behavior 3"]
}`;

      // Use Workers AI for summarization (llama-2 or similar fast model)
      const response = await this.ai.run('@cf/meta/llama-2-7b-chat-int8', {
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }) as { response?: string };

      if (response.response) {
        try {
          // Try to parse JSON response
          const parsed = JSON.parse(response.response);
          return {
            summary: parsed.summary || response.response.substring(0, 500),
            key_behaviors: Array.isArray(parsed.key_behaviors)
              ? parsed.key_behaviors.slice(0, 5)
              : [],
          };
        } catch {
          // If parsing fails, use raw response as summary
          return {
            summary: response.response.substring(0, 500),
            key_behaviors: [],
          };
        }
      }

      // Fallback summary
      return {
        summary: `Trace executed with ${steps.length} steps, ${toolCalls.length} tool calls`,
        key_behaviors: toolCalls.slice(0, 3),
      };
    } catch (error) {
      console.error('Error generating trace summary:', error);
      return {
        summary: 'Error generating summary',
        key_behaviors: [],
      };
    }
  }

  /**
   * Convert rating string to numeric score
   *
   * @param rating - Rating string ('positive' | 'negative' | 'neutral')
   * @returns Numeric score (0-1)
   */
  private ratingToScore(rating: string): number {
    switch (rating) {
      case 'positive':
        return 1.0;
      case 'neutral':
        return 0.5;
      case 'negative':
        return 0.0;
      default:
        return 0.5;
    }
  }
}
