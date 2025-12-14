/**
 * Eval Monitoring API Endpoints
 *
 * Provides endpoints for eval performance metrics, alerts, and settings.
 */

/// <reference types="@cloudflare/workers-types" />

import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { createDb, type Database } from '../db/client';
import { evals, agents, performanceAlerts, refinementHistory } from '../db/schema';
import {
  createErrorResponse,
  createSuccessResponse,
  getWorkspaceId,
  validateWorkspaceAccess,
  parseJsonBody,
} from './utils';
import { PerformanceMonitor, DEFAULT_THRESHOLDS } from '../monitoring/performance-monitor';

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

  const drizzle = createDb(db);
  const result = await drizzle
    .select({ id: evals.id })
    .from(evals)
    .innerJoin(agents, eq(evals.agentId, agents.id))
    .where(and(eq(evals.id, evalId), eq(agents.workspaceId, workspaceId)))
    .get();

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

    const drizzle = createDb(env.DB);
    const conditions = [eq(performanceAlerts.evalId, evalId)];
    if (status === 'unresolved') {
      conditions.push(isNull(performanceAlerts.resolvedAt));
    }

    const result = await drizzle
      .select()
      .from(performanceAlerts)
      .where(and(...conditions))
      .orderBy(desc(performanceAlerts.triggeredAt))
      .all();

    return createSuccessResponse({
      eval_id: evalId,
      status,
      alerts: result.map(a => ({
        id: a.id,
        alert_type: a.alertType,
        severity: a.severity,
        current_value: a.currentValue,
        threshold_value: a.thresholdValue,
        message: a.message,
        prompt_id: a.promptId,
        triggered_at: a.triggeredAt,
        acknowledged_at: a.acknowledgedAt,
        resolved_at: a.resolvedAt,
        auto_action_taken: a.autoActionTaken
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

    // Build update object
    const updateData: Record<string, any> = {};

    if (body.auto_execute_enabled !== undefined) {
      updateData.autoExecuteEnabled = body.auto_execute_enabled;
    }

    if (body.auto_refine_enabled !== undefined) {
      updateData.autoRefineEnabled = body.auto_refine_enabled;
    }

    if (body.monitoring_thresholds) {
      // Merge with defaults
      const thresholds = {
        ...DEFAULT_THRESHOLDS,
        ...body.monitoring_thresholds
      };
      updateData.monitoringThresholds = thresholds;
    }

    if (Object.keys(updateData).length === 0) {
      return createErrorResponse('VALIDATION_ERROR', 'No settings to update', 400);
    }

    const drizzle = createDb(env.DB);
    await drizzle
      .update(evals)
      .set(updateData)
      .where(eq(evals.id, evalId));

    // Return updated settings
    const updated = await drizzle
      .select({
        autoExecuteEnabled: evals.autoExecuteEnabled,
        autoRefineEnabled: evals.autoRefineEnabled,
        monitoringThresholds: evals.monitoringThresholds
      })
      .from(evals)
      .where(eq(evals.id, evalId))
      .get();

    return createSuccessResponse({
      eval_id: evalId,
      settings: {
        auto_execute_enabled: Boolean(updated?.autoExecuteEnabled),
        auto_refine_enabled: Boolean(updated?.autoRefineEnabled),
        monitoring_thresholds: updated?.monitoringThresholds || DEFAULT_THRESHOLDS
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

    const drizzle = createDb(env.DB);
    const result = await drizzle
      .select({
        id: refinementHistory.id,
        parentVersion: refinementHistory.parentVersion,
        newVersion: refinementHistory.newVersion,
        triggerType: refinementHistory.triggerType,
        triggerMetrics: refinementHistory.triggerMetrics,
        resultAccuracy: refinementHistory.resultAccuracy,
        improvementDelta: refinementHistory.improvementDelta,
        status: refinementHistory.status,
        createdAt: refinementHistory.createdAt,
        completedAt: refinementHistory.completedAt,
        deployedAt: refinementHistory.deployedAt,
        triggerAlertType: performanceAlerts.alertType,
        triggerAlertMessage: performanceAlerts.message
      })
      .from(refinementHistory)
      .leftJoin(performanceAlerts, eq(refinementHistory.triggerAlertId, performanceAlerts.id))
      .where(eq(refinementHistory.evalId, evalId))
      .orderBy(desc(refinementHistory.createdAt))
      .all();

    return createSuccessResponse({
      eval_id: evalId,
      refinements: result.map(r => ({
        id: r.id,
        parent_version: r.parentVersion,
        new_version: r.newVersion,
        trigger_type: r.triggerType,
        trigger_alert_type: r.triggerAlertType,
        trigger_alert_message: r.triggerAlertMessage,
        trigger_metrics: r.triggerMetrics || null,
        result_accuracy: r.resultAccuracy,
        improvement_delta: r.improvementDelta,
        status: r.status,
        created_at: r.createdAt,
        completed_at: r.completedAt,
        deployed_at: r.deployedAt
      }))
    });
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message || 'Internal server error', 500);
  }
}
