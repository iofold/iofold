// src/db/schema/evals.ts
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { evalStatus, evalCandidateStatus } from './enums';
import { agents } from './agents';
import { traces } from './traces';
import { systemPrompts } from './prompts';

export const evals = sqliteTable('evals', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  parentEvalId: text('parent_eval_id').references((): any => evals.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  code: text('code').notNull(),
  modelUsed: text('model_used').notNull(),
  accuracy: real('accuracy'),
  trainingTraceIds: text('training_trace_ids', { mode: 'json' }).$type<string[]>(),
  generationPrompt: text('generation_prompt'),
  testResults: text('test_results', { mode: 'json' }).$type<Record<string, unknown>>(),
  executionCount: integer('execution_count').default(0),
  contradictionCount: integer('contradiction_count').default(0),
  status: text('status', { enum: evalStatus }).default('draft').notNull(),
  autoExecuteEnabled: integer('auto_execute_enabled', { mode: 'boolean' }).default(false),
  autoRefineEnabled: integer('auto_refine_enabled', { mode: 'boolean' }).default(false),
  monitoringThresholds: text('monitoring_thresholds', { mode: 'json' }).$type<Record<string, unknown>>(),
  cohenKappa: real('cohen_kappa'),
  f1Score: real('f1_score'),
  precision: real('precision'),
  recall: real('recall'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  agentIdx: index('idx_evals_agent_id').on(table.agentId),
  nameIdx: index('idx_evals_name').on(table.name),
  cohenKappaIdx: index('idx_evals_cohen_kappa').on(table.cohenKappa),
  f1ScoreIdx: index('idx_evals_f1_score').on(table.f1Score),
  agentVersionUnique: uniqueIndex('evals_agent_version_unique').on(table.agentId, table.version),
}));

export const evalCandidates = sqliteTable('eval_candidates', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  variation: text('variation'),
  agreementRate: real('agreement_rate'),
  accuracy: real('accuracy'),
  cohenKappa: real('cohen_kappa'),
  f1Score: real('f1_score'),
  confusionMatrix: text('confusion_matrix', { mode: 'json' }).$type<Record<string, unknown>>(),
  perTraceResults: text('per_trace_results', { mode: 'json' }).$type<unknown[]>(),
  totalCostUsd: real('total_cost_usd'),
  avgDurationMs: real('avg_duration_ms'),
  status: text('status', { enum: evalCandidateStatus }).default('candidate').notNull(),
  parentCandidateId: text('parent_candidate_id').references((): any => evalCandidates.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  activatedAt: text('activated_at'),
}, (table) => ({
  agentIdx: index('idx_eval_candidates_agent').on(table.agentId),
  statusIdx: index('idx_eval_candidates_status').on(table.status),
  accuracyIdx: index('idx_eval_candidates_accuracy').on(table.accuracy),
  parentIdx: index('idx_eval_candidates_parent').on(table.parentCandidateId),
  createdIdx: index('idx_eval_candidates_created').on(table.createdAt),
}));

export const evalCandidateExecutions = sqliteTable('eval_candidate_executions', {
  id: text('id').primaryKey(),
  evalCandidateId: text('eval_candidate_id').notNull().references(() => evalCandidates.id, { onDelete: 'cascade' }),
  traceId: text('trace_id').notNull().references(() => traces.id, { onDelete: 'cascade' }),
  score: real('score'),
  feedback: text('feedback'),
  success: integer('success', { mode: 'boolean' }),
  error: text('error'),
  durationMs: integer('duration_ms'),
  llmCalls: integer('llm_calls'),
  llmCostUsd: real('llm_cost_usd'),
  cacheHits: integer('cache_hits'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  candidateIdx: index('idx_eval_candidate_executions_candidate').on(table.evalCandidateId),
  traceIdx: index('idx_eval_candidate_executions_trace').on(table.traceId),
  successIdx: index('idx_eval_candidate_executions_success').on(table.success),
  createdIdx: index('idx_eval_candidate_executions_created').on(table.createdAt),
}));

