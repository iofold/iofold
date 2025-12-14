/**
 * Performance Monitor
 *
 * Calculates eval metrics, checks thresholds, generates alerts,
 * and triggers auto-refinement when configured.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { PromptManager } from '../prompts/manager';
import { createDb, type Database } from '../db/client';
import { eq, and, sql, isNull, gte, desc, inArray } from 'drizzle-orm';
import {
  evals,
  evalExecutions,
  evalComparison,
  performanceAlerts,
  performanceSnapshots,
  autoRefineCooldowns
} from '../db/schema';

/**
 * Default monitoring thresholds
 */
export const DEFAULT_THRESHOLDS: MonitoringThresholds = {
  min_accuracy: 0.80,
  max_contradiction_rate: 0.15,
  max_error_rate: 0.10,
  min_executions_for_alert: 20
};

/**
 * Monitoring threshold configuration
 */
export interface MonitoringThresholds {
  min_accuracy: number;
  max_contradiction_rate: number;
  max_error_rate: number;
  min_executions_for_alert: number;
}

/**
 * Eval metrics calculated from executions
 */
export interface EvalMetrics {
  eval_id: string;
  window_days: number;
  execution_count: number;
  pass_count: number;
  fail_count: number;
  error_count: number;
  contradiction_count: number;
  accuracy: number | null;
  contradiction_rate: number | null;
  error_rate: number | null;
}

/**
 * Performance alert
 */
export interface PerformanceAlert {
  id: string;
  eval_id: string;
  alert_type: 'accuracy_drop' | 'contradiction_spike' | 'error_spike' | 'prompt_drift' | 'insufficient_data';
  severity: 'info' | 'warning' | 'critical';
  current_value: number;
  threshold_value: number;
  message: string;
  prompt_id?: string;
}

/**
 * Monitoring result for a single eval
 */
export interface MonitoringResult {
  eval_id: string;
  metrics: EvalMetrics;
  alerts: PerformanceAlert[];
  drift_detected: boolean;
  auto_refine_triggered: boolean;
}

/**
 * PerformanceMonitor handles eval performance tracking and alerting
 */
export class PerformanceMonitor {
  private promptManager: PromptManager;
  private drizzle: Database;

  constructor(private db: D1Database) {
    this.promptManager = new PromptManager(db);
    this.drizzle = createDb(db);
  }

  /**
   * Run monitoring for all evals or specific eval IDs
   * Returns monitoring results and any alerts generated
   */
  async runMonitoring(
    evalIds?: string[],
    windowDays: number = 7
  ): Promise<MonitoringResult[]> {
    const results: MonitoringResult[] = [];

    // Get evals to monitor
    let evalsResult;
    if (evalIds && evalIds.length > 0) {
      evalsResult = await this.drizzle
        .select({
          id: evals.id,
          autoExecuteEnabled: evals.autoExecuteEnabled,
          autoRefineEnabled: evals.autoRefineEnabled,
          monitoringThresholds: evals.monitoringThresholds
        })
        .from(evals)
        .where(inArray(evals.id, evalIds));
    } else {
      evalsResult = await this.drizzle
        .select({
          id: evals.id,
          autoExecuteEnabled: evals.autoExecuteEnabled,
          autoRefineEnabled: evals.autoRefineEnabled,
          monitoringThresholds: evals.monitoringThresholds
        })
        .from(evals);
    }

    for (const evalRecord of evalsResult) {
      const evalId = evalRecord.id;
      const autoRefineEnabled = Boolean(evalRecord.autoRefineEnabled);
      const thresholds = this.parseThresholds(
        evalRecord.monitoringThresholds ? JSON.stringify(evalRecord.monitoringThresholds) : null
      );

      // Calculate metrics
      const metrics = await this.calculateMetrics(evalId, windowDays);

      // Check thresholds and generate alerts
      const alerts = await this.checkThresholds(evalId, metrics, thresholds);

      // Check for prompt drift
      const driftResult = await this.promptManager.detectPromptDrift(
        evalId,
        thresholds.min_executions_for_alert
      );

      // Add drift alerts
      if (driftResult.hasDrift) {
        for (const driftedPrompt of driftResult.drifted_prompts) {
          const alert: PerformanceAlert = {
            id: crypto.randomUUID(),
            eval_id: evalId,
            alert_type: 'prompt_drift',
            severity: Math.abs(driftedPrompt.drift) > 0.20 ? 'critical' : 'warning',
            current_value: driftedPrompt.accuracy,
            threshold_value: driftResult.baseline_accuracy!,
            message: `Prompt drift detected for agent '${driftedPrompt.agent_name}': accuracy ${(driftedPrompt.accuracy * 100).toFixed(1)}% vs baseline ${(driftResult.baseline_accuracy! * 100).toFixed(1)}%`,
            prompt_id: driftedPrompt.prompt_id
          };
          alerts.push(alert);
        }
      }

      // Persist alerts
      for (const alert of alerts) {
        await this.persistAlert(alert);
      }

      // Create daily snapshot
      await this.createDailySnapshot(evalId, metrics);

      // Determine if auto-refine should be triggered
      let autoRefineTriggered = false;
      if (autoRefineEnabled && alerts.some(a => a.severity === 'critical' || a.severity === 'warning')) {
        const canAutoRefine = await this.checkAutoRefineCooldown(evalId);
        if (canAutoRefine) {
          // Note: Actual auto-refine job enqueue happens in the consumer
          // Here we just mark that it should be triggered
          autoRefineTriggered = true;
        }
      }

      results.push({
        eval_id: evalId,
        metrics,
        alerts,
        drift_detected: driftResult.hasDrift,
        auto_refine_triggered: autoRefineTriggered
      });
    }

    return results;
  }

