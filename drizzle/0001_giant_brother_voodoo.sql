-- Drop existing view if it exists (for idempotency)
DROP VIEW IF EXISTS `eval_comparison`;
--> statement-breakpoint
CREATE VIEW `eval_comparison` AS
  SELECT
    ee.eval_id,
    ee.trace_id,
    ee.predicted_result,
    f.rating,
    CASE
      WHEN f.rating = 'positive' AND ee.predicted_result = 0 THEN 1
      WHEN f.rating = 'negative' AND ee.predicted_result = 1 THEN 1
      ELSE 0
    END as is_contradiction,
    ee.executed_at
  FROM eval_executions ee
  LEFT JOIN feedback f ON ee.trace_id = f.trace_id
;
