# Missing Features: Gap Analysis vs OpenAI Self-Evolving Agents

Analysis of what iofold is missing compared to the OpenAI self-evolving agents pattern, with implementation priorities.

## Executive Summary

**What We Have:**
- ✅ Human feedback collection (swipe interface)
- ✅ Eval generation from feedback
- ✅ Contradiction detection
- ✅ User-triggered refinement
- ✅ Version control & rollback
- ✅ Test results & accuracy tracking

**What We're Missing:**
- ❌ Automatic retraining triggers
- ❌ Multi-dimensional grading (beyond human feedback)
- ❌ Iterative refinement loops
- ❌ Continuous monitoring on new data
- ❌ Pattern analysis & feedback consolidation
- ❌ Best version auto-selection
- ❌ Performance trend tracking
- ❌ A/B testing between versions

---

## Missing Features (Detailed)

### 1. **Automatic Retraining Triggers** 🚨 HIGH PRIORITY

**What OpenAI Has:**
```python
# Automatic trigger when performance degrades
if avg_score < 0.85 or passing_graders < 0.75:
    trigger_retraining()

# Continuous monitoring
monitor = PerformanceMonitor()
monitor.check_hourly()  # Check new data every hour
```

**What iofold Has:**
```typescript
// User manually clicks "Refine Based on Contradictions"
// No automatic detection or triggering
```

**What's Missing:**
- Automatic detection of performance degradation
- Threshold-based triggering
- Scheduled monitoring jobs
- Alert system when thresholds crossed

**Implementation Plan:**

#### Phase 1: Monitoring System
```typescript
// New module: /src/monitoring/performance-monitor.ts

interface PerformanceThresholds {
  min_accuracy: number          // e.g., 0.85 (85%)
  max_contradictions: number    // e.g., 5 contradictions
  max_error_rate: number        // e.g., 0.1 (10%)
  monitoring_interval: string   // e.g., "1h", "1d"
}

class PerformanceMonitor {
  async checkEval(evalId: string): Promise<PerformanceAlert | null> {
    // 1. Get recent executions (last 24h)
    const executions = await this.getRecentExecutions(evalId)

    // 2. Calculate metrics
    const metrics = {
      accuracy: this.calculateAccuracy(executions),
      contradiction_count: this.countContradictions(executions),
      error_rate: this.calculateErrorRate(executions)
    }

    // 3. Check thresholds
    const thresholds = await this.getThresholds(evalId)

    if (metrics.accuracy < thresholds.min_accuracy) {
      return {
        type: 'low_accuracy',
        eval_id: evalId,
        current_value: metrics.accuracy,
        threshold: thresholds.min_accuracy,
        recommended_action: 'refine'
      }
    }

    if (metrics.contradiction_count > thresholds.max_contradictions) {
      return {
        type: 'high_contradictions',
        eval_id: evalId,
        current_value: metrics.contradiction_count,
        threshold: thresholds.max_contradictions,
        recommended_action: 'refine'
      }
    }

    return null  // All good
  }

  async triggerAutoRefine(evalId: string, alert: PerformanceAlert) {
    // Only if user has opted in to auto-refinement
    const settings = await this.getEvalSettings(evalId)

    if (!settings.auto_refine_enabled) {
      // Just alert user
      await this.sendAlert(alert)
      return
    }

    // Automatically trigger refinement job
    const job = await this.jobManager.createJob({
      type: 'generate',
      eval_set_id: eval.eval_set_id,
      parent_eval_id: evalId,
      reason: `Auto-refinement triggered: ${alert.type}`,
      include_contradiction_cases: true
    })

    return job
  }
}
```

#### Phase 2: Scheduled Monitoring
```typescript
// Cloudflare Workers Cron Job
// wrangler.toml:
// [triggers]
// crons = ["0 */6 * * *"]  # Every 6 hours

export default {
  async scheduled(event, env, ctx) {
    const monitor = new PerformanceMonitor(env.DB)

    // Get all active evals
    const activeEvals = await env.DB.prepare(`
      SELECT id, eval_set_id
      FROM evals
      WHERE status = 'active'
    `).all()

    // Check each eval
    for (const eval of activeEvals.results) {
      const alert = await monitor.checkEval(eval.id)

      if (alert) {
        // Option 1: Send notification to user
        await monitor.sendAlert(alert)

        // Option 2: Auto-trigger refinement (if enabled)
        await monitor.triggerAutoRefine(eval.id, alert)
      }
    }
  }
}
```