export const evalExecutions = sqliteTable('eval_executions', {
  id: text('id').primaryKey(),
  evalId: text('eval_id').notNull().references(() => evals.id, { onDelete: 'cascade' }),
  traceId: text('trace_id').notNull().references(() => traces.id, { onDelete: 'cascade' }),
  predictedResult: integer('predicted_result', { mode: 'boolean' }).notNull(),
  predictedReason: text('predicted_reason'),
  executionTimeMs: integer('execution_time_ms'),
  error: text('error'),
  stdout: text('stdout'),
  stderr: text('stderr'),
  executedAt: text('executed_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  evalIdx: index('idx_eval_executions_eval_id').on(table.evalId),
  traceIdx: index('idx_eval_executions_trace_id').on(table.traceId),
  executedTraceIdx: index('idx_eval_executions_executed_trace').on(table.evalId, table.executedAt, table.traceId),
}));

export const evalCvResults = sqliteTable('eval_cv_results', {
  id: text('id').primaryKey(),
  candidateId: text('candidate_id').notNull().references(() => evalCandidates.id, { onDelete: 'cascade' }),
  kFolds: integer('k_folds').default(5).notNull(),
  meanAccuracy: real('mean_accuracy'),
  meanKappa: real('mean_kappa'),
  meanF1: real('mean_f1'),
  meanAgreementRate: real('mean_agreement_rate'),
  stdAccuracy: real('std_accuracy'),
  stdKappa: real('std_kappa'),
  isStable: integer('is_stable', { mode: 'boolean' }),
  foldResults: text('fold_results', { mode: 'json' }).$type<unknown[]>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  candidateIdx: index('idx_cv_results_candidate').on(table.candidateId),
  accuracyIdx: index('idx_cv_results_accuracy').on(table.meanAccuracy),
  stableIdx: index('idx_cv_results_stable').on(table.isStable),
}));

export const evalLlmCache = sqliteTable('eval_llm_cache', {
  id: text('id').primaryKey(),
  promptHash: text('prompt_hash').notNull(),
  model: text('model').notNull(),
  responseText: text('response_text').notNull(),
  tokensInput: integer('tokens_input'),
  tokensOutput: integer('tokens_output'),
  costUsd: real('cost_usd'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: text('expires_at'),
}, (table) => ({
  hashIdx: index('idx_llm_cache_hash').on(table.promptHash),
  modelIdx: index('idx_llm_cache_model').on(table.model),
  createdIdx: index('idx_llm_cache_created').on(table.createdAt),
  expiresIdx: index('idx_llm_cache_expires').on(table.expiresAt),
  promptModelUnique: uniqueIndex('eval_llm_cache_prompt_model_unique').on(table.promptHash, table.model),
}));

export const evalPromptCoverage = sqliteTable('eval_prompt_coverage', {
  id: text('id').primaryKey(),
  evalId: text('eval_id').notNull().references(() => evals.id, { onDelete: 'cascade' }),
  systemPromptId: text('system_prompt_id').notNull().references(() => systemPrompts.id, { onDelete: 'cascade' }),
  executionCount: integer('execution_count').default(0),
  passCount: integer('pass_count').default(0),
  failCount: integer('fail_count').default(0),
  errorCount: integer('error_count').default(0),
  accuracy: real('accuracy'),
  firstExecutionAt: text('first_execution_at'),
  lastExecutionAt: text('last_execution_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  evalIdx: index('idx_eval_prompt_coverage_eval').on(table.evalId),
  promptIdx: index('idx_eval_prompt_coverage_prompt').on(table.systemPromptId),
  evalPromptUnique: uniqueIndex('eval_prompt_coverage_eval_prompt_unique').on(table.evalId, table.systemPromptId),
}));

// Type exports
export type Eval = typeof evals.$inferSelect;
export type NewEval = typeof evals.$inferInsert;
export type EvalCandidate = typeof evalCandidates.$inferSelect;
export type NewEvalCandidate = typeof evalCandidates.$inferInsert;
export type EvalCandidateExecution = typeof evalCandidateExecutions.$inferSelect;
export type NewEvalCandidateExecution = typeof evalCandidateExecutions.$inferInsert;
export type EvalExecution = typeof evalExecutions.$inferSelect;
export type NewEvalExecution = typeof evalExecutions.$inferInsert;
export type EvalCvResult = typeof evalCvResults.$inferSelect;
export type NewEvalCvResult = typeof evalCvResults.$inferInsert;
export type EvalLlmCache = typeof evalLlmCache.$inferSelect;
export type NewEvalLlmCache = typeof evalLlmCache.$inferInsert;
export type EvalPromptCoverage = typeof evalPromptCoverage.$inferSelect;
export type NewEvalPromptCoverage = typeof evalPromptCoverage.$inferInsert;
