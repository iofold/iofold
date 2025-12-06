/**
 * Eval Monitoring API Endpoints
 *
 * Provides endpoints for eval performance metrics, alerts, and settings.
 */

/// <reference types="@cloudflare/workers-types" />

import {
  createErrorResponse,
  createSuccessResponse,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
} from './utils';
import { PerformanceMonitor, DEFAULT_THRESHOLDS } from '../monitoring/performance-monitor';
import { PromptManager } from '../prompts/manager';

export interface Env {
  DB: D1Database;
}

/**
 * Verify eval exists and belongs to workspace
 */
async function verifyEvalWorkspaceAccess(
  db: D1Database,
  evalId: string,
  workspaceId: string | null
): Promise<boolean> {
  if (!workspaceId) {
    return false;
  }

  const result = await db
    .prepare(
      'SELECT e.id FROM evals e INNER JOIN agents a ON e.agent_id = a.id WHERE e.id = ? AND a.workspace_id = ?'
    )
    .bind(evalId, workspaceId)
    .first();

  return !!result;
}

/**
 * GET /api/evals/:id/metrics
 *
 * Get current performance metrics for an eval.
 * Query params: window (days, default 7)
 */
export async function getEvalMetrics(
  request: Request,
  env: Env,
  evalId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request) || 'workspace_default';
    validateWorkspaceAccess(workspaceId);

    const url = new URL(request.url);
    const windowDays = parseInt(url.searchParams.get('window') || '7', 10);

    // Verify eval exists and belongs to workspace
    const hasAccess = await verifyEvalWorkspaceAccess(env.DB, evalId, workspaceId);
    if (!hasAccess) {
      return createErrorResponse('NOT_FOUND', 'Eval not found', 404);
    }

    const monitor = new PerformanceMonitor(env.DB);
    const metrics = await monitor.calculateMetrics(evalId, windowDays);

    return createSuccessResponse({
      eval_id: evalId,
      window_days: windowDays,
      metrics: {
        execution_count: metrics.execution_count,
        pass_count: metrics.pass_count,
        fail_count: metrics.fail_count,
        error_count: metrics.error_count,
        contradiction_count: metrics.contradiction_count,
        accuracy: metrics.accuracy,
        contradiction_rate: metrics.contradiction_rate,
        error_rate: metrics.error_rate
      }
    });
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/evals/:id/performance-trend
 *
 * Get historical performance snapshots.
 * Query params: days (default 30)
 */
export async function getPerformanceTrend(
  request: Request,
  env: Env,
  evalId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request) || 'workspace_default';
    validateWorkspaceAccess(workspaceId);

    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30', 10);

    // Verify eval exists and belongs to workspace
    const hasAccess = await verifyEvalWorkspaceAccess(env.DB, evalId, workspaceId);
    if (!hasAccess) {
      return createErrorResponse('NOT_FOUND', 'Eval not found', 404);
    }

    const monitor = new PerformanceMonitor(env.DB);
    const snapshots = await monitor.getPerformanceTrend(evalId, days);

    return createSuccessResponse({
      eval_id: evalId,
      days,
      snapshots: snapshots.map(s => ({
        date: s.snapshot_date,
        accuracy: s.accuracy,
        execution_count: s.execution_count,
        contradiction_count: s.contradiction_count,
        error_count: s.error_count,
        pass_count: s.pass_count,
        fail_count: s.fail_count
      }))
    });
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/evals/:id/alerts
 *
 * Get performance alerts for an eval.
 * Query params: status (unresolved, all)
 */
export async function getEvalAlerts(
  request: Request,
  env: Env,
  evalId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request) || 'workspace_default';
    validateWorkspaceAccess(workspaceId);

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'unresolved';

    // Verify eval exists and belongs to workspace
    const hasAccess = await verifyEvalWorkspaceAccess(env.DB, evalId, workspaceId);
    if (!hasAccess) {
      return createErrorResponse('NOT_FOUND', 'Eval not found', 404);
    }

    let query = `SELECT * FROM performance_alerts WHERE eval_id = ?`;
    if (status === 'unresolved') {
      query += ' AND resolved_at IS NULL';
    }
    query += ' ORDER BY triggered_at DESC';

    const result = await env.DB.prepare(query).bind(evalId).all();

    return createSuccessResponse({
      eval_id: evalId,
      status,
      alerts: result.results.map(a => ({
        id: a.id,
        alert_type: a.alert_type,
        severity: a.severity,
        current_value: a.current_value,
        threshold_value: a.threshold_value,
        message: a.message,
        prompt_id: a.prompt_id,
        triggered_at: a.triggered_at,
        acknowledged_at: a.acknowledged_at,
        resolved_at: a.resolved_at,
        auto_action_taken: a.auto_action_taken
      }))
    });
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/evals/:id/alerts/:alertId/acknowledge
 *
 * Acknowledge an alert.
 */
export async function acknowledgeAlert(
  request: Request,
  env: Env,
  evalId: string,
  alertId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request) || 'workspace_default';
    validateWorkspaceAccess(workspaceId);

    const monitor = new PerformanceMonitor(env.DB);
    await monitor.acknowledgeAlert(alertId, workspaceId);

    return createSuccessResponse({ acknowledged: true });
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * POST /api/evals/:id/alerts/:alertId/resolve
 *
 * Resolve an alert.
 */
