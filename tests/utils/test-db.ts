/**
 * Test Database Utility
 *
 * Provides an in-memory SQLite database for unit testing using better-sqlite3.
 * Uses the actual Drizzle schema for realistic tests.
 */

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/db/schema';
import { eq } from 'drizzle-orm';

// Full schema SQL generated from Drizzle schema
const SCHEMA_SQL = `
-- Users & Workspaces
CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`email\` text NOT NULL,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`users_email_unique\` ON \`users\` (\`email\`);

CREATE TABLE IF NOT EXISTS \`workspaces\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`user_id\` text NOT NULL,
  \`name\` text NOT NULL,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
);

-- Agents
CREATE TABLE IF NOT EXISTS \`agents\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`workspace_id\` text NOT NULL,
  \`name\` text NOT NULL,
  \`description\` text,
  \`status\` text DEFAULT 'discovered' NOT NULL,
  \`active_version_id\` text,
  \`active_eval_id\` text,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  \`updated_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS \`idx_agents_workspace_id\` ON \`agents\` (\`workspace_id\`);
CREATE INDEX IF NOT EXISTS \`idx_agents_status\` ON \`agents\` (\`status\`);

CREATE TABLE IF NOT EXISTS \`agent_versions\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`agent_id\` text NOT NULL,
  \`version\` integer NOT NULL,
  \`prompt_template\` text NOT NULL,
  \`variables\` text,
  \`source\` text NOT NULL,
  \`parent_version_id\` text,
  \`accuracy\` real,
  \`status\` text DEFAULT 'candidate' NOT NULL,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`agent_id\`) REFERENCES \`agents\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS \`idx_agent_versions_agent_id\` ON \`agent_versions\` (\`agent_id\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`agent_versions_agent_id_version_unique\` ON \`agent_versions\` (\`agent_id\`,\`version\`);

-- Integrations
CREATE TABLE IF NOT EXISTS \`integrations\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`workspace_id\` text NOT NULL,
  \`name\` text NOT NULL,
  \`platform\` text NOT NULL,
  \`api_key_encrypted\` text NOT NULL,
  \`config\` text,
  \`status\` text DEFAULT 'active' NOT NULL,
  \`last_synced_at\` text,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS \`idx_integrations_workspace_id\` ON \`integrations\` (\`workspace_id\`);

-- System Prompts
CREATE TABLE IF NOT EXISTS \`system_prompts\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`workspace_id\` text NOT NULL,
  \`agent_name\` text NOT NULL,
  \`prompt_hash\` text NOT NULL,
  \`content\` text NOT NULL,
  \`metadata\` text,
  \`first_seen_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  \`last_seen_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  \`trace_count\` integer DEFAULT 1,
  FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE no action
);

-- Traces
CREATE TABLE IF NOT EXISTS \`traces\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`workspace_id\` text NOT NULL,
  \`integration_id\` text,
  \`trace_id\` text NOT NULL,
  \`source\` text NOT NULL,
  \`timestamp\` text NOT NULL,
  \`metadata\` text,
  \`steps\` text NOT NULL,
  \`raw_data\` text,
  \`input_preview\` text,
  \`output_preview\` text,
  \`step_count\` integer DEFAULT 0,
  \`has_errors\` integer DEFAULT false,
  \`agent_version_id\` text,
  \`assignment_status\` text DEFAULT 'unassigned' NOT NULL,
  \`system_prompt_id\` text,
  \`imported_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (\`integration_id\`) REFERENCES \`integrations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (\`agent_version_id\`) REFERENCES \`agent_versions\`(\`id\`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (\`system_prompt_id\`) REFERENCES \`system_prompts\`(\`id\`) ON UPDATE no action ON DELETE no action
);
CREATE INDEX IF NOT EXISTS \`idx_traces_workspace_id\` ON \`traces\` (\`workspace_id\`);
CREATE INDEX IF NOT EXISTS \`idx_traces_trace_id\` ON \`traces\` (\`trace_id\`);

-- Feedback
CREATE TABLE IF NOT EXISTS \`feedback\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`trace_id\` text NOT NULL,
  \`agent_id\` text,
  \`rating\` text NOT NULL,
  \`rating_detail\` text,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`trace_id\`) REFERENCES \`traces\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (\`agent_id\`) REFERENCES \`agents\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS \`idx_feedback_trace_id\` ON \`feedback\` (\`trace_id\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`feedback_trace_unique\` ON \`feedback\` (\`trace_id\`);

-- Evals
CREATE TABLE IF NOT EXISTS \`evals\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`agent_id\` text NOT NULL,
  \`version\` integer NOT NULL,
  \`parent_eval_id\` text,
  \`name\` text NOT NULL,
  \`description\` text,
  \`code\` text NOT NULL,
  \`model_used\` text NOT NULL,
  \`accuracy\` real,
  \`training_trace_ids\` text,
  \`generation_prompt\` text,
  \`test_results\` text,
  \`execution_count\` integer DEFAULT 0,
  \`contradiction_count\` integer DEFAULT 0,
  \`status\` text DEFAULT 'draft' NOT NULL,
  \`auto_execute_enabled\` integer DEFAULT false,
  \`auto_refine_enabled\` integer DEFAULT false,
  \`monitoring_thresholds\` text,
  \`cohen_kappa\` real,
  \`f1_score\` real,
  \`precision\` real,
  \`recall\` real,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  \`updated_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`agent_id\`) REFERENCES \`agents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (\`parent_eval_id\`) REFERENCES \`evals\`(\`id\`) ON UPDATE no action ON DELETE set null
);
CREATE INDEX IF NOT EXISTS \`idx_evals_agent_id\` ON \`evals\` (\`agent_id\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`evals_agent_version_unique\` ON \`evals\` (\`agent_id\`,\`version\`);

CREATE TABLE IF NOT EXISTS \`eval_executions\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`eval_id\` text NOT NULL,
  \`trace_id\` text NOT NULL,
  \`predicted_result\` integer NOT NULL,
  \`predicted_reason\` text,
  \`execution_time_ms\` integer,
  \`error\` text,
  \`stdout\` text,
  \`stderr\` text,
  \`executed_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`eval_id\`) REFERENCES \`evals\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (\`trace_id\`) REFERENCES \`traces\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS \`idx_eval_executions_eval_id\` ON \`eval_executions\` (\`eval_id\`);
CREATE INDEX IF NOT EXISTS \`idx_eval_executions_trace_id\` ON \`eval_executions\` (\`trace_id\`);

CREATE TABLE IF NOT EXISTS \`eval_candidates\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`agent_id\` text NOT NULL,
  \`code\` text NOT NULL,
  \`variation\` text,
  \`agreement_rate\` real,
  \`accuracy\` real,
  \`cohen_kappa\` real,
  \`f1_score\` real,
  \`confusion_matrix\` text,
  \`per_trace_results\` text,
  \`total_cost_usd\` real,
  \`avg_duration_ms\` real,
  \`status\` text DEFAULT 'candidate' NOT NULL,
  \`parent_candidate_id\` text,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  \`activated_at\` text,
  FOREIGN KEY (\`agent_id\`) REFERENCES \`agents\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS \`idx_eval_candidates_agent\` ON \`eval_candidates\` (\`agent_id\`);
CREATE INDEX IF NOT EXISTS \`idx_eval_candidates_status\` ON \`eval_candidates\` (\`status\`);

CREATE TABLE IF NOT EXISTS \`eval_candidate_executions\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`eval_candidate_id\` text NOT NULL,
  \`trace_id\` text NOT NULL,
  \`score\` real,
  \`feedback\` text,
  \`success\` integer,
  \`error\` text,
  \`duration_ms\` integer,
  \`llm_calls\` integer,
  \`llm_cost_usd\` real,
  \`cache_hits\` integer,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`eval_candidate_id\`) REFERENCES \`eval_candidates\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (\`trace_id\`) REFERENCES \`traces\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS \`idx_eval_candidate_executions_candidate\` ON \`eval_candidate_executions\` (\`eval_candidate_id\`);
CREATE INDEX IF NOT EXISTS \`idx_eval_candidate_executions_trace\` ON \`eval_candidate_executions\` (\`trace_id\`);
CREATE INDEX IF NOT EXISTS \`idx_eval_candidate_executions_success\` ON \`eval_candidate_executions\` (\`success\`);

-- Jobs
CREATE TABLE IF NOT EXISTS \`jobs\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`workspace_id\` text NOT NULL,
  \`type\` text NOT NULL,
  \`status\` text DEFAULT 'queued' NOT NULL,
  \`progress\` integer DEFAULT 0 NOT NULL,
  \`metadata\` text,
  \`result\` text,
  \`error\` text,
  \`retry_count\` integer DEFAULT 0,
  \`max_retries\` integer DEFAULT 5,
  \`error_category\` text,
  \`last_error_at\` text,
  \`next_retry_at\` text,
  \`priority\` integer DEFAULT 0,
  \`agent_id\` text,
  \`agent_version_id\` text,
  \`trigger_event\` text,
  \`trigger_threshold\` text,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  \`started_at\` text,
  \`completed_at\` text
);
CREATE INDEX IF NOT EXISTS \`idx_jobs_workspace\` ON \`jobs\` (\`workspace_id\`);
CREATE INDEX IF NOT EXISTS \`idx_jobs_status\` ON \`jobs\` (\`status\`);

CREATE TABLE IF NOT EXISTS \`job_retry_history\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`job_id\` text NOT NULL,
  \`attempt\` integer NOT NULL,
  \`error\` text NOT NULL,
  \`error_category\` text NOT NULL,
  \`delay_ms\` integer NOT NULL,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`job_id\`) REFERENCES \`jobs\`(\`id\`) ON UPDATE no action ON DELETE no action
);

-- Playground
CREATE TABLE IF NOT EXISTS \`playground_sessions\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`workspace_id\` text NOT NULL,
  \`agent_id\` text NOT NULL,
  \`agent_version_id\` text NOT NULL,
  \`messages\` text DEFAULT '[]' NOT NULL,
  \`variables\` text DEFAULT '{}' NOT NULL,
  \`files\` text DEFAULT '{}' NOT NULL,
  \`model_provider\` text NOT NULL,
  \`model_id\` text NOT NULL,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  \`updated_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (\`agent_id\`) REFERENCES \`agents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (\`agent_version_id\`) REFERENCES \`agent_versions\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS \`idx_playground_sessions_workspace\` ON \`playground_sessions\` (\`workspace_id\`);

-- Tools
CREATE TABLE IF NOT EXISTS \`tools\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`description\` text NOT NULL,
  \`parameters_schema\` text NOT NULL,
  \`handler_key\` text NOT NULL,
  \`category\` text DEFAULT 'general' NOT NULL,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS \`agent_tools\` (
  \`agent_id\` text NOT NULL,
  \`tool_id\` text NOT NULL,
  \`config\` text,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY(\`agent_id\`, \`tool_id\`),
  FOREIGN KEY (\`agent_id\`) REFERENCES \`agents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (\`tool_id\`) REFERENCES \`tools\`(\`id\`) ON UPDATE no action ON DELETE cascade
);

-- Tasksets
CREATE TABLE IF NOT EXISTS \`tasksets\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`workspace_id\` text NOT NULL,
  \`agent_id\` text NOT NULL,
  \`name\` text NOT NULL,
  \`description\` text,
  \`task_count\` integer DEFAULT 0,
  \`status\` text DEFAULT 'active' NOT NULL,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  \`updated_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (\`agent_id\`) REFERENCES \`agents\`(\`id\`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS \`taskset_tasks\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`taskset_id\` text NOT NULL,
  \`user_message\` text NOT NULL,
  \`expected_output\` text,
  \`source\` text NOT NULL,
  \`source_trace_id\` text,
  \`content_hash\` text NOT NULL,
  \`metadata\` text,
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (\`taskset_id\`) REFERENCES \`tasksets\`(\`id\`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS \`taskset_runs\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`workspace_id\` text NOT NULL,
  \`agent_id\` text NOT NULL,
  \`taskset_id\` text NOT NULL,
  \`status\` text DEFAULT 'queued' NOT NULL,
  \`task_count\` integer NOT NULL,
  \`completed_count\` integer DEFAULT 0,
  \`failed_count\` integer DEFAULT 0,
  \`model_provider\` text DEFAULT 'anthropic',
  \`model_id\` text DEFAULT 'anthropic/claude-sonnet-4-5',
  \`config\` text DEFAULT '{}',
  \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  \`started_at\` text,
  \`completed_at\` text,
  \`error\` text,
  FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (\`agent_id\`) REFERENCES \`agents\`(\`id\`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (\`taskset_id\`) REFERENCES \`tasksets\`(\`id\`) ON UPDATE no action ON DELETE no action
);
`;

