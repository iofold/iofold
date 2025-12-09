/**
 * CrossValidator - Performs k-fold cross-validation to prevent overfitting
 * Ensures eval candidates are stable across different data splits
 */

import { EvalCandidate, LabeledTrace } from './auto-eval-generator';
import { CandidateTester, TestResult } from './candidate-tester';

/**
 * Result of k-fold cross-validation for a single candidate
 */
export interface CrossValidationResult {
  candidate_id: string;

  /** Mean metrics across all folds */
  mean_accuracy: number;
  mean_kappa: number;
  mean_f1: number;
  mean_agreement_rate: number;

  /** Standard deviation for stability assessment */
  std_accuracy: number;
  std_kappa: number;

  /** Individual fold results */
  fold_results: TestResult[];

  /** Is the candidate stable? (low variance) */
  is_stable: boolean;  // true if std_accuracy < 0.1 && std_kappa < 0.15
}

/**
 * Result of selecting best stable candidate
 */
export interface SelectBestResult {
  results: CrossValidationResult[];
  winner: CrossValidationResult | null;
}

/**
 * CrossValidator - Performs k-fold cross-validation on eval candidates
 *
 * Purpose: Prevent overfitting by testing candidates on multiple data splits
 *
 * Process:
 * 1. Shuffle traces randomly
 * 2. Split into k folds
 * 3. Test candidate on each fold independently
 * 4. Calculate mean and standard deviation for all metrics
 * 5. Mark as stable if std_accuracy < 0.1 && std_kappa < 0.15
 *
 * Stability criteria:
 * - Low variance in accuracy (std < 0.1)
 * - Low variance in kappa (std < 0.15)
 * - Indicates candidate generalizes well to unseen data
 */
export class CrossValidator {
  constructor(private candidateTester: CandidateTester) {}

  /**
   * Run k-fold cross-validation on a single candidate
   *
   * @param candidate - Eval candidate to validate
   * @param labeledTraces - All labeled traces
   * @param k - Number of folds (default: 5)
   * @returns Cross-validation result with mean metrics and stability assessment
   */
  async crossValidate(
    candidate: EvalCandidate,
    labeledTraces: LabeledTrace[],
    k: number = 5
  ): Promise<CrossValidationResult> {
    console.log(`[CrossValidator] Running ${k}-fold CV on ${candidate.id}...`);

    // Step 1: Shuffle traces randomly
    const shuffled = this.shuffle([...labeledTraces]);

    // Step 2: Split into k folds
    const folds = this.splitIntoFolds(shuffled, k);
    console.log(`[CrossValidator] Split ${labeledTraces.length} traces into ${folds.length} folds`);

    // Step 3: Test on each fold
    const foldResults: TestResult[] = [];
    for (let i = 0; i < folds.length; i++) {
      console.log(`[CrossValidator] Testing fold ${i + 1}/${folds.length} (${folds[i].length} traces)...`);
      const result = await this.candidateTester.testCandidate(candidate, folds[i]);
      foldResults.push(result);
    }

    // Step 4: Calculate statistics
    const accuracies = foldResults.map(r => r.accuracy);
    const kappas = foldResults.map(r => r.cohen_kappa);
    const f1s = foldResults.map(r => r.f1_score);
    const agreements = foldResults.map(r => r.agreement_rate);

    const meanAccuracy = this.mean(accuracies);
    const meanKappa = this.mean(kappas);
    const meanF1 = this.mean(f1s);
    const meanAgreement = this.mean(agreements);

    const stdAccuracy = this.std(accuracies);
    const stdKappa = this.std(kappas);

    // Step 5: Assess stability
    const isStable = stdAccuracy < 0.1 && stdKappa < 0.15;

    console.log(`[CrossValidator] ${candidate.id} CV results:`, {
      mean_accuracy: (meanAccuracy * 100).toFixed(1) + '%',
      mean_kappa: meanKappa.toFixed(3),
      std_accuracy: stdAccuracy.toFixed(3),
      std_kappa: stdKappa.toFixed(3),
      is_stable: isStable
    });

    return {
      candidate_id: candidate.id,
      mean_accuracy: meanAccuracy,
      mean_kappa: meanKappa,
      mean_f1: meanF1,
      mean_agreement_rate: meanAgreement,
      std_accuracy: stdAccuracy,
      std_kappa: stdKappa,
      fold_results: foldResults,
      is_stable: isStable
    };
  }

