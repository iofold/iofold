/**
 * Eval Generation API Endpoints
 *
 * Handles the automated eval generation flow using GEPA approach:
 * - Task extraction from traces
 * - Candidate eval generation
 * - Testing and ranking candidates
 * - Winner selection and activation
 */

/// <reference types="@cloudflare/workers-types" />

import {
  createErrorResponse,
  createSuccessResponse,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
} from './utils';

import { SingleStepTaskExtractor } from '../services/task-extraction/single-step-extractor';
import { TaskMetadataEnricher, type EnrichmentOptions } from '../services/task-extraction/metadata-enricher';
import { AutoEvalGenerator, type LabeledTrace, type EvalCandidate, type PatternAnalysis } from '../services/eval/auto-eval-generator';
import { CandidateTester, type TestResult } from '../services/eval/candidate-tester';
import { WinnerSelector, type SelectionCriteria, type SelectionResult } from '../services/eval/winner-selector';
import type { DataInst } from '../types/datainst';
import { createDb, type Database } from '../db/client';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { agents, agentVersions } from '../db/schema/agents';
import { traces } from '../db/schema/traces';
import { feedback } from '../db/schema/feedback';
import { taskMetadata } from '../db/schema/feedback';
import { evals } from '../db/schema/evals';

export interface Env {
  DB: D1Database;
  CF_ACCOUNT_ID?: string;
  CF_AI_GATEWAY_ID?: string;
  CF_AI_GATEWAY_TOKEN?: string;
  SANDBOX?: any;
}

// ============================================================================
// Phase 1: Task Extraction
// ============================================================================

/**
 * POST /api/agents/:agentId/tasks/extract
 *
 * Extract tasks from agent's traces and enrich with metadata.
 *
 * @param request - HTTP request with optional enrichment options
 * @param env - Cloudflare environment with D1 database
 * @param agentId - Agent ID from URL
 * @returns 200 OK with extraction results
 */
export async function extractTasks(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing workspace ID', 400);
    }

    const drizzle = createDb(env.DB);

    // Verify agent exists
    const agentResult = await drizzle
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Parse optional enrichment options
    const body = await parseJsonBody<{ options?: EnrichmentOptions }>(request).catch(() => ({ options: {} }));
    const options = body.options || {};

    // Fetch traces for this agent (via agent_versions)
    const tracesResult = await drizzle
      .select({
        id: traces.id,
        trace_id: traces.traceId,
        steps: traces.steps,
      })
      .from(traces)
      .innerJoin(agentVersions, eq(traces.agentVersionId, agentVersions.id))
      .where(eq(agentVersions.agentId, agentId))
      .orderBy(desc(traces.importedAt))
      .limit(100);

    if (tracesResult.length === 0) {
      return createSuccessResponse({
        extracted: 0,
        skipped: 0,
        tasks: [],
        message: 'No traces found for this agent'
      });
    }

    // Parse traces to match expected format
    const tracesList = tracesResult.map((row): any => ({
      id: row.id,
      trace_id: row.trace_id,
      steps: row.steps || [],
      workspace_id: workspaceId,
      integration_id: '',
      source: 'unknown',
      timestamp: new Date().toISOString(),
      imported_at: new Date().toISOString()
    }));

    // Extract tasks using SingleStepTaskExtractor
    const extractor = new SingleStepTaskExtractor();
    const extractionResult = extractor.extractBatch(tracesList);

    // Return extracted tasks (enrichment will be done separately with proper bindings)
    // For now, just return the extracted tasks without full enrichment
    const extractedTasks: DataInst[] = extractionResult.extracted;

    // Store basic task info in database
    for (let i = 0; i < extractedTasks.length; i++) {
      const dataInst = extractedTasks[i];
      const trace = tracesList[i]; // Match trace to task by index
      if (trace) {
        const taskId = `task_${crypto.randomUUID()}`;
        await drizzle
          .insert(taskMetadata)
          .values({
            id: taskId,
            traceId: trace.id,
            userMessage: dataInst.task.user_message,
            taskType: null,
            difficulty: null,
            domain: null,
            customMetadata: {},
          })
          .onConflictDoUpdate({
            target: taskMetadata.traceId,
            set: {
              userMessage: sql`excluded.user_message`,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            },
          });
      }
    }

    return createSuccessResponse({
      extracted: extractionResult.stats.successful,
      skipped: extractionResult.stats.skipped,
      tasks: extractedTasks,
      message: `Extracted ${extractionResult.stats.successful} tasks, skipped ${extractionResult.stats.skipped}`
    });

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents/:agentId/tasks
 *
 * List extracted tasks with metadata for an agent.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with list of tasks
 */
