/**
 * Performance Monitor
 *
 * Calculates eval metrics, checks thresholds, generates alerts,
 * and triggers auto-refinement when configured.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { PromptManager } from '../prompts/manager';

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

  constructor(private db: D1Database) {
    this.promptManager = new PromptManager(db);
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
    let query = `
      SELECT id, auto_execute_enabled, auto_refine_enabled, monitoring_thresholds
      FROM evals
      WHERE 1=1
    `;
    const params: any[] = [];

    if (evalIds && evalIds.length > 0) {
      query += ` AND id IN (${evalIds.map(() => '?').join(',')})`;
      params.push(...evalIds);
    }

    const evalsResult = await this.db.prepare(query).bind(...params).all();

    for (const evalRecord of evalsResult.results) {
      const evalId = evalRecord.id as string;
      const autoRefineEnabled = Boolean(evalRecord.auto_refine_enabled);
      const thresholds = this.parseThresholds(evalRecord.monitoring_thresholds as string);

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
    const execResult = await this.db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN result = 1 THEN 1 ELSE 0 END) as passes,
           SUM(CASE WHEN result = 0 THEN 1 ELSE 0 END) as fails,
           SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as errors
         FROM eval_executions
         WHERE eval_id = ?
         AND created_at >= ?`
      )
      .bind(evalId, startDateStr)
      .first();

    // Get contradiction count from eval_comparison view
    const contradictionResult = await this.db
      .prepare(
        `SELECT COUNT(*) as count
         FROM eval_comparison
         WHERE eval_id = ?
         AND is_contradiction = 1
         AND execution_created_at >= ?`
      )
      .bind(evalId, startDateStr)
      .first();

    const executionCount = (execResult?.total as number) || 0;
    const passCount = (execResult?.passes as number) || 0;
    const failCount = (execResult?.fails as number) || 0;
    const errorCount = (execResult?.errors as number) || 0;
    const contradictionCount = (contradictionResult?.count as number) || 0;

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
    const existing = await this.db
      .prepare(
        `SELECT id FROM performance_alerts
         WHERE eval_id = ? AND alert_type = ? AND resolved_at IS NULL`
      )
      .bind(alert.eval_id, alert.alert_type)
      .first();

    if (existing) {
      // Update existing alert with new values
      await this.db
        .prepare(
          `UPDATE performance_alerts
           SET current_value = ?, message = ?, severity = ?
           WHERE id = ?`
        )
        .bind(alert.current_value, alert.message, alert.severity, existing.id)
        .run();
    } else {
      // Insert new alert
      await this.db
        .prepare(
          `INSERT INTO performance_alerts
           (id, eval_id, alert_type, severity, current_value, threshold_value, message, prompt_id, triggered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          alert.id,
          alert.eval_id,
          alert.alert_type,
          alert.severity,
          alert.current_value,
          alert.threshold_value,
          alert.message,
          alert.prompt_id || null,
          new Date().toISOString()
        )
        .run();
    }
  }

  /**
   * Create daily performance snapshot
   */
  private async createDailySnapshot(evalId: string, metrics: EvalMetrics): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // Use INSERT OR REPLACE for upsert behavior
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO performance_snapshots
         (id, eval_id, snapshot_date, accuracy, execution_count, contradiction_count, error_count, pass_count, fail_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `${evalId}_${today}`,
        evalId,
        today,
        metrics.accuracy,
        metrics.execution_count,
        metrics.contradiction_count,
        metrics.error_count,
        metrics.pass_count,
        metrics.fail_count,
        new Date().toISOString()
      )
      .run();
  }

  /**
   * Check if auto-refine is allowed (cooldown check)
   */
  private async checkAutoRefineCooldown(evalId: string): Promise<boolean> {
    const cooldown = await this.db
      .prepare(
        `SELECT next_allowed_at FROM auto_refine_cooldowns WHERE eval_id = ?`
      )
      .bind(evalId)
      .first();

    if (!cooldown) {
      return true; // No cooldown record, allowed
    }

    const nextAllowed = new Date(cooldown.next_allowed_at as string);
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
    const existing = await this.db
      .prepare(`SELECT consecutive_failures FROM auto_refine_cooldowns WHERE eval_id = ?`)
      .bind(evalId)
      .first();

    const consecutiveFailures = success
      ? 0
      : ((existing?.consecutive_failures as number) || 0) + 1;

    // Apply exponential backoff for failures
    const backoffMultiplier = Math.min(Math.pow(2, consecutiveFailures), 16);
    const adjustedNextAllowed = new Date(
      now.getTime() + cooldownHours * 60 * 60 * 1000 * backoffMultiplier
    );

    await this.db
      .prepare(
        `INSERT OR REPLACE INTO auto_refine_cooldowns
         (id, eval_id, last_attempt_at, next_allowed_at, consecutive_failures, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        evalId,
        evalId,
        now.toISOString(),
        adjustedNextAllowed.toISOString(),
        consecutiveFailures,
        now.toISOString()
      )
      .run();
  }

  /**
   * Get active alerts for an eval
   */
  async getActiveAlerts(evalId: string): Promise<any[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM performance_alerts
         WHERE eval_id = ? AND resolved_at IS NULL
         ORDER BY triggered_at DESC`
      )
      .bind(evalId)
      .all();

    return result.results;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, resolvedBy?: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE performance_alerts
         SET resolved_at = ?, resolved_by = ?
         WHERE id = ?`
      )
      .bind(new Date().toISOString(), resolvedBy || null, alertId)
      .run();
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy?: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE performance_alerts
         SET acknowledged_at = ?, acknowledged_by = ?
         WHERE id = ?`
      )
      .bind(new Date().toISOString(), acknowledgedBy || null, alertId)
      .run();
  }

  /**
   * Get performance trend (historical snapshots)
   */
  async getPerformanceTrend(evalId: string, days: number = 30): Promise<any[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM performance_snapshots
         WHERE eval_id = ?
         AND snapshot_date >= date('now', '-' || ? || ' days')
         ORDER BY snapshot_date ASC`
      )
      .bind(evalId, days)
      .all();

    return result.results;
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