#### Phase 3: User Settings
```typescript
// New API endpoint: PATCH /api/evals/:id/settings
{
  "auto_refine_enabled": true,
  "thresholds": {
    "min_accuracy": 0.85,
    "max_contradictions": 5,
    "max_error_rate": 0.1
  },
  "monitoring_interval": "6h",
  "notification_channels": ["email", "webhook"]
}
```

**Database Schema Changes:**
```sql
ALTER TABLE evals ADD COLUMN auto_refine_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE evals ADD COLUMN performance_thresholds TEXT; -- JSON

CREATE TABLE performance_alerts (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  current_value REAL,
  threshold_value REAL,
  triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  action_taken TEXT,
  FOREIGN KEY (eval_id) REFERENCES evals(id)
);
```

**UI Changes:**
- Eval detail page: "Auto-Refinement" toggle
- Settings panel for thresholds
- Alert history section
- Email/webhook notification setup

---

### 2. **Multi-Dimensional Grading** 🔶 MEDIUM PRIORITY

**What OpenAI Has:**
```python
graders = [
    DomainFidelityChecker(),      # Aspect 1
    LengthValidator(),            # Aspect 2
    SemanticSimilarityAnalyzer(), # Aspect 3
    LLMJudge()                    # Aspect 4
]

# Evaluate on multiple dimensions
scores = {grader.name: grader.evaluate(output) for grader in graders}
pass_rate = sum(scores.values()) / len(scores)
```

**What iofold Has:**
```typescript
// Single dimension: Human feedback (positive/negative/neutral)
// Binary: Does eval prediction match human rating?
```

**What's Missing:**
- Multiple evaluation aspects (beyond binary match)
- Composite scoring (weighted average)
- Aspect-specific feedback
- Custom grader definitions

**Implementation Plan:**

#### Phase 1: Multi-Aspect Feedback
```typescript
// New feedback model
interface MultiFacetedFeedback {
  trace_id: string
  eval_set_id: string

  // Traditional overall rating
  overall_rating: 'positive' | 'negative' | 'neutral'

  // Aspect-specific ratings (optional)
  aspects?: {
    accuracy?: 1 | 2 | 3 | 4 | 5      // 1=bad, 5=excellent
    completeness?: 1 | 2 | 3 | 4 | 5
    tone?: 1 | 2 | 3 | 4 | 5
    efficiency?: 1 | 2 | 3 | 4 | 5
    safety?: 1 | 2 | 3 | 4 | 5
  }

  notes?: string
}

// API: POST /api/feedback with aspect ratings
{
  "trace_id": "trace_123",
  "eval_set_id": "set_456",
  "overall_rating": "positive",
  "aspects": {
    "accuracy": 5,
    "tone": 4,
    "efficiency": 3
  }
}
```

#### Phase 2: Custom Graders
```typescript
// /src/graders/base.ts
interface Grader {
  name: string
  description: string
  evaluate(trace: Trace, output: any): GraderResult
}

interface GraderResult {
  passed: boolean
  score: number  // 0-1
  reason: string
}

// /src/graders/length-grader.ts
class LengthGrader implements Grader {
  constructor(
    private minWords: number,
    private maxWords: number
  ) {}

  evaluate(trace: Trace, output: any): GraderResult {
    const assistant_msg = trace.steps[0]
      .messages_added
      .find(m => m.role === 'assistant')

    if (!assistant_msg) {
      return {
        passed: false,
        score: 0,
        reason: 'No assistant response'
      }
    }

    const word_count = assistant_msg.content.split(/\s+/).length

    if (word_count < this.minWords) {
      return {
        passed: false,
        score: Math.max(0, word_count / this.minWords),
        reason: `Too short: ${word_count} words (min: ${this.minWords})`
      }
    }

    if (word_count > this.maxWords) {
      return {
        passed: false,
        score: Math.max(0, this.maxWords / word_count),
        reason: `Too long: ${word_count} words (max: ${this.maxWords})`
      }
    }

    return {
      passed: true,
      score: 1.0,
      reason: `Length OK: ${word_count} words`
    }
  }
}

// /src/graders/keyword-grader.ts
class KeywordGrader implements Grader {
  constructor(
    private required: string[],
    private forbidden: string[]
  ) {}

  evaluate(trace: Trace, output: any): GraderResult {
    const content = output.toString().toLowerCase()

    // Check required keywords
    const missing = this.required.filter(kw => !content.includes(kw.toLowerCase()))
    if (missing.length > 0) {
      return {
        passed: false,
        score: (this.required.length - missing.length) / this.required.length,
        reason: `Missing keywords: ${missing.join(', ')}`
      }
    }

    // Check forbidden keywords
    const found = this.forbidden.filter(kw => content.includes(kw.toLowerCase()))
    if (found.length > 0) {
      return {
        passed: false,
        score: 0,
        reason: `Forbidden keywords found: ${found.join(', ')}`
      }
    }

    return {
      passed: true,
      score: 1.0,
      reason: 'All keywords correct'
    }
  }
}
```

