PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_eval_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`eval_id` text NOT NULL,
	`trace_id` text NOT NULL,
	`predicted_result` integer,
	`predicted_reason` text,
	`execution_time_ms` integer,
	`error` text,
	`stdout` text,
	`stderr` text,
	`score` real,
	`feedback` text,
	`success` integer,
	`llm_calls` integer,
	`llm_cost_usd` real,
	`cache_hits` integer,
	`executed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trace_id`) REFERENCES `traces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_eval_executions`("id", "eval_id", "trace_id", "predicted_result", "predicted_reason", "execution_time_ms", "error", "stdout", "stderr", "score", "feedback", "success", "llm_calls", "llm_cost_usd", "cache_hits", "executed_at") SELECT "id", "eval_id", "trace_id", "predicted_result", "predicted_reason", "execution_time_ms", "error", "stdout", "stderr", "score", "feedback", "success", "llm_calls", "llm_cost_usd", "cache_hits", "executed_at" FROM `eval_executions`;--> statement-breakpoint
DROP TABLE `eval_executions`;--> statement-breakpoint
ALTER TABLE `__new_eval_executions` RENAME TO `eval_executions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_eval_executions_eval_id` ON `eval_executions` (`eval_id`);--> statement-breakpoint
CREATE INDEX `idx_eval_executions_trace_id` ON `eval_executions` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_eval_executions_executed_trace` ON `eval_executions` (`eval_id`,`executed_at`,`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_eval_executions_success` ON `eval_executions` (`success`);--> statement-breakpoint
CREATE TABLE `__new_evals` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`version` integer NOT NULL,
	`parent_eval_id` text,
	`name` text NOT NULL,
	`description` text,
	`code` text NOT NULL,
	`model_used` text,
	`accuracy` real,
	`training_trace_ids` text,
	`generation_prompt` text,
	`test_results` text,
	`execution_count` integer DEFAULT 0,
	`contradiction_count` integer DEFAULT 0,
	`status` text DEFAULT 'draft' NOT NULL,
	`auto_execute_enabled` integer DEFAULT false,
	`auto_refine_enabled` integer DEFAULT false,
	`monitoring_thresholds` text,
	`cohen_kappa` real,
	`f1_score` real,
	`precision` real,
	`recall` real,
	`variation` text,
	`agreement_rate` real,
	`confusion_matrix` text,
	`per_trace_results` text,
	`total_cost_usd` real,
	`avg_duration_ms` real,
	`activated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_evals`("id", "agent_id", "version", "parent_eval_id", "name", "description", "code", "model_used", "accuracy", "training_trace_ids", "generation_prompt", "test_results", "execution_count", "contradiction_count", "status", "auto_execute_enabled", "auto_refine_enabled", "monitoring_thresholds", "cohen_kappa", "f1_score", "precision", "recall", "variation", "agreement_rate", "confusion_matrix", "per_trace_results", "total_cost_usd", "avg_duration_ms", "activated_at", "created_at", "updated_at") SELECT "id", "agent_id", "version", "parent_eval_id", "name", "description", "code", "model_used", "accuracy", "training_trace_ids", "generation_prompt", "test_results", "execution_count", "contradiction_count", "status", "auto_execute_enabled", "auto_refine_enabled", "monitoring_thresholds", "cohen_kappa", "f1_score", "precision", "recall", "variation", "agreement_rate", "confusion_matrix", "per_trace_results", "total_cost_usd", "avg_duration_ms", "activated_at", "created_at", "updated_at" FROM `evals`;--> statement-breakpoint
DROP TABLE `evals`;--> statement-breakpoint
ALTER TABLE `__new_evals` RENAME TO `evals`;--> statement-breakpoint
CREATE INDEX `idx_evals_agent_id` ON `evals` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_evals_name` ON `evals` (`name`);--> statement-breakpoint
CREATE INDEX `idx_evals_cohen_kappa` ON `evals` (`cohen_kappa`);--> statement-breakpoint
CREATE INDEX `idx_evals_f1_score` ON `evals` (`f1_score`);--> statement-breakpoint
CREATE INDEX `idx_evals_status` ON `evals` (`status`);--> statement-breakpoint
CREATE INDEX `idx_evals_variation` ON `evals` (`variation`);--> statement-breakpoint
CREATE UNIQUE INDEX `evals_agent_version_unique` ON `evals` (`agent_id`,`version`);