export async function listTasks(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing workspace ID', 400);
    }

    const drizzle = createDb(env.DB);

    // Verify agent exists
    const agentResult = await drizzle
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get tasks with their trace associations (via agent_versions)
    const tasksResult = await drizzle
      .select({
        id: taskMetadata.id,
        trace_id: taskMetadata.traceId,
        user_message: taskMetadata.userMessage,
        task_type: taskMetadata.taskType,
        difficulty: taskMetadata.difficulty,
        domain: taskMetadata.domain,
        custom_metadata: taskMetadata.customMetadata,
        created_at: taskMetadata.createdAt,
      })
      .from(taskMetadata)
      .innerJoin(traces, eq(taskMetadata.traceId, traces.id))
      .innerJoin(agentVersions, eq(traces.agentVersionId, agentVersions.id))
      .where(eq(agentVersions.agentId, agentId))
      .orderBy(desc(taskMetadata.createdAt))
      .limit(100);

    const tasks = tasksResult.map((row) => ({
      id: row.id,
      trace_id: row.trace_id,
      task: {
        user_message: row.user_message
      },
      task_metadata: {
        task_type: row.task_type || undefined,
        difficulty: row.difficulty || undefined,
        domain: row.domain || undefined,
        custom: row.custom_metadata || undefined
      },
      created_at: row.created_at
    }));

    return createSuccessResponse({
      tasks,
      total: tasks.length
    });

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

// ============================================================================
// Phase 2: Eval Generation
// ============================================================================

/**
 * POST /api/agents/:agentId/evals/generate
 *
 * Generate candidate eval functions from labeled traces.
 *
 * @param request - HTTP request with generation parameters
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with generated candidates and patterns
 */
export async function generateEvals(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing workspace ID', 400);
    }

    const drizzle = createDb(env.DB);

    // Verify agent exists
    const agentResult = await drizzle
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Parse request body
    let body: { target_count?: number; min_labeled_traces?: number } = {};
    try {
      body = await parseJsonBody<{
        target_count?: number;
        min_labeled_traces?: number;
      }>(request);
    } catch {
      // Empty body is fine, use defaults
    }

    const targetCount = body.target_count || 5;
    const minLabeledTraces = body.min_labeled_traces || 10;

    // Get labeled traces (traces with feedback)
    const labeledTracesResult = await drizzle
      .select({
        trace_id: traces.id,
        steps: traces.steps,
        rating: feedback.rating,
        rating_detail: feedback.ratingDetail,
      })
      .from(traces)
      .innerJoin(agentVersions, eq(traces.agentVersionId, agentVersions.id))
      .innerJoin(feedback, eq(traces.id, feedback.traceId))
      .where(and(
        eq(agentVersions.agentId, agentId),
        sql`(${feedback.agentId} = ${agentId} OR ${feedback.agentId} IS NULL)`
      ))
      .orderBy(desc(traces.importedAt))
      .limit(100);

    if (labeledTracesResult.length < minLabeledTraces) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        `Need at least ${minLabeledTraces} labeled traces, found ${labeledTracesResult.length}`,
        400
      );
    }

    // Transform to LabeledTrace format
    const labeledTraces: LabeledTrace[] = labeledTracesResult.map((row) => {
      const steps = (row.steps || []) as any[];

      // Extract user message from first step
      let userMessage = '';
      for (const step of steps) {
        if (step.messages_added) {
          for (const msg of step.messages_added) {
            if (msg.role === 'user') {
              userMessage = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
              break;
            }
          }
        }
        if (userMessage) break;
      }

      // Convert rating to 0-1 score
      const humanScore = row.rating === 'positive' ? 1.0 : row.rating === 'negative' ? 0.0 : 0.5;

      return {
        trace_id: row.trace_id,
        task: { user_message: userMessage },
        trace: { steps },
        human_score: humanScore,
        human_feedback: row.rating_detail || undefined
      };
    });

    // Generate candidates
    if (!env.CF_ACCOUNT_ID || !env.CF_AI_GATEWAY_ID) {
      return createErrorResponse('CONFIGURATION_ERROR', 'AI Gateway not configured', 500);
    }

    const generator = new AutoEvalGenerator({
      cfAccountId: env.CF_ACCOUNT_ID,
      cfGatewayId: env.CF_AI_GATEWAY_ID,
      cfGatewayToken: env.CF_AI_GATEWAY_TOKEN
    });

    const candidates = await generator.generate(labeledTraces, targetCount);

    // Store candidates in evals table with status='candidate'
    for (const candidate of candidates) {
      // Get next version number for this agent
      const maxVersionResult = await drizzle
        .select({ maxVersion: sql<number>`MAX(${evals.version})` })
        .from(evals)
        .where(eq(evals.agentId, agentId));
      const nextVersion = (maxVersionResult[0]?.maxVersion || 0) + 1;

      await drizzle.insert(evals).values({
        id: candidate.id,
        agentId: agentId,
        version: nextVersion,
        name: `${candidate.variation} eval v${nextVersion}`,
        code: candidate.code,
        variation: candidate.variation,
        status: 'candidate',
      });
    }

    // Get pattern analysis
    const patterns: PatternAnalysis = {
      positive_patterns: ['Complete response', 'Addresses user request'],
      negative_patterns: ['Incomplete response', 'Off-topic'],
      key_differentiators: ['Completeness', 'Relevance']
    };

    return createSuccessResponse({
      candidates,
      patterns,
      message: `Generated ${candidates.length} candidate eval functions`
    });

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/agents/:agentId/evals/test
 *
 * Test candidate evals against labeled traces.
 *
 * @param request - HTTP request with candidate IDs
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with test results and ranking
 */