#### Phase 3: Composite Scoring
```typescript
// /src/graders/composite-grader.ts
interface GraderConfig {
  grader: Grader
  weight: number  // 0-1, must sum to 1
}

class CompositeGrader {
  constructor(private graders: GraderConfig[]) {
    // Validate weights sum to 1
    const sum = graders.reduce((acc, g) => acc + g.weight, 0)
    if (Math.abs(sum - 1.0) > 0.01) {
      throw new Error('Grader weights must sum to 1')
    }
  }

  evaluate(trace: Trace, output: any): CompositeResult {
    const results = this.graders.map(config => ({
      name: config.grader.name,
      result: config.grader.evaluate(trace, output),
      weight: config.weight
    }))

    // Weighted average score
    const weighted_score = results.reduce(
      (acc, r) => acc + (r.result.score * r.weight),
      0
    )

    // Pass if weighted average >= threshold
    const passed = weighted_score >= 0.75

    // Pass rate (% of graders passing)
    const pass_count = results.filter(r => r.result.passed).length
    const pass_rate = pass_count / results.length

    return {
      passed,
      weighted_score,
      pass_rate,
      grader_results: results,
      summary: this.generateSummary(results, passed)
    }
  }

  generateSummary(results: any[], passed: boolean): string {
    if (passed) {
      return `All checks passed (score: ${weighted_score.toFixed(2)})`
    }

    const failures = results.filter(r => !r.result.passed)
    return `Failed: ${failures.map(f => f.name).join(', ')}`
  }
}
```

#### Phase 4: User-Defined Graders
```typescript
// API: POST /api/eval-sets/:id/graders
{
  "name": "Response Length Checker",
  "type": "length",
  "config": {
    "min_words": 20,
    "max_words": 200
  },
  "weight": 0.3
}

// API: POST /api/eval-sets/:id/graders
{
  "name": "Required Keywords",
  "type": "keyword",
  "config": {
    "required": ["policy", "coverage"],
    "forbidden": ["I don't know", "not sure"]
  },
  "weight": 0.2
}

// API: POST /api/eval-sets/:id/graders
{
  "name": "Human Feedback Match",
  "type": "human_feedback",
  "weight": 0.5  // Human feedback is 50% of score
}
```

**Database Schema:**
```sql
CREATE TABLE graders (
  id TEXT PRIMARY KEY,
  eval_set_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'length', 'keyword', 'regex', 'llm_judge', 'human_feedback'
  config TEXT NOT NULL,  -- JSON
  weight REAL DEFAULT 1.0,
  enabled BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_set_id) REFERENCES eval_sets(id)
);

ALTER TABLE eval_executions ADD COLUMN grader_results TEXT;  -- JSON
```

**UI Changes:**
- Eval set detail: "Graders" section
- Add grader button → Modal with grader types
- Weight sliders for each grader
- Matrix view shows per-grader scores

---

### 3. **Iterative Refinement Loops** 🔶 MEDIUM PRIORITY

**What OpenAI Has:**
```python
for iteration in range(max_retries):
    prompt = generate_prompt(feedback)
    output = model.generate(prompt)
    scores = evaluate(output, graders)

    if scores.pass_rate >= 0.75:
        break  # Good enough

    feedback = consolidate_failures(scores)

# Select best version from all iterations
best_prompt = select_highest_scoring(all_versions)
```

**What iofold Has:**
```typescript
// One-shot generation
// If not good enough, user manually triggers refinement again
```

**What's Missing:**
- Automatic iteration until threshold met
- Multiple candidate generation
- Best version selection
- Iteration limit

