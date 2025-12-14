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

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Parse optional enrichment options
    const body = await parseJsonBody<{ options?: EnrichmentOptions }>(request).catch(() => ({ options: {} }));
    const options = body.options || {};

    // Fetch traces for this agent (via agent_versions)
    const tracesResult = await env.DB.prepare(`
      SELECT t.id, t.trace_id, t.steps
      FROM traces t
      JOIN agent_versions av ON t.agent_version_id = av.id
      WHERE av.agent_id = ?
      ORDER BY t.imported_at DESC
      LIMIT 100
    `)
      .bind(agentId)
      .all();

    if (!tracesResult.results || tracesResult.results.length === 0) {
      return createSuccessResponse({
        extracted: 0,
        skipped: 0,
        tasks: [],
        message: 'No traces found for this agent'
      });
    }

    // Parse traces to match expected format
    const traces = tracesResult.results.map((row: any): any => ({
      id: row.id,
      trace_id: row.trace_id,
      steps: row.steps ? JSON.parse(row.steps) : [],
      workspace_id: workspaceId,
      integration_id: '',
      source: 'unknown',
      timestamp: new Date().toISOString(),
      imported_at: new Date().toISOString()
    }));

    // Extract tasks using SingleStepTaskExtractor
    const extractor = new SingleStepTaskExtractor();
    const extractionResult = extractor.extractBatch(traces);

    // Return extracted tasks (enrichment will be done separately with proper bindings)
    // For now, just return the extracted tasks without full enrichment
    const extractedTasks: DataInst[] = extractionResult.extracted;

    // Store basic task info in database
    for (let i = 0; i < extractedTasks.length; i++) {
      const dataInst = extractedTasks[i];
      const trace = traces[i]; // Match trace to task by index
      if (trace) {
        const taskId = `task_${crypto.randomUUID()}`;
        await env.DB.prepare(`
          INSERT OR REPLACE INTO task_metadata (
            id, trace_id, user_message,
            task_type, difficulty, domain,
            custom_metadata, created_at, updated_at
          ) VALUES (
            COALESCE((SELECT id FROM task_metadata WHERE trace_id = ?), ?),
            ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
          )
        `)
          .bind(
            trace.id,  // for COALESCE subquery WHERE trace_id = ?
            taskId,    // for COALESCE fallback (new id if not exists)
            trace.id,  // trace_id column
            dataInst.task.user_message,
            null, // task_type (enrichment phase)
            null, // difficulty (enrichment phase)
            null, // domain (enrichment phase)
            JSON.stringify({})
          )
          .run();
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

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Get tasks with their trace associations (via agent_versions)
    const tasksResult = await env.DB.prepare(`
      SELECT
        tm.id,
        tm.trace_id,
        tm.user_message,
        tm.task_type,
        tm.difficulty,
        tm.domain,
        tm.custom_metadata,
        tm.created_at
      FROM task_metadata tm
      JOIN traces t ON tm.trace_id = t.id
      JOIN agent_versions av ON t.agent_version_id = av.id
      WHERE av.agent_id = ?
      ORDER BY tm.created_at DESC
      LIMIT 100
    `)
      .bind(agentId)
      .all();

    const tasks = tasksResult.results.map((row: any) => ({
      id: row.id,
      trace_id: row.trace_id,
      task: {
        user_message: row.user_message
      },
      task_metadata: {
        task_type: row.task_type || undefined,
        difficulty: row.difficulty || undefined,
        domain: row.domain || undefined,
        custom: row.custom_metadata ? JSON.parse(row.custom_metadata) : undefined
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

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
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
    const labeledTracesResult = await env.DB.prepare(`
      SELECT
        t.id as trace_id,
        t.steps,
        f.rating,
        f.rating_detail
      FROM traces t
      JOIN agent_versions av ON t.agent_version_id = av.id
      JOIN feedback f ON t.id = f.trace_id
      WHERE av.agent_id = ? AND (f.agent_id = ? OR f.agent_id IS NULL)
      ORDER BY t.imported_at DESC
      LIMIT 100
    `)
      .bind(agentId, agentId)
      .all();

    if (!labeledTracesResult.results || labeledTracesResult.results.length < minLabeledTraces) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        `Need at least ${minLabeledTraces} labeled traces, found ${labeledTracesResult.results?.length || 0}`,
        400
      );
    }

    // Transform to LabeledTrace format
    const labeledTraces: LabeledTrace[] = labeledTracesResult.results.map((row: any) => {
      const steps = row.steps ? JSON.parse(row.steps) : [];

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

    // Store candidates in database
    for (const candidate of candidates) {
      await env.DB.prepare(`
        INSERT INTO eval_candidates (
          id, agent_id, code, variation,
          status, created_at
        ) VALUES (?, ?, ?, ?, 'candidate', datetime('now'))
      `)
        .bind(candidate.id, agentId, candidate.code, candidate.variation)
        .run();
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

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
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

    // Fetch candidates from database
    const placeholders = body.candidate_ids.map(() => '?').join(',');
    const candidatesResult = await env.DB.prepare(`
      SELECT id, code, variation
      FROM eval_candidates
      WHERE id IN (${placeholders}) AND agent_id = ?
    `)
      .bind(...body.candidate_ids, agentId)
      .all();

    if (!candidatesResult.results || candidatesResult.results.length === 0) {
      return createErrorResponse('NOT_FOUND', 'No candidates found', 404);
    }

    const candidates: EvalCandidate[] = candidatesResult.results.map((row: any) => ({
      id: row.id,
      code: row.code,
      variation: row.variation
    }));

    // Get labeled traces (same as generate endpoint)
    const labeledTracesResult = await env.DB.prepare(`
      SELECT
        t.id as trace_id,
        t.steps,
        f.rating,
        f.rating_detail
      FROM traces t
      JOIN agent_versions av ON t.agent_version_id = av.id
      JOIN feedback f ON t.id = f.trace_id
      WHERE av.agent_id = ? AND (f.agent_id = ? OR f.agent_id IS NULL)
      ORDER BY t.imported_at DESC
      LIMIT 100
    `)
      .bind(agentId, agentId)
      .all();

    if (!labeledTracesResult.results || labeledTracesResult.results.length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'No labeled traces found', 400);
    }

    // Transform to LabeledTrace format
    const labeledTraces: LabeledTrace[] = labeledTracesResult.results.map((row: any) => {
      const steps = row.steps ? JSON.parse(row.steps) : [];

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

    const pythonRunner = new PythonRunner({
      sandboxBinding: env.SANDBOX,
      timeout: 30000
    });
    const evalRunner = new EvalRunner({
      cfAccountId: env.CF_ACCOUNT_ID || '',
      cfGatewayId: env.CF_AI_GATEWAY_ID || '',
      cfGatewayToken: env.CF_AI_GATEWAY_TOKEN,
      sandboxBinding: env.SANDBOX,
      maxBudgetUsd: 0.05,
      timeoutMs: 30000
    });
    const tester = new CandidateTester(evalRunner);

    const testResults = await tester.testAndRankCandidates(candidates, labeledTraces);

    // Update candidates in database with test results using batch transaction
    const updateStatements = testResults.results.map(result =>
      env.DB.prepare(`
        UPDATE eval_candidates
        SET
          agreement_rate = ?,
          accuracy = ?,
          cohen_kappa = ?,
          f1_score = ?,
          confusion_matrix = ?,
          per_trace_results = ?,
          total_cost_usd = ?,
          avg_duration_ms = ?
        WHERE id = ?
      `)
        .bind(
          result.agreement_rate,
          result.accuracy,
          result.cohen_kappa,
          result.f1_score,
          JSON.stringify(result.confusion_matrix),
          JSON.stringify(result.per_trace_results),
          result.execution_stats.total_cost_usd,
          result.execution_stats.avg_duration_ms,
          result.candidate_id
        )
    );

    await env.DB.batch(updateStatements);

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

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
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

    // Fetch candidates with test results
    // Note: We don't filter by status='tested' since that value is not in the schema.
    // Instead, we check for the presence of test metrics (accuracy, etc.)
    const placeholders = body.candidate_ids.map(() => '?').join(',');
    const candidatesResult = await env.DB.prepare(`
      SELECT
        id, code, variation,
        agreement_rate, accuracy, cohen_kappa, f1_score,
        confusion_matrix, per_trace_results,
        total_cost_usd, avg_duration_ms
      FROM eval_candidates
      WHERE id IN (${placeholders}) AND agent_id = ? AND accuracy IS NOT NULL
    `)
      .bind(...body.candidate_ids, agentId)
      .all();

    if (!candidatesResult.results || candidatesResult.results.length === 0) {
      return createErrorResponse('NOT_FOUND', 'No tested candidates found', 404);
    }

    // Transform to EvalCandidate and TestResult
    const candidates: EvalCandidate[] = [];
    const testResults: TestResult[] = [];

    for (const row of candidatesResult.results) {
      const candidate: EvalCandidate = {
        id: row.id as string,
        code: row.code as string,
        variation: row.variation as string
      };
      candidates.push(candidate);

      const testResult: TestResult = {
        candidate_id: row.id as string,
        agreement_rate: row.agreement_rate as number,
        accuracy: row.accuracy as number,
        cohen_kappa: row.cohen_kappa as number,
        precision: 0, // Calculated from confusion matrix
        recall: 0,
        f1_score: row.f1_score as number,
        confusion_matrix: JSON.parse(row.confusion_matrix as string),
        per_trace_results: JSON.parse(row.per_trace_results as string),
        execution_stats: {
          total_cost_usd: row.total_cost_usd as number,
          avg_duration_ms: row.avg_duration_ms as number,
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

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    // Verify eval candidate exists and belongs to agent
    const candidate = await env.DB.prepare(`
      SELECT
        id, code, variation,
        agreement_rate, accuracy, cohen_kappa, f1_score,
        confusion_matrix, per_trace_results
      FROM eval_candidates
      WHERE id = ? AND agent_id = ? AND accuracy IS NOT NULL
    `)
      .bind(evalId, agentId)
      .first();

    if (!candidate) {
      return createErrorResponse('NOT_FOUND', 'Eval candidate not found or not tested', 404);
    }

    // Get previous active eval
    const previousActive = await env.DB.prepare(`
      SELECT id FROM eval_candidates
      WHERE agent_id = ? AND status = 'active'
    `)
      .bind(agentId)
      .first();

    // Archive previous active eval
    if (previousActive) {
      await env.DB.prepare(`
        UPDATE eval_candidates
        SET status = 'archived'
        WHERE id = ?
      `)
        .bind(previousActive.id)
        .run();
    }

    // Activate new eval
    await env.DB.prepare(`
      UPDATE eval_candidates
      SET status = 'active', activated_at = datetime('now')
      WHERE id = ?
    `)
      .bind(evalId)
      .run();

    // Update agent's active_eval_id
    await env.DB.prepare(`
      UPDATE agents
      SET active_eval_id = ?
      WHERE id = ?
    `)
      .bind(evalId, agentId)
      .run();

    return createSuccessResponse({
      success: true,
      activated_eval_id: evalId,
      previous_eval_id: previousActive?.id || null,
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

    // Verify agent exists
    const agent = await env.DB.prepare(
      'SELECT id, active_eval_id FROM agents WHERE id = ? AND workspace_id = ?'
    )
      .bind(agentId, workspaceId)
      .first();

    if (!agent) {
      return createErrorResponse('NOT_FOUND', 'Agent not found', 404);
    }

    if (!agent.active_eval_id) {
      return createSuccessResponse({
        eval: null,
        metrics: null,
        message: 'No active eval for this agent'
      });
    }

    // Get active eval with metrics
    const evalResult = await env.DB.prepare(`
      SELECT
        id, code, variation,
        agreement_rate, accuracy, cohen_kappa, f1_score,
        confusion_matrix, per_trace_results,
        total_cost_usd, avg_duration_ms,
        activated_at, created_at
      FROM eval_candidates
      WHERE id = ? AND agent_id = ? AND status = 'active'
    `)
      .bind(agent.active_eval_id, agentId)
      .first();

    if (!evalResult) {
      return createSuccessResponse({
        eval: null,
        metrics: null,
        message: 'Active eval not found (may have been archived)'
      });
    }

    const evalCandidate: EvalCandidate = {
      id: evalResult.id as string,
      code: evalResult.code as string,
      variation: evalResult.variation as string
    };

    const metrics: TestResult | null = evalResult.accuracy !== null ? {
      candidate_id: evalResult.id as string,
      agreement_rate: evalResult.agreement_rate as number,
      accuracy: evalResult.accuracy as number,
      cohen_kappa: evalResult.cohen_kappa as number,
      precision: 0,
      recall: 0,
      f1_score: evalResult.f1_score as number,
      confusion_matrix: JSON.parse(evalResult.confusion_matrix as string),
      per_trace_results: JSON.parse(evalResult.per_trace_results as string),
      execution_stats: {
        total_cost_usd: evalResult.total_cost_usd as number,
        avg_duration_ms: evalResult.avg_duration_ms as number,
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
      activated_at: evalResult.activated_at,
      created_at: evalResult.created_at
    });

  } catch (error: any) {
    if (error.message === 'Missing X-Workspace-Id header') {
      return createErrorResponse('VALIDATION_ERROR', error.message, 400);
    }
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