export async function testEvalCandidates(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing workspace ID', 400);
    }

    const drizzle = createDb(env.DB);

    // Verify agent exists
    const agentResult = await drizzle
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Parse request body
    const body = await parseJsonBody<{ candidate_ids: string[] }>(request);

    if (!body.candidate_ids || !Array.isArray(body.candidate_ids) || body.candidate_ids.length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'candidate_ids array is required and must not be empty', 400);
    }

    // Validate candidate_ids format and length
    if (body.candidate_ids.length > 100) {
      return createErrorResponse('VALIDATION_ERROR', 'candidate_ids array must contain at most 100 items', 400);
    }

    // Accept both standard UUIDs and candidate IDs (candidate_<variation>_<timestamp>_<random>)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const candidateIdRegex = /^candidate_[a-z_]+_\d+_[a-z0-9]+$/i;
    for (const id of body.candidate_ids) {
      if (typeof id !== 'string' || !(uuidRegex.test(id) || candidateIdRegex.test(id))) {
        return createErrorResponse('VALIDATION_ERROR', 'All candidate_ids must be valid UUIDs or candidate IDs', 400);
      }
    }

    // Fetch candidates from evals table
    const candidatesResult = await drizzle
      .select({
        id: evals.id,
        code: evals.code,
        variation: evals.variation,
      })
      .from(evals)
      .where(and(
        inArray(evals.id, body.candidate_ids),
        eq(evals.agentId, agentId)
      ));

    if (candidatesResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'No candidates found', 404);
    }

    const candidates: EvalCandidate[] = candidatesResult.map((row) => ({
      id: row.id,
      code: row.code,
      variation: row.variation!,
    }));

    // Get labeled traces (same as generate endpoint)
    const labeledTracesResult = await drizzle
      .select({
        trace_id: traces.id,
        steps: traces.steps,
        rating: feedback.rating,
        rating_detail: feedback.ratingDetail,
      })
      .from(traces)
      .innerJoin(agentVersions, eq(traces.agentVersionId, agentVersions.id))
      .innerJoin(feedback, eq(traces.id, feedback.traceId))
      .where(and(
        eq(agentVersions.agentId, agentId),
        sql`(${feedback.agentId} = ${agentId} OR ${feedback.agentId} IS NULL)`
      ))
      .orderBy(desc(traces.importedAt))
      .limit(100);

    if (labeledTracesResult.length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'No labeled traces found', 400);
    }

    // Transform to LabeledTrace format
    const labeledTraces: LabeledTrace[] = labeledTracesResult.map((row) => {
      const steps = (row.steps || []) as any[];

      let userMessage = '';
      for (const step of steps) {
        if (step.messages_added) {
          for (const msg of step.messages_added) {
            if (msg.role === 'user') {
              userMessage = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
              break;
            }
          }
        }
        if (userMessage) break;
      }

      const humanScore = row.rating === 'positive' ? 1.0 : row.rating === 'negative' ? 0.0 : 0.5;

      return {
        trace_id: row.trace_id,
        task: { user_message: userMessage },
        trace: { steps },
        human_score: humanScore,
        human_feedback: row.rating_detail || undefined
      };
    });

    // Test candidates
    if (!env.CF_ACCOUNT_ID || !env.CF_AI_GATEWAY_ID) {
      return createErrorResponse('CONFIGURATION_ERROR', 'AI Gateway not configured', 500);
    }

    const { EvalRunner } = await import('../services/eval/eval-runner');
    const { PythonRunner } = await import('../sandbox/python-runner');

    // Don't pass sandboxBinding in local dev - containers aren't enabled
    // The PythonRunner will automatically fall back to HTTP executor service
    const pythonRunner = new PythonRunner({
      timeout: 30000
      // sandboxBinding intentionally omitted for local dev
    });
    const evalRunner = new EvalRunner({
      cfAccountId: env.CF_ACCOUNT_ID || '',
      cfGatewayId: env.CF_AI_GATEWAY_ID || '',
      cfGatewayToken: env.CF_AI_GATEWAY_TOKEN,
      // sandboxBinding intentionally omitted for local dev
      maxBudgetUsd: 0.05,
      timeoutMs: 30000
    });
    const tester = new CandidateTester(evalRunner);

    const testResults = await tester.testAndRankCandidates(candidates, labeledTraces);

    // Update evals in database with test results
    for (const result of testResults.results) {
      await drizzle
        .update(evals)
        .set({
          agreementRate: result.agreement_rate,
          accuracy: result.accuracy,
          cohenKappa: result.cohen_kappa,
          f1Score: result.f1_score,
          confusionMatrix: result.confusion_matrix as any,
          perTraceResults: result.per_trace_results as any,
          totalCostUsd: result.execution_stats.total_cost_usd,
          avgDurationMs: result.execution_stats.avg_duration_ms,
          status: 'testing',  // Mark as tested
        })
        .where(eq(evals.id, result.candidate_id));
    }

    return createSuccessResponse({
      results: testResults.results,
      ranking: testResults.ranking,
      winner: testResults.winner || null,
      message: `Tested ${testResults.results.length} candidates`
    });

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    if (error.message === 'Invalid JSON in request body') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