**Implementation Plan:**

#### Iterative Generation Job
```typescript
// /src/jobs/iterative-eval-generation-job.ts

interface IterativeGenerationConfig {
  eval_set_id: string
  max_iterations: number  // e.g., 5
  target_accuracy: number  // e.g., 0.90
  target_pass_rate: number  // e.g., 0.75 (for multi-grader)
}

class IterativeEvalGenerationJob {
  async execute(config: IterativeGenerationConfig) {
    const versions: EvalVersion[] = []
    let best_version: EvalVersion | null = null

    for (let i = 0; i < config.max_iterations; i++) {
      // 1. Generate eval (using failures from previous iteration)
      const feedback = i === 0
        ? null
        : this.consolidateFailures(versions[i-1])

      const eval_code = await this.generator.generate({
        eval_set_id: config.eval_set_id,
        iteration: i,
        previous_failures: feedback
      })

      // 2. Test eval on training data
      const test_results = await this.tester.test(
        eval_code,
        training_traces
      )

      // 3. Store version
      const version = {
        iteration: i,
        code: eval_code,
        accuracy: test_results.accuracy,
        test_results
      }
      versions.push(version)

      // 4. Check if target met
      if (test_results.accuracy >= config.target_accuracy) {
        best_version = version
        break
      }

      // 5. Update progress
      await this.updateProgress({
        current_iteration: i + 1,
        best_accuracy_so_far: Math.max(...versions.map(v => v.accuracy))
      })
    }

    // 6. Select best version (not necessarily last)
    if (!best_version) {
      best_version = versions.reduce((best, v) =>
        v.accuracy > best.accuracy ? v : best
      )
    }

    // 7. Store best version as final eval
    return await this.storeEval(best_version)
  }

  consolidateFailures(previous: EvalVersion): string {
    // Analyze which traces failed
    const failures = previous.test_results.details.filter(t => !t.match)

    // Generate feedback message
    return `
Previous version achieved ${previous.accuracy}% accuracy.

Failed cases (${failures.length}):
${failures.map(f => `
- Trace: ${f.trace_id}
  Expected: ${f.expected}
  Predicted: ${f.predicted}
  Reason: ${f.reason}
`).join('\n')}

Improve the eval to handle these cases correctly.
    `.trim()
  }
}
```

#### API Endpoint
```typescript
// POST /api/eval-sets/:id/generate-iterative
{
  "name": "Customer Satisfaction",
  "max_iterations": 5,
  "target_accuracy": 0.90,
  "custom_instructions": "..."
}

// Returns: job_id
// Job streams progress:
// - "Iteration 1/5: 85% accuracy"
// - "Iteration 2/5: 88% accuracy"
// - "Iteration 3/5: 92% accuracy ✓ Target reached"
// - "Best version: Iteration 3 (92%)"
```

---

### 4. **Continuous Monitoring on New Data** 🚨 HIGH PRIORITY

**What OpenAI Has:**
```python
# Continuous evaluation on production data
monitor.evaluate_new_data_hourly()

# Detect concept drift
if performance_on_new_data < performance_on_training_data - 0.1:
    alert("Concept drift detected")
    trigger_retraining()
```

**What iofold Has:**
```typescript
// Eval is tested once on training data
// No ongoing monitoring of performance on new traces
```

**What's Missing:**
- Automatic evaluation of new traces
- Concept drift detection
- Performance trend tracking
- Alerts when performance degrades

**Implementation Plan:**

#### Auto-Execution on New Traces
```typescript
// /src/monitoring/auto-executor.ts

class AutoExecutor {
  // Triggered when new traces imported
  async onTracesImported(trace_ids: string[]) {
    // Get all active evals
    const active_evals = await this.getActiveEvals()

    for (const eval of active_evals) {
      // Check if auto-execution enabled
      if (!eval.auto_execute_enabled) continue

      // Create execution job
      await this.jobManager.createJob({
        type: 'execute',
        eval_id: eval.id,
        trace_ids: trace_ids,
        reason: 'auto_execute_on_import'
      })
    }
  }

  // Detect concept drift
  async detectConceptDrift(eval_id: string): Promise<DriftAlert | null> {
    // Get training accuracy
    const eval = await this.getEval(eval_id)
    const training_accuracy = eval.accuracy

    // Get recent execution accuracy (last 7 days)
    const recent_executions = await this.getRecentExecutions(eval_id, '7d')
    const recent_accuracy = this.calculateAccuracy(recent_executions)

    // Drift = significant drop in accuracy
    const drift = training_accuracy - recent_accuracy

    if (drift > 0.1) {  // 10% drop
      return {
        type: 'concept_drift',
        eval_id,
        training_accuracy,
        recent_accuracy,
        drift_magnitude: drift,
        recommendation: 'retrain_with_new_data'
      }
    }

    return null
  }
}
```