export type TestDatabase = BetterSQLite3Database<typeof schema>;

export interface TestDbContext {
  db: TestDatabase;
  sqlite: Database.Database;
  seed: typeof seedTestData;
}

/**
 * Create a fresh in-memory test database with schema
 */
export function createTestDb(): TestDbContext {
  const sqlite = new Database(':memory:');

  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');

  // Execute schema
  sqlite.exec(SCHEMA_SQL);

  // Create Drizzle instance
  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    seed: seedTestData,
  };
}

/**
 * Seed common test data
 */
export function seedTestData(db: TestDatabase) {
  const now = new Date().toISOString();

  // Create user
  db.insert(schema.users).values({
    id: 'user_test',
    email: 'test@example.com',
  }).run();

  // Create workspace
  db.insert(schema.workspaces).values({
    id: 'workspace_test',
    userId: 'user_test',
    name: 'Test Workspace',
  }).run();

  // Create integration
  db.insert(schema.integrations).values({
    id: 'int_test',
    workspaceId: 'workspace_test',
    name: 'Test Integration',
    platform: 'langfuse',
    apiKeyEncrypted: 'encrypted_key',
    status: 'active',
  }).run();

  // Create agent
  db.insert(schema.agents).values({
    id: 'agent_test',
    workspaceId: 'workspace_test',
    name: 'Test Agent',
    description: 'A test agent',
    status: 'confirmed',
  }).run();

  // Create agent version
  db.insert(schema.agentVersions).values({
    id: 'ver_test',
    agentId: 'agent_test',
    version: 1,
    promptTemplate: 'You are a test agent.',
    source: 'manual',
    status: 'active',
  }).run();

  // Update agent with active version
  db.update(schema.agents)
    .set({ activeVersionId: 'ver_test' })
    .where(eq(schema.agents.id, 'agent_test'))
    .run();

  return {
    userId: 'user_test',
    workspaceId: 'workspace_test',
    integrationId: 'int_test',
    agentId: 'agent_test',
    agentVersionId: 'ver_test',
  };
}