  /**
   * Calculate metrics for an eval over a time window
   */
  async calculateMetrics(evalId: string, windowDays: number): Promise<EvalMetrics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - windowDays);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Get execution stats from eval_executions
    const execResult = await this.drizzle
      .select({
        total: sql<number>`COUNT(*)`,
        passes: sql<number>`SUM(CASE WHEN ${evalExecutions.predictedResult} = 1 THEN 1 ELSE 0 END)`,
        fails: sql<number>`SUM(CASE WHEN ${evalExecutions.predictedResult} = 0 THEN 1 ELSE 0 END)`,
        errors: sql<number>`SUM(CASE WHEN ${evalExecutions.error} IS NOT NULL THEN 1 ELSE 0 END)`
      })
      .from(evalExecutions)
      .where(and(
        eq(evalExecutions.evalId, evalId),
        gte(evalExecutions.executedAt, startDateStr)
      ))
      .limit(1);

    // Get contradiction count from eval_comparison view (Drizzle type-safe)
    const contradictionResult = await this.drizzle
      .select({
        count: sql<number>`COUNT(*)`
      })
      .from(evalComparison)
      .where(and(
        eq(evalComparison.evalId, evalId),
        eq(evalComparison.isContradiction, 1),
        gte(evalComparison.executedAt, startDateStr)
      ));

    const executionCount = execResult[0]?.total || 0;
    const passCount = execResult[0]?.passes || 0;
    const failCount = execResult[0]?.fails || 0;
    const errorCount = execResult[0]?.errors || 0;
    const contradictionCount = contradictionResult[0]?.count || 0;

    return {
      eval_id: evalId,
      window_days: windowDays,
      execution_count: executionCount,
      pass_count: passCount,
      fail_count: failCount,
      error_count: errorCount,
      contradiction_count: contradictionCount,
      accuracy: executionCount > 0 ? passCount / executionCount : null,
      contradiction_rate: executionCount > 0 ? contradictionCount / executionCount : null,
      error_rate: executionCount > 0 ? errorCount / executionCount : null
    };
  }

  /**
   * Check metrics against thresholds and generate alerts
   */
  private async checkThresholds(
    evalId: string,
    metrics: EvalMetrics,
    thresholds: MonitoringThresholds
  ): Promise<PerformanceAlert[]> {
    const alerts: PerformanceAlert[] = [];

    // Check if we have enough data
    if (metrics.execution_count < thresholds.min_executions_for_alert) {
      alerts.push({
        id: crypto.randomUUID(),
        eval_id: evalId,
        alert_type: 'insufficient_data',
        severity: 'info',
        current_value: metrics.execution_count,
        threshold_value: thresholds.min_executions_for_alert,
        message: `Insufficient executions (${metrics.execution_count}/${thresholds.min_executions_for_alert}) for reliable metrics`
      });
      return alerts; // Don't generate other alerts without enough data
    }

    // Check accuracy
    if (metrics.accuracy !== null && metrics.accuracy < thresholds.min_accuracy) {
      const severity = metrics.accuracy < thresholds.min_accuracy - 0.10 ? 'critical' : 'warning';
      alerts.push({
        id: crypto.randomUUID(),
        eval_id: evalId,
        alert_type: 'accuracy_drop',
        severity,
        current_value: metrics.accuracy,
        threshold_value: thresholds.min_accuracy,
        message: `Accuracy dropped to ${(metrics.accuracy * 100).toFixed(1)}% (threshold: ${(thresholds.min_accuracy * 100).toFixed(1)}%)`
      });
    }

    // Check contradiction rate
    if (metrics.contradiction_rate !== null && metrics.contradiction_rate > thresholds.max_contradiction_rate) {
      const severity = metrics.contradiction_rate > thresholds.max_contradiction_rate + 0.10 ? 'critical' : 'warning';
      alerts.push({
        id: crypto.randomUUID(),
        eval_id: evalId,
        alert_type: 'contradiction_spike',
        severity,
        current_value: metrics.contradiction_rate,
        threshold_value: thresholds.max_contradiction_rate,
        message: `Contradiction rate at ${(metrics.contradiction_rate * 100).toFixed(1)}% (threshold: ${(thresholds.max_contradiction_rate * 100).toFixed(1)}%)`
      });
    }

    // Check error rate
    if (metrics.error_rate !== null && metrics.error_rate > thresholds.max_error_rate) {
      const severity = metrics.error_rate > thresholds.max_error_rate + 0.10 ? 'critical' : 'warning';
      alerts.push({
        id: crypto.randomUUID(),
        eval_id: evalId,
        alert_type: 'error_spike',
        severity,
        current_value: metrics.error_rate,
        threshold_value: thresholds.max_error_rate,
        message: `Error rate at ${(metrics.error_rate * 100).toFixed(1)}% (threshold: ${(thresholds.max_error_rate * 100).toFixed(1)}%)`
      });
    }

    return alerts;
  }

  /**
   * Persist an alert to the database
   */
  private async persistAlert(alert: PerformanceAlert): Promise<void> {
    // Check if similar alert already exists (unresolved)
    const existingResult = await this.drizzle
      .select({ id: performanceAlerts.id })
      .from(performanceAlerts)
      .where(and(
        eq(performanceAlerts.evalId, alert.eval_id),
        eq(performanceAlerts.alertType, alert.alert_type),
        isNull(performanceAlerts.resolvedAt)
      ))
      .limit(1);

    if (existingResult.length > 0) {
      // Update existing alert with new values
      await this.drizzle
        .update(performanceAlerts)
        .set({
          currentValue: alert.current_value,
          message: alert.message,
          severity: alert.severity
        })
        .where(eq(performanceAlerts.id, existingResult[0].id));
    } else {
      // Insert new alert
      await this.drizzle
        .insert(performanceAlerts)
        .values({
          id: alert.id,
          evalId: alert.eval_id,
          alertType: alert.alert_type,
          severity: alert.severity,
          currentValue: alert.current_value,
          thresholdValue: alert.threshold_value,
          message: alert.message,
          promptId: alert.prompt_id || null,
          triggeredAt: new Date().toISOString()
        });
    }
  }

  /**
   * Create daily performance snapshot
   */
  private async createDailySnapshot(evalId: string, metrics: EvalMetrics): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // Use INSERT OR REPLACE for upsert behavior
    await this.drizzle
      .insert(performanceSnapshots)
      .values({
        id: `${evalId}_${today}`,
        evalId: evalId,
        snapshotDate: today,
        accuracy: metrics.accuracy,
        executionCount: metrics.execution_count,
        contradictionCount: metrics.contradiction_count,
        errorCount: metrics.error_count,
        passCount: metrics.pass_count,
        failCount: metrics.fail_count,
        createdAt: new Date().toISOString()
      })
      .onConflictDoUpdate({
        target: performanceSnapshots.id,
        set: {
          accuracy: metrics.accuracy,
          executionCount: metrics.execution_count,
          contradictionCount: metrics.contradiction_count,
          errorCount: metrics.error_count,
          passCount: metrics.pass_count,
          failCount: metrics.fail_count
        }
      });
  }

  /**
   * Check if auto-refine is allowed (cooldown check)
   */
  private async checkAutoRefineCooldown(evalId: string): Promise<boolean> {
    const cooldownResult = await this.drizzle
      .select({ nextAllowedAt: autoRefineCooldowns.nextAllowedAt })
      .from(autoRefineCooldowns)
      .where(eq(autoRefineCooldowns.evalId, evalId))
      .limit(1);

    if (cooldownResult.length === 0) {
      return true; // No cooldown record, allowed
    }

    const nextAllowed = new Date(cooldownResult[0].nextAllowedAt);
    return new Date() >= nextAllowed;
  }

  /**
   * Update auto-refine cooldown after an attempt
   */
  async updateAutoRefineCooldown(evalId: string, success: boolean): Promise<void> {
    const now = new Date();
    const cooldownHours = success ? 24 : 48; // Longer cooldown on failure
    const nextAllowed = new Date(now.getTime() + cooldownHours * 60 * 60 * 1000);

    // Get existing cooldown for consecutive_failures tracking
    const existingResult = await this.drizzle
      .select({ consecutiveFailures: autoRefineCooldowns.consecutiveFailures })
      .from(autoRefineCooldowns)
      .where(eq(autoRefineCooldowns.evalId, evalId))
      .limit(1);

    const consecutiveFailures = success
      ? 0
      : ((existingResult[0]?.consecutiveFailures) || 0) + 1;

    // Apply exponential backoff for failures
    const backoffMultiplier = Math.min(Math.pow(2, consecutiveFailures), 16);
    const adjustedNextAllowed = new Date(
      now.getTime() + cooldownHours * 60 * 60 * 1000 * backoffMultiplier
    );

    await this.drizzle
      .insert(autoRefineCooldowns)
      .values({
        id: evalId,
        evalId: evalId,
        lastAttemptAt: now.toISOString(),
        nextAllowedAt: adjustedNextAllowed.toISOString(),
        consecutiveFailures: consecutiveFailures,
        updatedAt: now.toISOString()
      })
      .onConflictDoUpdate({
        target: autoRefineCooldowns.id,
        set: {
          lastAttemptAt: now.toISOString(),
          nextAllowedAt: adjustedNextAllowed.toISOString(),
          consecutiveFailures: consecutiveFailures,
          updatedAt: now.toISOString()
        }
      });
  }

  /**
   * Get active alerts for an eval
   */
  async getActiveAlerts(evalId: string): Promise<any[]> {
    const result = await this.drizzle
      .select()
      .from(performanceAlerts)
      .where(and(
        eq(performanceAlerts.evalId, evalId),
        isNull(performanceAlerts.resolvedAt)
      ))
      .orderBy(desc(performanceAlerts.triggeredAt));

    return result;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, resolvedBy?: string): Promise<void> {
    await this.drizzle
      .update(performanceAlerts)
      .set({
        resolvedAt: new Date().toISOString(),
        resolvedBy: resolvedBy || null
      })
      .where(eq(performanceAlerts.id, alertId));
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy?: string): Promise<void> {
    await this.drizzle
      .update(performanceAlerts)
      .set({
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: acknowledgedBy || null
      })
      .where(eq(performanceAlerts.id, alertId));
  }

  /**
   * Get performance trend (historical snapshots)
   */
  async getPerformanceTrend(evalId: string, days: number = 30): Promise<any[]> {
    const result = await this.drizzle
      .select()
      .from(performanceSnapshots)
      .where(and(
        eq(performanceSnapshots.evalId, evalId),
        sql`${performanceSnapshots.snapshotDate} >= date('now', '-' || ${days} || ' days')`
      ))
      .orderBy(performanceSnapshots.snapshotDate);

    return result;
  }

  /**
   * Parse monitoring thresholds from JSON string
   */
  private parseThresholds(thresholdsJson: string | null): MonitoringThresholds {
    if (!thresholdsJson) {
      return DEFAULT_THRESHOLDS;
    }

    try {
      const parsed = JSON.parse(thresholdsJson);
      return {
        min_accuracy: parsed.min_accuracy ?? DEFAULT_THRESHOLDS.min_accuracy,
        max_contradiction_rate: parsed.max_contradiction_rate ?? DEFAULT_THRESHOLDS.max_contradiction_rate,
        max_error_rate: parsed.max_error_rate ?? DEFAULT_THRESHOLDS.max_error_rate,
        min_executions_for_alert: parsed.min_executions_for_alert ?? DEFAULT_THRESHOLDS.min_executions_for_alert
      };
    } catch {
      return DEFAULT_THRESHOLDS;
    }
  }
}