export async function resolveAlert(
  request: Request,
  env: Env,
  evalId: string,
  alertId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request) || 'workspace_default';
    validateWorkspaceAccess(workspaceId);

    const monitor = new PerformanceMonitor(env.DB);
    await monitor.resolveAlert(alertId, workspaceId);

    return createSuccessResponse({ resolved: true });
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * PATCH /api/evals/:id/settings
 *
 * Update eval monitoring settings.
 * Body: { auto_execute_enabled?, auto_refine_enabled?, monitoring_thresholds? }
 */
export async function updateEvalSettings(
  request: Request,
  env: Env,
  evalId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request) || 'workspace_default';
    validateWorkspaceAccess(workspaceId);

    // Verify eval exists and belongs to workspace
    const hasAccess = await verifyEvalWorkspaceAccess(env.DB, evalId, workspaceId);
    if (!hasAccess) {
      return createErrorResponse('NOT_FOUND', 'Eval not found', 404);
    }

    const body = await parseJsonBody<{
      auto_execute_enabled?: boolean;
      auto_refine_enabled?: boolean;
      monitoring_thresholds?: Partial<typeof DEFAULT_THRESHOLDS>;
    }>(request);

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];

    if (body.auto_execute_enabled !== undefined) {
      updates.push('auto_execute_enabled = ?');
      params.push(body.auto_execute_enabled ? 1 : 0);
    }

    if (body.auto_refine_enabled !== undefined) {
      updates.push('auto_refine_enabled = ?');
      params.push(body.auto_refine_enabled ? 1 : 0);
    }

    if (body.monitoring_thresholds) {
      // Merge with defaults
      const thresholds = {
        ...DEFAULT_THRESHOLDS,
        ...body.monitoring_thresholds
      };
      updates.push('monitoring_thresholds = ?');
      params.push(JSON.stringify(thresholds));
    }

    if (updates.length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'No settings to update', 400);
    }

    params.push(evalId);

    await env.DB.prepare(
      `UPDATE evals SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    // Return updated settings
    const updated = await env.DB.prepare(
      `SELECT auto_execute_enabled, auto_refine_enabled, monitoring_thresholds
       FROM evals WHERE id = ?`
    ).bind(evalId).first();

    return createSuccessResponse({
      eval_id: evalId,
      settings: {
        auto_execute_enabled: Boolean(updated?.auto_execute_enabled),
        auto_refine_enabled: Boolean(updated?.auto_refine_enabled),
        monitoring_thresholds: updated?.monitoring_thresholds
          ? JSON.parse(updated.monitoring_thresholds as string)
          : DEFAULT_THRESHOLDS
      }
    });
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/evals/:id/prompt-coverage
 *
 * Get eval performance broken down by prompt version.
 */
export async function getPromptCoverage(
  request: Request,
  env: Env,
  evalId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request) || 'workspace_default';
    validateWorkspaceAccess(workspaceId);

    // Verify eval exists and belongs to workspace
    const hasAccess = await verifyEvalWorkspaceAccess(env.DB, evalId, workspaceId);
    if (!hasAccess) {
      return createErrorResponse('NOT_FOUND', 'Eval not found', 404);
    }

    const promptManager = new PromptManager(env.DB);
    const coverage = await promptManager.getPromptCoverage(evalId);

    // Check for drift
    const driftResult = await promptManager.detectPromptDrift(evalId);

    return createSuccessResponse({
      eval_id: evalId,
      prompt_coverage: coverage.map(c => ({
        prompt_id: c.prompt_id,
        execution_count: c.execution_count,
        pass_count: c.pass_count,
        fail_count: c.fail_count,
        error_count: c.error_count,
        accuracy: c.accuracy,
        first_execution_at: c.first_execution_at,
        last_execution_at: c.last_execution_at
      })),
      drift_analysis: {
        has_drift: driftResult.hasDrift,
        baseline_accuracy: driftResult.baseline_accuracy,
        drifted_prompts: driftResult.drifted_prompts
      }
    });
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/evals/:id/refinement-history
 *
 * Get auto-refinement audit log for an eval.
 */
export async function getRefinementHistory(
  request: Request,
  env: Env,
  evalId: string
): Promise<Response> {
  try {
    const workspaceId = getWorkspaceId(request) || 'workspace_default';
    validateWorkspaceAccess(workspaceId);

    // Verify eval exists and belongs to workspace
    const hasAccess = await verifyEvalWorkspaceAccess(env.DB, evalId, workspaceId);
    if (!hasAccess) {
      return createErrorResponse('NOT_FOUND', 'Eval not found', 404);
    }

    const result = await env.DB.prepare(
      `SELECT
         rh.*,
         pa.alert_type as trigger_alert_type,
         pa.message as trigger_alert_message
       FROM refinement_history rh
       LEFT JOIN performance_alerts pa ON rh.trigger_alert_id = pa.id
       WHERE rh.eval_id = ?
       ORDER BY rh.created_at DESC`
    ).bind(evalId).all();

    return createSuccessResponse({
      eval_id: evalId,
      refinements: result.results.map(r => ({
        id: r.id,
        parent_version: r.parent_version,
        new_version: r.new_version,
        trigger_type: r.trigger_type,
        trigger_alert_type: r.trigger_alert_type,
        trigger_alert_message: r.trigger_alert_message,
        trigger_metrics: r.trigger_metrics ? JSON.parse(r.trigger_metrics as string) : null,
        result_accuracy: r.result_accuracy,
        improvement_delta: r.improvement_delta,
        status: r.status,
        created_at: r.created_at,
        completed_at: r.completed_at,
        deployed_at: r.deployed_at
      }))
    });
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
