DROP VIEW IF EXISTS `prompt_performance_summary`;--> statement-breakpoint
DROP VIEW IF EXISTS `current_eval_metrics`;--> statement-breakpoint
DROP VIEW IF EXISTS `refinement_timeline`;--> statement-breakpoint
DROP TABLE IF EXISTS `eval_cv_results`;--> statement-breakpoint
DROP TABLE IF EXISTS `eval_llm_cache`;--> statement-breakpoint
DROP TABLE IF EXISTS `eval_prompt_coverage`;--> statement-breakpoint
DROP TABLE IF EXISTS `task_feedback_pairs`;--> statement-breakpoint
DROP TABLE IF EXISTS `task_similar_traces`;--> statement-breakpoint
DROP TABLE IF EXISTS `playground_steps`;--> statement-breakpoint
DROP TABLE IF EXISTS `prompt_best_practices`;--> statement-breakpoint
DROP TABLE IF EXISTS `prompt_iterations`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`integration_id` text,
	`trace_id` text NOT NULL,
	`source` text NOT NULL,
	`timestamp` text NOT NULL,
	`metadata` text,
	`steps` text NOT NULL,
	`raw_data` text,
	`input_preview` text,
	`output_preview` text,
	`step_count` integer DEFAULT 0,
	`has_errors` integer DEFAULT false,
	`agent_version_id` text,
	`assignment_status` text DEFAULT 'unassigned' NOT NULL,
	`system_prompt_id` text,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_version_id`) REFERENCES `agent_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_prompt_id`) REFERENCES `system_prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_traces`("id", "workspace_id", "integration_id", "trace_id", "source", "timestamp", "metadata", "steps", "raw_data", "input_preview", "output_preview", "step_count", "has_errors", "agent_version_id", "assignment_status", "system_prompt_id", "imported_at") SELECT "id", "workspace_id", "integration_id", "trace_id", "source", "timestamp", "metadata", "steps", "raw_data", "input_preview", "output_preview", "step_count", "has_errors", "agent_version_id", "assignment_status", "system_prompt_id", "imported_at" FROM `traces`;--> statement-breakpoint
DROP TABLE `traces`;--> statement-breakpoint
ALTER TABLE `__new_traces` RENAME TO `traces`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_traces_workspace_id` ON `traces` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_traces_integration_id` ON `traces` (`integration_id`);--> statement-breakpoint
CREATE INDEX `idx_traces_trace_id` ON `traces` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_traces_agent_version_id` ON `traces` (`agent_version_id`);--> statement-breakpoint
CREATE INDEX `idx_traces_assignment_status` ON `traces` (`assignment_status`);--> statement-breakpoint
CREATE INDEX `idx_traces_system_prompt` ON `traces` (`system_prompt_id`);--> statement-breakpoint
CREATE INDEX `idx_traces_imported_at` ON `traces` (`imported_at`);