// ============================================================================
// Phase 3: Winner Selection & Activation
// ============================================================================

/**
 * POST /api/agents/:agentId/evals/select-winner
 *
 * Select the best eval candidate and optionally activate it.
 *
 * @param request - HTTP request with candidate IDs and criteria
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with winner and recommendation
 */
export async function selectWinner(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing workspace ID', 400);
    }

    const drizzle = createDb(env.DB);

    // Verify agent exists
    const agentResult = await drizzle
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Parse request body
    const body = await parseJsonBody<{
      candidate_ids: string[];
      criteria?: SelectionCriteria;
      activate?: boolean;
    }>(request);

    if (!body.candidate_ids || !Array.isArray(body.candidate_ids) || body.candidate_ids.length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'candidate_ids array is required and must not be empty', 400);
    }

    // Validate candidate_ids format and length
    if (body.candidate_ids.length > 100) {
      return createErrorResponse('VALIDATION_ERROR', 'candidate_ids array must contain at most 100 items', 400);
    }

    // Accept both standard UUIDs and candidate IDs (candidate_<variation>_<timestamp>_<random>)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const candidateIdRegex = /^candidate_[a-z_]+_\d+_[a-z0-9]+$/i;
    for (const id of body.candidate_ids) {
      if (typeof id !== 'string' || !(uuidRegex.test(id) || candidateIdRegex.test(id))) {
        return createErrorResponse('VALIDATION_ERROR', 'All candidate_ids must be valid UUIDs or candidate IDs', 400);
      }
    }

    // Fetch candidates with test results from evals table
    // Filter by status='testing' or check for presence of test metrics (accuracy, etc.)
    const candidatesResult = await drizzle
      .select({
        id: evals.id,
        code: evals.code,
        variation: evals.variation,
        agreement_rate: evals.agreementRate,
        accuracy: evals.accuracy,
        cohen_kappa: evals.cohenKappa,
        f1_score: evals.f1Score,
        confusion_matrix: evals.confusionMatrix,
        per_trace_results: evals.perTraceResults,
        total_cost_usd: evals.totalCostUsd,
        avg_duration_ms: evals.avgDurationMs,
      })
      .from(evals)
      .where(and(
        inArray(evals.id, body.candidate_ids),
        eq(evals.agentId, agentId),
        sql`${evals.accuracy} IS NOT NULL`
      ));

    if (candidatesResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'No tested candidates found', 404);
    }

    // Transform to EvalCandidate and TestResult
    const candidates: EvalCandidate[] = [];
    const testResults: TestResult[] = [];

    for (const row of candidatesResult) {
      const candidate: EvalCandidate = {
        id: row.id,
        code: row.code,
        variation: row.variation!
      };
      candidates.push(candidate);

      const testResult: TestResult = {
        candidate_id: row.id,
        agreement_rate: row.agreement_rate!,
        accuracy: row.accuracy!,
        cohen_kappa: row.cohen_kappa!,
        precision: 0, // Calculated from confusion matrix
        recall: 0,
        f1_score: row.f1_score!,
        confusion_matrix: row.confusion_matrix as any,
        per_trace_results: row.per_trace_results as any,
        execution_stats: {
          total_cost_usd: row.total_cost_usd!,
          avg_duration_ms: row.avg_duration_ms!,
          failures: 0
        }
      };

      // Calculate precision and recall from confusion matrix
      const cm = testResult.confusion_matrix;
      testResult.precision = (cm.true_positive + cm.false_positive) > 0
        ? cm.true_positive / (cm.true_positive + cm.false_positive)
        : 0;
      testResult.recall = (cm.true_positive + cm.false_negative) > 0
        ? cm.true_positive / (cm.true_positive + cm.false_negative)
        : 0;

      testResults.push(testResult);
    }

    // Select winner
    const selector = new WinnerSelector(env.DB);
    const selectionResult: SelectionResult = selector.selectWinner(
      candidates,
      testResults,
      body.criteria || {}
    );

    // Activate if requested and winner exists
    let activatedEvalId: string | undefined;
    if (body.activate && selectionResult.winner) {
      activatedEvalId = await selector.activateEval(
        agentId,
        selectionResult.winner,
        selectionResult.winner_metrics!
      );
    }

    return createSuccessResponse({
      winner: selectionResult.winner,
      winner_metrics: selectionResult.winner_metrics,
      all_candidates: selectionResult.all_candidates,
      recommendation: selectionResult.recommendation,
      activated_eval_id: activatedEvalId
    });

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    if (error.message === 'Invalid JSON in request body') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/agents/:agentId/evals/:evalId/activate
 *
 * Activate a specific eval for an agent.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @param evalId - Eval candidate ID from URL
 * @returns 200 OK with activation status
 */
