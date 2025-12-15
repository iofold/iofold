/**
 * WinnerSelector - Selects the best eval candidate based on human agreement metrics
 * Applies thresholds and composite scoring to choose the winner
 */

import { TestResult } from './candidate-tester';
import { EvalCandidate } from './auto-eval-generator';
import { D1Database } from '@cloudflare/workers-types';
import { createDb, type Database } from '../../db/client';
import { eq, and, sql } from 'drizzle-orm';
import { evals, agents } from '../../db/schema';

/**
 * Criteria for selecting a winning eval candidate
 */
export interface SelectionCriteria {
  /** Minimum accuracy required (default: 0.80) */
  min_accuracy: number;

  /** Minimum Cohen's Kappa (default: 0.60) */
  min_kappa: number;

  /** Minimum F1 score (default: 0.70) */
  min_f1: number;

  /** Maximum acceptable cost per trace (default: $0.02) */
  max_cost_per_trace: number;
}

/**
 * Result of winner selection process
 */
export interface SelectionResult {
  winner: EvalCandidate | null;
  winner_metrics: TestResult | null;
  all_candidates: Array<{
    candidate: EvalCandidate;
    metrics: TestResult;
    passes_threshold: boolean;
    rejection_reasons: string[];
  }>;
  recommendation: string;
}

/**
 * WinnerSelector - Selects the best eval candidate based on human agreement metrics
 *
 * Selection process:
 * 1. Check each candidate against thresholds (accuracy, kappa, f1, cost)
 * 2. Collect rejection reasons for those that fail
 * 3. Sort passing candidates by composite score (weighted)
 * 4. Return winner if any pass, null otherwise
 * 5. Generate actionable recommendations
 *
 * Composite score formula:
 * 0.3 * accuracy + 0.3 * kappa + 0.2 * f1 + 0.2 * agreement_rate
 *
 * Default thresholds:
 * - min_accuracy: 0.80 (80%)
 * - min_kappa: 0.60 (substantial agreement)
 * - min_f1: 0.70 (70%)
 * - max_cost_per_trace: $0.02
 */
export class WinnerSelector {
  private drizzle: Database;

  constructor(private db: D1Database) {
    this.drizzle = createDb(db);
  }