#### Performance Trend Tracking
```typescript
// Store daily performance snapshots
CREATE TABLE performance_snapshots (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL,
  date DATE NOT NULL,
  accuracy REAL,
  execution_count INTEGER,
  contradiction_count INTEGER,
  error_count INTEGER,
  avg_execution_time_ms REAL,
  FOREIGN KEY (eval_id) REFERENCES evals(id),
  UNIQUE(eval_id, date)
);

// API: GET /api/evals/:id/performance-trend?days=30
// Returns time-series data for charting
```

---

### 5. **Pattern Analysis & Feedback Consolidation** 🔶 MEDIUM PRIORITY

**What OpenAI Has:**
```python
# Analyze failure patterns
patterns = analyze_failures([
    "Output too short in 5/10 cases",
    "Missing chemical names in 3/10 cases",
    "Incorrect tone in 2/10 cases"
])

# Consolidate into actionable feedback
feedback = f"""
Common failure patterns:
1. Length issues (50% of failures)
2. Missing domain terms (30% of failures)
3. Tone problems (20% of failures)

Improve the prompt to address these patterns.
"""
```

**What iofold Has:**
```typescript
// Shows contradictions, but doesn't analyze patterns
// User manually reviews each contradiction
```

**What's Missing:**
- Automatic pattern detection
- Clustering similar failures
- Natural language summaries
- Actionable recommendations

**Implementation Plan:**

```typescript
// /src/analysis/pattern-analyzer.ts

class PatternAnalyzer {
  async analyzeContradictions(eval_id: string): Promise<PatternReport> {
    // 1. Get all contradictions
    const contradictions = await this.getContradictions(eval_id)

    // 2. Extract features from each contradiction
    const features = contradictions.map(c => ({
      trace_id: c.trace_id,
      input_length: c.trace.input.length,
      output_length: c.trace.output.length,
      tool_calls: c.trace.tool_calls.length,
      keywords: this.extractKeywords(c.trace),
      human_rating: c.human_feedback.rating,
      eval_prediction: c.eval_execution.predicted_result
    }))

    // 3. Cluster similar contradictions
    const clusters = this.cluster Failures(features)

    // 4. Generate natural language summary for each cluster
    const patterns = clusters.map(cluster => ({
      count: cluster.members.length,
      percentage: cluster.members.length / contradictions.length,
      summary: this.summarizeCluster(cluster),
      example_traces: cluster.members.slice(0, 3).map(m => m.trace_id)
    }))

    // 5. Sort by frequency
    patterns.sort((a, b) => b.count - a.count)

    return {
      total_contradictions: contradictions.length,
      patterns,
      recommendation: this.generateRecommendation(patterns)
    }
  }

  summarizeCluster(cluster: FailureCluster): string {
    // Use simple heuristics or LLM to summarize
    const common = cluster.common_features

    if (common.output_length && common.output_length < 50) {
      return "Eval incorrectly flags short responses as negative"
    }

    if (common.keywords.includes('escalate')) {
      return "Eval doesn't recognize escalation as positive outcome"
    }

    if (common.tool_calls === 0) {
      return "Eval penalizes responses without tool calls"
    }

    return "Pattern detected but needs manual review"
  }

  generateRecommendation(patterns: Pattern[]): string {
    const top_pattern = patterns[0]

    return `
Most common issue (${top_pattern.percentage}% of contradictions):
${top_pattern.summary}

Recommended custom instruction:
"${this.generateCustomInstruction(top_pattern)}"

Example traces to review: ${top_pattern.example_traces.join(', ')}
    `.trim()
  }
}
```

---

### 6. **A/B Testing Between Versions** 🔷 LOW PRIORITY

**What OpenAI Has:**
```python
# Deploy multiple versions
# Route traffic randomly
# Measure performance on live data
# Select winner
```

**What iofold Has:**
```typescript
// Only one "active" version at a time
// No split testing capability
```