  /**
   * Cross-validate multiple candidates and select the best stable one
   *
   * Selection criteria:
   * 1. Run CV on all candidates
   * 2. Filter to stable candidates (std_accuracy < 0.1 && std_kappa < 0.15)
   * 3. Sort by mean_accuracy * mean_kappa (composite score)
   * 4. Return winner with highest composite score
   *
   * Fallback: If no stable candidates, return most stable (lowest variance)
   *
   * @param candidates - All candidates to evaluate
   * @param labeledTraces - All labeled traces
   * @param k - Number of folds (default: 5)
   * @returns Selection result with all CV results and winner
   */
  async selectBestStable(
    candidates: EvalCandidate[],
    labeledTraces: LabeledTrace[],
    k: number = 5
  ): Promise<SelectBestResult> {
    console.log(`[CrossValidator] Selecting best stable candidate from ${candidates.length} candidates...`);

    const results: CrossValidationResult[] = [];

    // Step 1: Run CV on all candidates
    for (const candidate of candidates) {
      const cvResult = await this.crossValidate(candidate, labeledTraces, k);
      results.push(cvResult);
    }

    // Step 2: Filter to stable candidates
    const stableCandidates = results.filter(r => r.is_stable);

    if (stableCandidates.length === 0) {
      console.warn('[CrossValidator] No stable candidates found. Selecting most stable...');

      // Fallback: Sort by total variance (std_accuracy + std_kappa)
      const sorted = [...results].sort((a, b) => {
        const varianceA = a.std_accuracy + a.std_kappa;
        const varianceB = b.std_accuracy + b.std_kappa;
        return varianceA - varianceB;  // Lower variance is better
      });

      const winner = sorted.length > 0 ? sorted[0] : null;
      if (winner) {
        console.log(`[CrossValidator] Most stable (fallback): ${winner.candidate_id}`);
      }

      return { results, winner };
    }

    // Step 3: Sort stable candidates by composite score (mean_accuracy * mean_kappa)
    const sorted = [...stableCandidates].sort((a, b) => {
      const scoreA = a.mean_accuracy * a.mean_kappa;
      const scoreB = b.mean_accuracy * b.mean_kappa;
      return scoreB - scoreA;  // Higher score is better
    });

    // Step 4: Return winner
    const winner = sorted[0];
    console.log(`[CrossValidator] Winner: ${winner.candidate_id} (stable, composite: ${(winner.mean_accuracy * winner.mean_kappa).toFixed(3)})`);

    return { results, winner };
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   *
   * @param array - Array to shuffle
   * @returns Shuffled array (mutates in place)
   */
  private shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Split array into k approximately equal folds
   *
   * @param array - Array to split
   * @param k - Number of folds
   * @returns Array of k folds
   */
  private splitIntoFolds<T>(array: T[], k: number): T[][] {
    const foldSize = Math.ceil(array.length / k);
    const folds: T[][] = [];

    for (let i = 0; i < k; i++) {
      const start = i * foldSize;
      const end = Math.min(start + foldSize, array.length);
      const fold = array.slice(start, end);

      // Only add non-empty folds
      if (fold.length > 0) {
        folds.push(fold);
      }
    }

    return folds;
  }

  /**
   * Calculate mean of an array
   *
   * @param values - Array of numbers
   * @returns Mean value (0 if empty)
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, v) => acc + v, 0);
    return sum / values.length;
  }

  /**
   * Calculate standard deviation of an array
   *
   * Uses population standard deviation formula:
   * σ = sqrt(Σ(x - μ)² / n)
   *
   * @param values - Array of numbers
   * @returns Standard deviation (0 if empty)
   */
  private std(values: number[]): number {
    if (values.length === 0) return 0;

    const m = this.mean(values);
    const squaredDiffs = values.map(v => (v - m) ** 2);
    const variance = this.mean(squaredDiffs);

    return Math.sqrt(variance);
  }
}
