/**
 * CandidateTester - Tests eval candidates against labeled traces
 * Calculates agreement metrics to determine which candidate best matches human judgment
 */

import { EvalCandidate, LabeledTrace } from './auto-eval-generator';
import { EvalRunner } from './eval-runner';

/**
 * Test result for a single candidate against all labeled traces
 */
export interface TestResult {
  candidate_id: string;
  agreement_rate: number;  // Pearson correlation with human scores
  accuracy: number;        // Binary accuracy at 0.5 threshold
  cohen_kappa: number;     // Agreement accounting for chance
  precision: number;
  recall: number;
  f1_score: number;
  confusion_matrix: {
    true_positive: number;
    true_negative: number;
    false_positive: number;
    false_negative: number;
  };
  per_trace_results: Array<{
    trace_id: string;
    eval_score: number;
    human_score: number;
    feedback: string;
    error?: string;
  }>;
  execution_stats: {
    total_cost_usd: number;
    avg_duration_ms: number;
    failures: number;
  };
}

/**
 * Result of testing and ranking multiple candidates
 */
export interface RankingResult {
  results: TestResult[];
  ranking: Array<{ candidate_id: string; rank: number; primary_score: number }>;
  winner: TestResult | null;
}

/**
 * CandidateTester - Tests and ranks eval candidates
 *
 * Key responsibilities:
 * 1. Execute each candidate against all labeled traces
 * 2. Calculate statistical agreement metrics (Pearson, accuracy, kappa, etc.)
 * 3. Rank candidates by agreement with human scores
 * 4. Select winner based on accuracy and kappa thresholds
 *
 * Winner criteria:
 * - accuracy >= 0.70
 * - cohen_kappa >= 0.40
 */
export class CandidateTester {
  constructor(private evalRunner: EvalRunner) {}