  /**
   * Select the best candidate that meets thresholds
   *
   * Evaluates all candidates against selection criteria and ranks those that pass.
   * Returns the highest-scoring candidate if any meet thresholds, null otherwise.
   *
   * @param candidates - All eval candidates to consider
   * @param testResults - Test results for each candidate
   * @param criteria - Selection thresholds (uses defaults if not specified)
   * @returns SelectionResult with winner, metrics, and recommendations
   */
  selectWinner(
    candidates: EvalCandidate[],
    testResults: TestResult[],
    criteria: Partial<SelectionCriteria> = {}
  ): SelectionResult {
    // Apply default thresholds
    const {
      min_accuracy = 0.80,
      min_kappa = 0.60,
      min_f1 = 0.70,
      max_cost_per_trace = 0.02
    } = criteria;

    console.log('[WinnerSelector] Selection criteria:', {
      min_accuracy,
      min_kappa,
      min_f1,
      max_cost_per_trace
    });

    const allCandidates: SelectionResult['all_candidates'] = [];

    // Evaluate each candidate against thresholds
    for (const candidate of candidates) {
      const metrics = testResults.find(r => r.candidate_id === candidate.id);
      if (!metrics) {
        console.warn(`[WinnerSelector] No test results found for candidate ${candidate.id}`);
        continue;
      }

      const rejectionReasons: string[] = [];

      // Check accuracy threshold
      if (metrics.accuracy < min_accuracy) {
        rejectionReasons.push(
          `Accuracy ${(metrics.accuracy * 100).toFixed(1)}% < ${(min_accuracy * 100).toFixed(1)}%`
        );
      }

      // Check kappa threshold
      if (metrics.cohen_kappa < min_kappa) {
        rejectionReasons.push(
          `Kappa ${metrics.cohen_kappa.toFixed(2)} < ${min_kappa.toFixed(2)}`
        );
      }

      // Check F1 threshold
      if (metrics.f1_score < min_f1) {
        rejectionReasons.push(
          `F1 ${(metrics.f1_score * 100).toFixed(1)}% < ${(min_f1 * 100).toFixed(1)}%`
        );
      }

      // Check cost threshold
      const avgCost = metrics.per_trace_results.length > 0
        ? metrics.execution_stats.total_cost_usd / metrics.per_trace_results.length
        : 0;

      if (avgCost > max_cost_per_trace) {
        rejectionReasons.push(
          `Avg cost $${avgCost.toFixed(4)} > $${max_cost_per_trace.toFixed(4)}`
        );
      }

      const passesThreshold = rejectionReasons.length === 0;

      allCandidates.push({
        candidate,
        metrics,
        passes_threshold: passesThreshold,
        rejection_reasons: rejectionReasons
      });

      console.log(`[WinnerSelector] ${candidate.id} (${candidate.variation}):`, {
        passes: passesThreshold,
        accuracy: (metrics.accuracy * 100).toFixed(1) + '%',
        kappa: metrics.cohen_kappa.toFixed(2),
        f1: (metrics.f1_score * 100).toFixed(1) + '%',
        cost: '$' + avgCost.toFixed(4),
        rejection_reasons: rejectionReasons
      });
    }

    // Sort passing candidates by composite score (weighted sum)
    const passingCandidates = allCandidates
      .filter(c => c.passes_threshold)
      .sort((a, b) => {
        const scoreA = this.compositeScore(a.metrics);
        const scoreB = this.compositeScore(b.metrics);
        return scoreB - scoreA;
      });

    console.log(`[WinnerSelector] ${passingCandidates.length}/${allCandidates.length} candidates passed thresholds`);

    // No winner if no candidates pass
    if (passingCandidates.length === 0) {
      const recommendation = this.generateRecommendation(allCandidates);
      return {
        winner: null,
        winner_metrics: null,
        all_candidates: allCandidates,
        recommendation
      };
    }

    // Winner is the highest-scoring passing candidate
    const best = passingCandidates[0];
    const compositeScore = this.compositeScore(best.metrics);

    const recommendation = [
      `Selected ${best.candidate.variation} variant with:`,
      `- Accuracy: ${(best.metrics.accuracy * 100).toFixed(1)}%`,
      `- Cohen's Kappa: ${best.metrics.cohen_kappa.toFixed(2)}`,
      `- F1 Score: ${(best.metrics.f1_score * 100).toFixed(1)}%`,
      `- Agreement Rate: ${(best.metrics.agreement_rate * 100).toFixed(1)}%`,
      `- Composite Score: ${compositeScore.toFixed(3)}`
    ].join('\n');

    console.log(`[WinnerSelector] Winner: ${best.candidate.id}`);
    console.log(recommendation);

    return {
      winner: best.candidate,
      winner_metrics: best.metrics,
      all_candidates: allCandidates,
      recommendation
    };
  }

