# Eval Metrics UI Mockup

## Eval Table View

When viewing the list of evals at `/evals`, users will see:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Name                          │ Agent   │ Accuracy │ Kappa │  F1  │ Executions │ ⚠️ │ Last Run │
├───────────────────────────────┼─────────┼──────────┼───────┼──────┼────────────┼────┼──────────┤
│ candidate_correctness_XXX     │ agent_X │   100%   │ 1.00  │  0%  │    50      │  0 │ 2h ago   │
│                               │         │  🟢      │ 🟢   │  🔴  │            │    │          │
├───────────────────────────────┼─────────┼──────────┼───────┼──────┼────────────┼────┼──────────┤
│ email_classification_eval     │ agent_Y │   85%    │ 0.72  │ 88%  │   100      │  5 │ 1d ago   │
│                               │         │  🟢      │ 🟡   │  🟢  │            │    │          │
├───────────────────────────────┼─────────┼──────────┼───────┼──────┼────────────┼────┼──────────┤
│ sentiment_analyzer_v3         │ agent_Z │   65%    │ 0.38  │ 62%  │    75      │ 12 │ 3d ago   │
│                               │         │  🟡      │ 🔴   │  🟡  │            │    │          │
└───────────────────────────────┴─────────┴──────────┴───────┴──────┴────────────┴────┴──────────┘

Legend:
🟢 = Green (Excellent)
🟡 = Yellow (Good/Moderate)
🔴 = Red (Needs Improvement)
⚠️ = Contradictions count
```

### Color Thresholds

**Accuracy:**
- 🟢 Green: ≥ 80%
- 🟡 Yellow: 60-79%
- 🔴 Red: < 60%

**Cohen's Kappa:**
- 🟢 Green: ≥ 0.6 (Substantial agreement)
- 🟡 Yellow: 0.4-0.59 (Moderate agreement)
- 🔴 Red: < 0.4 (Fair/Poor agreement)

**F1 Score:**
- 🟢 Green: ≥ 80%
- 🟡 Yellow: 60-79%
- 🔴 Red: < 60%

### Hover Tooltips

- **Kappa** column: "Cohen's Kappa: Agreement accounting for chance"
- **F1** column: "F1 Score: Harmonic mean of precision and recall"

## Eval Side Sheet (Details View)

When clicking on an eval, the side sheet shows:

```
┌─────────────────────────────────────────────────────────────┐
│ candidate_correctness_1765667627695_6mragqu79          ✕    │
│ agent_70cd2eda-8b76-4996-95b9-8602937151f2                  │
│ Created 2 hours ago                                          │
├─────────────────────────────────────────────────────────────┤
│ [Details] [Executions]                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ BASIC METRICS                                                │
│ ┌─────────────────┬─────────────────┬──────────────────┐    │
│ │   Accuracy      │   Executions    │ Contradictions   │    │
│ │     100%        │       50        │        0         │    │
│ │    🟢          │                 │                  │    │
│ └─────────────────┴─────────────────┴──────────────────┘    │
│                                                              │
│ ADVANCED METRICS                                             │
│ ┌──────────────────────────┬──────────────────────────┐     │
│ │    Cohen's Kappa         │       F1 Score           │     │
│ │        1.000             │         0%               │     │
│ │        🟢               │         🔴              │     │
│ ├──────────────────────────┼──────────────────────────┤     │
│ │      Precision           │        Recall            │     │
│ │         100%             │          0%              │     │
│ │                          │                          │     │
│ └──────────────────────────┴──────────────────────────┘     │
│                                                              │
│ DESCRIPTION                                                  │
│ Evaluates if the candidate answer is factually correct      │
│ based on the reference emails and trace data.                │
│                                                              │
│ EVAL CODE                                                    │
│ ┌──────────────────────────────────────────────────────┐    │
│ │ def evaluate(trace):                                 │    │
│ │     # Evaluation logic here                          │    │
│ │     return {                                         │    │
│ │         "result": True,                              │    │
│ │         "reason": "Answer matches reference"         │    │
│ │     }                                                │    │
│ └──────────────────────────────────────────────────────┘    │
│                                                              │
│ Model: claude-sonnet-4                                       │
│                                                              │
│ ┌─────────────────┬─────────────────┐                       │
│ │   Playground    │     Matrix      │                       │
│ └─────────────────┴─────────────────┘                       │
│ ┌─────────────────┬─────────────────┐                       │
│ │    Execute      │     Delete      │                       │
│ └─────────────────┴─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## Interpretation Guide

### Example 1: Perfect Accuracy, Low F1
```
Accuracy: 100% 🟢
Cohen's Kappa: 1.00 🟢
F1 Score: 0% 🔴
Precision: 100%
Recall: 0%
```

**Interpretation**: The eval is 100% accurate but has 0% F1 score because while it never makes a false positive (100% precision), it also never identifies any true positives (0% recall). This typically indicates the eval always predicts "negative" - it's accurate because most cases are negative, but it's not useful for identifying positive cases.

**Action**: Review the eval logic to ensure it can identify positive cases, not just avoid false positives.

### Example 2: Balanced Performance
```
Accuracy: 85% 🟢
Cohen's Kappa: 0.72 🟡
F1 Score: 88% 🟢
Precision: 92%
Recall: 84%
```

**Interpretation**: This is a well-balanced eval with good accuracy and excellent F1 score. The eval correctly identifies most positive cases (84% recall) while maintaining high precision (92%). Cohen's Kappa of 0.72 indicates substantial agreement beyond chance.

**Action**: This eval is performing well and ready for production use.

### Example 3: Needs Improvement
```
Accuracy: 65% 🟡
Cohen's Kappa: 0.38 🔴
F1 Score: 62% 🟡
Precision: 58%
Recall: 67%
```

**Interpretation**: The eval has moderate accuracy but poor agreement when accounting for chance (κ=0.38). The F1 score is borderline, with both precision and recall needing improvement. The eval makes too many mistakes in both directions.

**Action**: Refine the eval logic, add more training examples, or consider regenerating with better instructions.

## Benefits of Advanced Metrics

1. **Cohen's Kappa** reveals when "accuracy" is misleading due to class imbalance
2. **F1 Score** balances precision and recall, giving a single performance metric
3. **Precision** shows trustworthiness of positive predictions
4. **Recall** shows completeness of positive case detection
5. **Combined view** enables comprehensive eval quality assessment at a glance