  /**
   * Test a candidate against all labeled traces
   *
   * Executes the candidate eval function on each labeled trace and calculates
   * agreement metrics comparing eval scores to human scores.
   *
   * @param candidate - The eval candidate to test
   * @param labeledTraces - Traces with human scores for comparison
   * @returns TestResult with metrics and per-trace details
   */
  async testCandidate(
    candidate: EvalCandidate,
    labeledTraces: LabeledTrace[]
  ): Promise<TestResult> {
    const perTraceResults: TestResult['per_trace_results'] = [];
    let totalCost = 0;
    let totalDuration = 0;
    let failures = 0;

    console.log(`[CandidateTester] Testing ${candidate.id} against ${labeledTraces.length} traces...`);

    // Evaluate each trace
    for (const labeled of labeledTraces) {
      try {
        const result = await this.evalRunner.runEval(
          candidate.code,
          labeled.task,
          {}, // task_metadata - empty for testing
          labeled.trace
        );

        perTraceResults.push({
          trace_id: labeled.trace_id,
          eval_score: result.score,
          human_score: labeled.human_score,
          feedback: result.feedback
        });

        totalCost += result.execution.llm_cost_usd;
        totalDuration += result.execution.duration_ms;
      } catch (error: any) {
        failures++;
        perTraceResults.push({
          trace_id: labeled.trace_id,
          eval_score: 0,
          human_score: labeled.human_score,
          feedback: '',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.error(`[CandidateTester] Error evaluating trace ${labeled.trace_id}:`, error.message);
      }
    }

    // Calculate metrics
    const evalScores = perTraceResults.map(r => r.eval_score);
    const humanScores = perTraceResults.map(r => r.human_score);

    const agreementRate = this.pearsonCorrelation(evalScores, humanScores);
    const confusionMatrix = this.calculateConfusionMatrix(evalScores, humanScores, 0.5);
    const { accuracy, precision, recall, f1 } = this.calculateClassificationMetrics(confusionMatrix);
    const cohenKappa = this.calculateCohenKappa(confusionMatrix, evalScores.length);

    console.log(`[CandidateTester] ${candidate.id} results:`, {
      agreement_rate: agreementRate.toFixed(3),
      accuracy: (accuracy * 100).toFixed(1) + '%',
      cohen_kappa: cohenKappa.toFixed(3),
      f1_score: (f1 * 100).toFixed(1) + '%'
    });

    return {
      candidate_id: candidate.id,
      agreement_rate: agreementRate,
      accuracy,
      cohen_kappa: cohenKappa,
      precision,
      recall,
      f1_score: f1,
      confusion_matrix: confusionMatrix,
      per_trace_results: perTraceResults,
      execution_stats: {
        total_cost_usd: totalCost,
        avg_duration_ms: labeledTraces.length > 0 ? totalDuration / labeledTraces.length : 0,
        failures
      }
    };
  }

  /**
   * Test multiple candidates and rank them by agreement with human scores
   *
   * Ranks candidates by agreement_rate (Pearson correlation), then by cohen_kappa.
   * Selects winner if any candidate meets thresholds.
   *
   * @param candidates - All candidates to test
   * @param labeledTraces - Traces with human scores
   * @returns RankingResult with all results, ranking, and winner
   */
  async testAndRankCandidates(
    candidates: EvalCandidate[],
    labeledTraces: LabeledTrace[]
  ): Promise<RankingResult> {
    console.log(`[CandidateTester] Testing ${candidates.length} candidates...`);

    const results: TestResult[] = [];

    // Test each candidate
    for (const candidate of candidates) {
      const result = await this.testCandidate(candidate, labeledTraces);
      results.push(result);
    }

    // Rank by agreement_rate, then by cohen_kappa
    const ranking = results
      .map(r => ({
        candidate_id: r.candidate_id,
        primary_score: r.agreement_rate,
        secondary_score: r.cohen_kappa
      }))
      .sort((a, b) => {
        // Primary sort: agreement_rate (descending)
        if (Math.abs(a.primary_score - b.primary_score) > 0.01) {
          return b.primary_score - a.primary_score;
        }
        // Secondary sort: cohen_kappa (descending)
        return b.secondary_score - a.secondary_score;
      })
      .map((r, i) => ({
        candidate_id: r.candidate_id,
        rank: i + 1,
        primary_score: r.primary_score
      }));

    // Winner is top-ranked if it meets thresholds
    const topResult = results.find(r => r.candidate_id === ranking[0]?.candidate_id);
    const winner = topResult && topResult.accuracy >= 0.70 && topResult.cohen_kappa >= 0.40
      ? topResult
      : null;

    if (winner) {
      console.log(`[CandidateTester] Winner: ${winner.candidate_id}`);
    } else {
      console.log(`[CandidateTester] No candidate meets thresholds (accuracy >= 0.70, kappa >= 0.40)`);
    }

    return { results, ranking, winner };
  }

  /**
   * Calculate Pearson correlation coefficient between two arrays
   *
   * Measures linear correlation between eval scores and human scores.
   * Returns value between -1 and 1:
   * - 1 = perfect positive correlation
   * - 0 = no correlation
   * - -1 = perfect negative correlation
   *
   * Formula: r = (n*Σxy - Σx*Σy) / sqrt((n*Σx² - (Σx)²) * (n*Σy² - (Σy)²))
   *
   * @param x - First array (eval scores)
   * @param y - Second array (human scores)
   * @returns Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;
    if (n !== y.length) {
      throw new Error(`Array lengths must match: x=${n}, y=${y.length}`);
    }

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
    const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    // Handle edge case where all values are the same
    if (denominator === 0) return 0;

    return numerator / denominator;
  }

  /**
   * Calculate confusion matrix by binarizing scores at threshold
   *
   * Converts continuous scores (0-1) to binary (positive/negative) using threshold,
   * then calculates true positives, true negatives, false positives, false negatives.
   *
   * @param evalScores - Scores from eval function
   * @param humanScores - Scores from human judgment
   * @param threshold - Threshold for binarization (default: 0.5)
   * @returns Confusion matrix
   */
  private calculateConfusionMatrix(
    evalScores: number[],
    humanScores: number[],
    threshold: number
  ): TestResult['confusion_matrix'] {
    let tp = 0, tn = 0, fp = 0, fn = 0;

    for (let i = 0; i < evalScores.length; i++) {
      const evalPositive = evalScores[i] >= threshold;
      const humanPositive = humanScores[i] >= threshold;

      if (evalPositive && humanPositive) {
        tp++;
      } else if (!evalPositive && !humanPositive) {
        tn++;
      } else if (evalPositive && !humanPositive) {
        fp++;
      } else {
        fn++;
      }
    }

    return {
      true_positive: tp,
      true_negative: tn,
      false_positive: fp,
      false_negative: fn
    };
  }

  /**
   * Calculate classification metrics from confusion matrix
   *
   * Calculates:
   * - Accuracy: (TP + TN) / (TP + TN + FP + FN)
   * - Precision: TP / (TP + FP)
   * - Recall: TP / (TP + FN)
   * - F1 Score: 2 * (Precision * Recall) / (Precision + Recall)
   *
   * @param cm - Confusion matrix
   * @returns Classification metrics
   */
  private calculateClassificationMetrics(cm: TestResult['confusion_matrix']): {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
  } {
    const total = cm.true_positive + cm.true_negative + cm.false_positive + cm.false_negative;

    // Accuracy: overall correctness
    const accuracy = total > 0 ? (cm.true_positive + cm.true_negative) / total : 0;

    // Precision: of predicted positives, how many are correct?
    const precision = (cm.true_positive + cm.false_positive) > 0
      ? cm.true_positive / (cm.true_positive + cm.false_positive)
      : 0;

    // Recall: of actual positives, how many did we catch?
    const recall = (cm.true_positive + cm.false_negative) > 0
      ? cm.true_positive / (cm.true_positive + cm.false_negative)
      : 0;

    // F1: harmonic mean of precision and recall
    const f1 = (precision + recall) > 0
      ? 2 * (precision * recall) / (precision + recall)
      : 0;

    return { accuracy, precision, recall, f1 };
  }

  /**
   * Calculate Cohen's Kappa statistic
   *
   * Measures inter-rater agreement accounting for chance agreement.
   * Kappa = (Po - Pe) / (1 - Pe) where:
   * - Po = observed agreement (accuracy)
   * - Pe = expected agreement by chance
   *
   * Interpretation:
   * - < 0.00: No agreement (worse than chance)
   * - 0.00-0.20: Slight agreement
   * - 0.21-0.40: Fair agreement
   * - 0.41-0.60: Moderate agreement
   * - 0.61-0.80: Substantial agreement
   * - 0.81-1.00: Almost perfect agreement
   *
   * @param cm - Confusion matrix
   * @param n - Total number of observations
   * @returns Cohen's Kappa coefficient
   */
  private calculateCohenKappa(cm: TestResult['confusion_matrix'], n: number): number {
    if (n === 0) return 0;

    // Observed agreement
    const po = (cm.true_positive + cm.true_negative) / n;

    // Expected agreement by chance
    const evalPositive = cm.true_positive + cm.false_positive;
    const evalNegative = cm.true_negative + cm.false_negative;
    const humanPositive = cm.true_positive + cm.false_negative;
    const humanNegative = cm.true_negative + cm.false_positive;

    const pe = (evalPositive * humanPositive + evalNegative * humanNegative) / (n * n);

    // Handle edge case where pe = 1 (perfect chance agreement)
    if (pe === 1) return 1;

    return (po - pe) / (1 - pe);
  }
}