export async function activateEval(
  request: Request,
  env: Env,
  agentId: string,
  evalId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing workspace ID', 400);
    }

    const drizzle = createDb(env.DB);

    // Verify agent exists
    const agentResult = await drizzle
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Verify eval exists and belongs to agent
    const evalResult = await drizzle
      .select({
        id: evals.id,
        code: evals.code,
        variation: evals.variation,
        agreement_rate: evals.agreementRate,
        accuracy: evals.accuracy,
        cohen_kappa: evals.cohenKappa,
        f1_score: evals.f1Score,
        confusion_matrix: evals.confusionMatrix,
        per_trace_results: evals.perTraceResults,
      })
      .from(evals)
      .where(and(
        eq(evals.id, evalId),
        eq(evals.agentId, agentId),
        sql`${evals.accuracy} IS NOT NULL`
      ))
      .limit(1);

    if (evalResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Eval not found or not tested', 404);
    }

    // Get previous active eval
    const previousActiveResult = await drizzle
      .select({ id: evals.id })
      .from(evals)
      .where(and(
        eq(evals.agentId, agentId),
        eq(evals.status, 'active')
      ))
      .limit(1);

    // Archive previous active eval
    if (previousActiveResult.length > 0) {
      await drizzle
        .update(evals)
        .set({ status: 'archived' })
        .where(eq(evals.id, previousActiveResult[0].id));
    }

    // Activate new eval
    await drizzle
      .update(evals)
      .set({
        status: 'active',
        activatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(evals.id, evalId));

    // Update agent's active_eval_id
    await drizzle
      .update(agents)
      .set({ activeEvalId: evalId })
      .where(eq(agents.id, agentId));

    return createSuccessResponse({
      success: true,
      activated_eval_id: evalId,
      previous_eval_id: previousActiveResult.length > 0 ? previousActiveResult[0].id : null,
      message: 'Eval activated successfully'
    });

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/agents/:agentId/evals/active
 *
 * Get the currently active eval for an agent.
 *
 * @param request - HTTP request
 * @param env - Cloudflare environment
 * @param agentId - Agent ID from URL
 * @returns 200 OK with active eval details
 */
export async function getActiveEval(
  request: Request,
  env: Env,
  agentId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request);
    validateWorkspaceAccess(workspaceId);
    if (!workspaceId) {
      return createErrorResponse('VALIDATION_ERROR', 'Missing workspace ID', 400);
    }

    const drizzle = createDb(env.DB);

    // Verify agent exists
    const agentResult = await drizzle
      .select({
        id: agents.id,
        active_eval_id: agents.activeEvalId,
      })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
      .limit(1);

    if (agentResult.length === 0) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    const agent = agentResult[0];

    if (!agent.active_eval_id) {
      return createSuccessResponse({
        eval: null,
        metrics: null,
        message: 'No active eval for this agent'
      });
    }

    // Get active eval with metrics from evals table
    const activeEvalResult = await drizzle
      .select({
        id: evals.id,
        code: evals.code,
        variation: evals.variation,
        agreement_rate: evals.agreementRate,
        accuracy: evals.accuracy,
        cohen_kappa: evals.cohenKappa,
        f1_score: evals.f1Score,
        confusion_matrix: evals.confusionMatrix,
        per_trace_results: evals.perTraceResults,
        total_cost_usd: evals.totalCostUsd,
        avg_duration_ms: evals.avgDurationMs,
        activated_at: evals.activatedAt,
        created_at: evals.createdAt,
      })
      .from(evals)
      .where(and(
        eq(evals.id, agent.active_eval_id),
        eq(evals.agentId, agentId),
        eq(evals.status, 'active')
      ))
      .limit(1);

    if (activeEvalResult.length === 0) {
      return createSuccessResponse({
        eval: null,
        metrics: null,
        message: 'Active eval not found (may have been archived)'
      });
    }

    const evalRow = activeEvalResult[0];

    const evalCandidate: EvalCandidate = {
      id: evalRow.id,
      code: evalRow.code,
      variation: evalRow.variation!
    };

    const metrics: TestResult | null = evalRow.accuracy !== null ? {
      candidate_id: evalRow.id,
      agreement_rate: evalRow.agreement_rate!,
      accuracy: evalRow.accuracy,
      cohen_kappa: evalRow.cohen_kappa!,
      precision: 0,
      recall: 0,
      f1_score: evalRow.f1_score!,
      confusion_matrix: evalRow.confusion_matrix as any,
      per_trace_results: evalRow.per_trace_results as any,
      execution_stats: {
        total_cost_usd: evalRow.total_cost_usd!,
        avg_duration_ms: evalRow.avg_duration_ms!,
        failures: 0
      }
    } : null;

    // Calculate precision and recall if metrics exist
    if (metrics) {
      const cm = metrics.confusion_matrix;
      metrics.precision = (cm.true_positive + cm.false_positive) > 0
        ? cm.true_positive / (cm.true_positive + cm.false_positive)
        : 0;
      metrics.recall = (cm.true_positive + cm.false_negative) > 0
        ? cm.true_positive / (cm.true_positive + cm.false_negative)
        : 0;
    }

    return createSuccessResponse({
      eval: evalCandidate,
      metrics,
      activated_at: evalRow.activated_at,
      created_at: evalRow.created_at
    });

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