  /**
   * Activate winning eval for an agent
   *
   * Performs the following actions:
   * 1. Insert candidate into eval_candidates with status='active'
   * 2. Archive previous active eval for this agent
   * 3. Update agents.active_eval_id
   *
   * @param agentId - The agent to activate the eval for
   * @param candidate - The winning eval candidate
   * @param metrics - Test metrics for the candidate
   * @returns The eval_id of the activated eval
   */
  async activateEval(
    agentId: string,
    candidate: EvalCandidate,
    metrics: TestResult
  ): Promise<string> {
    const evalId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[WinnerSelector] Activating eval ${evalId} for agent ${agentId}`);

    try {
      // 1. Get next version number for this agent
      const maxVersionResult = await this.drizzle
        .select({ maxVersion: sql<number>`MAX(${evals.version})` })
        .from(evals)
        .where(eq(evals.agentId, agentId));
      const nextVersion = (maxVersionResult[0]?.maxVersion || 0) + 1;

      // 2. Insert into evals as active
      await this.drizzle
        .insert(evals)
        .values({
          id: evalId,
          agentId,
          version: nextVersion,
          name: `${candidate.variation} eval v${nextVersion}`,
          code: candidate.code,
          variation: candidate.variation,
          agreementRate: metrics.agreement_rate,
          accuracy: metrics.accuracy,
          cohenKappa: metrics.cohen_kappa,
          f1Score: metrics.f1_score,
          confusionMatrix: metrics.confusion_matrix,
          status: 'active',
          createdAt: new Date().toISOString(),
          activatedAt: new Date().toISOString()
        });

      console.log(`[WinnerSelector] Inserted eval ${evalId}`);

      // 3. Archive previous active eval for this agent
      const archiveResult = await this.drizzle
        .update(evals)
        .set({ status: 'archived' })
        .where(and(
          eq(evals.agentId, agentId),
          eq(evals.status, 'active'),
          sql`${evals.id} != ${evalId}`
        ));

      console.log(`[WinnerSelector] Archived previous active evals`);

      // 4. Update agent's active_eval_id
      await this.drizzle
        .update(agents)
        .set({ activeEvalId: evalId })
        .where(eq(agents.id, agentId));

      console.log(`[WinnerSelector] Updated agent ${agentId} active_eval_id to ${evalId}`);

      return evalId;
    } catch (error: any) {
      console.error(`[WinnerSelector] Failed to activate eval:`, error);
      throw new Error(`Failed to activate eval: ${error.message}`);
    }
  }

  /**
   * Calculate composite score for ranking candidates
   *
   * Weighted combination of metrics:
   * - 0.3 * accuracy (binary correctness)
   * - 0.3 * cohen_kappa (agreement accounting for chance)
   * - 0.2 * f1_score (balance of precision and recall)
   * - 0.2 * agreement_rate (correlation with human scores)
   *
   * @param metrics - Test metrics for a candidate
   * @returns Composite score between 0 and 1
   */
  private compositeScore(metrics: TestResult): number {
    return (
      0.3 * metrics.accuracy +
      0.3 * metrics.cohen_kappa +
      0.2 * metrics.f1_score +
      0.2 * metrics.agreement_rate
    );
  }

  /**
   * Generate recommendation when no candidate passes thresholds
   *
   * Provides actionable guidance:
   * - If no candidates generated: need more labeled traces
   * - If candidates exist but none pass: identify closest and suggest improvements
   *
   * @param allCandidates - All candidates with their results
   * @returns Recommendation string
   */
  private generateRecommendation(
    allCandidates: SelectionResult['all_candidates']
  ): string {
    // No candidates at all
    if (allCandidates.length === 0) {
      return 'No candidates generated. Ensure you have at least 10 labeled traces with a good distribution of scores.';
    }

    // Find closest to passing (fewest rejection reasons)
    const closest = allCandidates.reduce((best, curr) => {
      const bestGap = best.rejection_reasons.length;
      const currGap = curr.rejection_reasons.length;
      return currGap < bestGap ? curr : best;
    });

    // Build recommendation based on closest candidate
    const gaps = closest.rejection_reasons.join(', ');
    const suggestions: string[] = [
      `No candidate meets thresholds. Closest: ${closest.candidate.variation} variant.`,
      `Issues: ${gaps}`
    ];

    // Specific suggestions based on failure types
    const accuracyIssue = closest.rejection_reasons.some(r => r.includes('Accuracy'));
    const kappaIssue = closest.rejection_reasons.some(r => r.includes('Kappa'));
    const f1Issue = closest.rejection_reasons.some(r => r.includes('F1'));
    const costIssue = closest.rejection_reasons.some(r => r.includes('cost'));

    if (accuracyIssue || kappaIssue || f1Issue) {
      suggestions.push('Suggestions:');
      suggestions.push('- Add more labeled traces to improve pattern detection');
      suggestions.push('- Ensure traces have clear quality differences (high vs low scores)');
      suggestions.push('- Verify trace structure is consistent and complete');
    }

    if (costIssue) {
      suggestions.push('- Consider using a cheaper model (anthropic/claude-haiku-4-5)');
      suggestions.push('- Reduce LLM calls in eval function (use more heuristics)');
    }

    // Alternative: lower thresholds
    suggestions.push('Alternatively, you can lower the selection thresholds if these results are acceptable.');

    return suggestions.join('\n');
  }
}