**What's Missing:**
- Multi-version deployment
- Traffic splitting
- Statistical significance testing
- Automated winner selection

**Implementation Plan:**

```typescript
// POST /api/eval-sets/:id/ab-test
{
  "variant_a": "eval_v2_id",
  "variant_b": "eval_v3_id",
  "traffic_split": 0.5,  // 50/50
  "duration_days": 7,
  "success_metric": "accuracy",
  "confidence_level": 0.95
}

// Execution router randomly assigns variant
// Track results per variant
// After duration, calculate winner with statistical test
```

---

## Implementation Priority

### 🚨 **Must Have (High Priority)**

1. **Automatic Retraining Triggers**
   - Why: Core to "self-evolving" concept
   - Effort: 2-3 weeks
   - Impact: High - makes platform truly autonomous

2. **Continuous Monitoring**
   - Why: Detect degradation early
   - Effort: 1-2 weeks
   - Impact: High - prevents silent failures

### 🔶 **Should Have (Medium Priority)**

3. **Multi-Dimensional Grading**
   - Why: More nuanced evaluation
   - Effort: 3-4 weeks
   - Impact: Medium - better eval quality

4. **Iterative Refinement Loops**
   - Why: Higher success rate
   - Effort: 1-2 weeks
   - Impact: Medium - improved evals

5. **Pattern Analysis**
   - Why: Actionable insights
   - Effort: 2-3 weeks
   - Impact: Medium - guides refinement

### 🔷 **Nice to Have (Low Priority)**

6. **A/B Testing**
   - Why: Scientific version selection
   - Effort: 2-3 weeks
   - Impact: Low - marginal improvement

---

## MVP Scope Alignment

**Original MVP Scope:**
> "User-triggered refinement only. No auto-refinement on threshold."
> — docs/success_criteria.md

**Current State:** ✅ MVP scope fully implemented

**Post-MVP Features:** All missing features above

---

## Recommended Roadmap

### Phase 1: Monitoring (Weeks 13-14)
- Continuous performance tracking
- Alert system
- Dashboard widgets

### Phase 2: Auto-Triggers (Weeks 15-17)
- Threshold-based triggering
- Opt-in auto-refinement
- User notification system

### Phase 3: Multi-Grading (Weeks 18-21)
- Custom grader definitions
- Composite scoring
- Multi-aspect feedback UI

### Phase 4: Advanced Features (Weeks 22-25)
- Iterative refinement loops
- Pattern analysis
- A/B testing (optional)

---

## Key Design Decisions

### 1. **User Control vs Automation**

**OpenAI Approach:** Fully automatic
**iofold MVP:** Fully manual
**iofold Post-MVP:** **Opt-in automation** ✅

Users choose automation level:
- Manual: Current behavior (full control)
- Assisted: Alerts + suggestions (user approves)
- Automatic: Auto-refine when thresholds crossed (user monitors)

### 2. **Human Feedback vs Multi-Grading**

**OpenAI Approach:** Multiple automated graders
**iofold MVP:** Human feedback only
**iofold Post-MVP:** **Hybrid** ✅

- Human feedback remains primary ground truth
- Add optional automated graders for specific aspects
- Weighted composite scoring
- User can disable graders they don't need

### 3. **One-Shot vs Iterative**

**OpenAI Approach:** Iterate until target met
**iofold MVP:** One-shot generation
**iofold Post-MVP:** **User chooses** ✅

- Default: One-shot (fast, predictable)
- Advanced: Iterative mode (slower, higher quality)
- Clear UI showing iteration progress
- User can cancel anytime

---

## Conclusion

**What We're Missing:**
1. Automatic triggers (high priority)
2. Continuous monitoring (high priority)
3. Multi-dimensional grading (medium priority)
4. Iterative loops (medium priority)
5. Pattern analysis (medium priority)
6. A/B testing (low priority)

**Our Advantages:**
- User control & transparency
- Visual dashboard & swipe interface
- Integration with existing tools
- Code-first deterministic evals
- Production-ready platform

**Strategic Position:**
We're not missing core capabilities—we're **deliberately prioritizing user control over full automation**. Post-MVP, we can add opt-in automation while maintaining our UX/transparency advantages.

---

**Last Updated:** 2025-11-17
**Status:** Gap analysis complete, roadmap defined
**Next Steps:** Review priorities, begin Phase 1 implementation