/**
 * Create a mock D1Database-like interface from better-sqlite3
 * This allows testing code that expects the D1 interface
 *
 * The mock implements the D1Database interface that Drizzle's D1 driver expects.
 */
export function createMockD1(sqlite: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      let stmt: Database.Statement;
      try {
        stmt = sqlite.prepare(sql);
      } catch (e) {
        // Return a mock statement that will fail on execution
        const error = e as Error;
        return {
          bind(..._params: any[]) {
            return {
              async all(): Promise<D1Result<unknown>> {
                return {
                  results: [],
                  success: false,
                  error: error.message,
                  meta: { duration: 0, last_row_id: 0, changes: 0, served_by: 'mock', size_after: 0, rows_read: 0, rows_written: 0 }
                };
              },
              async first(): Promise<unknown | null> {
                return null;
              },
              async run(): Promise<D1Result<unknown>> {
                return {
                  results: [],
                  success: false,
                  error: error.message,
                  meta: { duration: 0, last_row_id: 0, changes: 0, served_by: 'mock', size_after: 0, rows_read: 0, rows_written: 0 }
                };
              },
              async raw(): Promise<unknown[][]> {
                return [];
              }
            };
          },
          async all(): Promise<D1Result<unknown>> {
            return {
              results: [],
              success: false,
              error: error.message,
              meta: { duration: 0, last_row_id: 0, changes: 0, served_by: 'mock', size_after: 0, rows_read: 0, rows_written: 0 }
            };
          },
          async first(): Promise<unknown | null> {
            return null;
          },
          async run(): Promise<D1Result<unknown>> {
            return {
              results: [],
              success: false,
              error: error.message,
              meta: { duration: 0, last_row_id: 0, changes: 0, served_by: 'mock', size_after: 0, rows_read: 0, rows_written: 0 }
            };
          },
          async raw(): Promise<unknown[][]> {
            return [];
          }
        } as D1PreparedStatement;
      }

      return {
        bind(...params: any[]) {
          return {
            async all<T = unknown>(): Promise<D1Result<T>> {
              try {
                const results = stmt.all(...params) as T[];
                return {
                  results,
                  success: true,
                  meta: { duration: 0, last_row_id: 0, changes: 0, served_by: 'mock', size_after: 0, rows_read: results.length, rows_written: 0 }
                };
              } catch (error) {
                return {
                  results: [],
                  success: false,
                  error: (error as Error).message,
                  meta: { duration: 0, last_row_id: 0, changes: 0, served_by: 'mock', size_after: 0, rows_read: 0, rows_written: 0 }
                };
              }
            },
            async first<T = unknown>(colName?: string): Promise<T | null> {
              try {
                const result = stmt.get(...params);
                if (!result) return null;
                if (colName && typeof result === 'object' && result !== null) {
                  return (result as Record<string, unknown>)[colName] as T;
                }
                return result as T;
              } catch {
                return null;
              }
            },
            async run(): Promise<D1Result<unknown>> {
              try {
                const info = stmt.run(...params);
                return {
                  results: [],
                  success: true,
                  meta: {
                    duration: 0,
                    last_row_id: Number(info.lastInsertRowid),
                    changes: info.changes,
                    served_by: 'mock',
                    size_after: 0,
                    rows_read: 0,
                    rows_written: info.changes
                  }
                };
              } catch (error) {
                return {
                  results: [],
                  success: false,
                  error: (error as Error).message,
                  meta: { duration: 0, last_row_id: 0, changes: 0, served_by: 'mock', size_after: 0, rows_read: 0, rows_written: 0 }
                };
              }
            },
            async raw<T = unknown[]>(): Promise<T[]> {
              try {
                const results = stmt.raw(true).all(...params) as T[];
                return results;
              } catch {
                return [];
              }
            }
          };
        },
        async all<T = unknown>(): Promise<D1Result<T>> {
          const results = stmt.all() as T[];
          return {
            results,
            success: true,
            meta: { duration: 0, last_row_id: 0, changes: 0, served_by: 'mock', size_after: 0, rows_read: results.length, rows_written: 0 }
          };
        },
        async first<T = unknown>(colName?: string): Promise<T | null> {
          const result = stmt.get();
          if (!result) return null;
          if (colName && typeof result === 'object' && result !== null) {
            return (result as Record<string, unknown>)[colName] as T;
          }
          return result as T;
        },
        async run(): Promise<D1Result<unknown>> {
          const info = stmt.run();
          return {
            results: [],
            success: true,
            meta: {
              duration: 0,
              last_row_id: Number(info.lastInsertRowid),
              changes: info.changes,
              served_by: 'mock',
              size_after: 0,
              rows_read: 0,
              rows_written: info.changes
            }
          };
        },
        async raw<T = unknown[]>(): Promise<T[]> {
          const results = stmt.raw(true).all() as T[];
          return results;
        }
      } as D1PreparedStatement;
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      for (const stmt of statements) {
        results.push(await stmt.all() as D1Result<T>);
      }
      return results;
    },
    async exec(sql: string): Promise<D1ExecResult> {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
    async dump(): Promise<ArrayBuffer> {
      throw new Error('dump() not implemented in mock');
    },
  } as D1Database;
}

// Re-export schema for convenience
export { schema };
