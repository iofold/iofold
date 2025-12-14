import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, createMockD1, schema } from '../../tests/utils/test-db';
import { JobManager } from './job-manager';
import type { ErrorCategory } from '../errors/classifier';

describe('JobManager retry tracking', () => {
  let mockD1: D1Database;
  let jobManager: JobManager;
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;

    // Seed required data
    db.insert(schema.users).values({
      id: 'user_test',
      email: 'test@example.com'
    }).run();

    db.insert(schema.workspaces).values({
      id: 'workspace_test',
      userId: 'user_test',
      name: 'Test Workspace'
    }).run();

    mockD1 = createMockD1(testDb.sqlite);
    jobManager = new JobManager(mockD1);
  });

  describe('createJob', () => {
    it('should create job with retry configuration', async () => {
      const job = await jobManager.createJob(
        'eval_execution',
        'workspace_test',
        {
          maxRetries: 3,
          priority: 10,
          agentId: 'agent_123'
        }
      );

      expect(job.id).toMatch(/^job_/);
      expect(job.workspace_id).toBe('workspace_test');
      expect(job.type).toBe('eval_execution');
      expect(job.status).toBe('queued');
      expect(job.progress).toBe(0);

      // Verify it was actually saved with correct retry config
      const savedJob = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, job.id))
        .limit(1);

      expect(savedJob).toHaveLength(1);
      expect(savedJob[0].maxRetries).toBe(3);
      expect(savedJob[0].priority).toBe(10);
      expect(savedJob[0].metadata).toMatchObject({
        workspaceId: 'workspace_test',
        agentId: 'agent_123'
      });
    });

    it('should create job with default retry configuration', async () => {
      const job = await jobManager.createJob(
        'trace_import',
        'workspace_test',
        {}
      );

      expect(job.id).toMatch(/^job_/);
      expect(job.status).toBe('queued');

      // Verify default values
      const savedJob = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, job.id))
        .limit(1);

      expect(savedJob).toHaveLength(1);
      expect(savedJob[0].maxRetries).toBe(5); // Default max retries
      expect(savedJob[0].priority).toBe(0);   // Default priority
    });
  });

  describe('getJobRetryHistory', () => {
    it('should get job retry history', async () => {
      // Create a job
      const job = await jobManager.createJob('eval_execution', 'workspace_test');

      // Insert retry history entries
      const now = new Date().toISOString();

      db.insert(schema.jobRetryHistory).values({
        id: 'retry_1',
        jobId: job.id,
        attempt: 1,
        error: 'Network timeout',
        errorCategory: 'transient_network',
        delayMs: 1000,
        createdAt: now
      }).run();

      db.insert(schema.jobRetryHistory).values({
        id: 'retry_2',
        jobId: job.id,
        attempt: 2,
        error: 'Rate limit exceeded',
        errorCategory: 'transient_rate_limit',
        delayMs: 2000,
        createdAt: new Date(Date.now() + 1000).toISOString()
      }).run();

      // Get retry history
      const history = await jobManager.getJobRetryHistory(job.id);

      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        attempt: 1,
        error: 'Network timeout',
        error_category: 'transient_network',
        delay_ms: 1000
      });
      expect(history[1]).toMatchObject({
        attempt: 2,
        error: 'Rate limit exceeded',
        error_category: 'transient_rate_limit',
        delay_ms: 2000
      });
    });

    it('should return empty array for job with no retry history', async () => {
      const job = await jobManager.createJob('eval_execution', 'workspace_test');
      const history = await jobManager.getJobRetryHistory(job.id);

      expect(history).toEqual([]);
    });

    it('should return empty array for non-existent job', async () => {
      const history = await jobManager.getJobRetryHistory('job_nonexistent');

      expect(history).toEqual([]);
    });
  });

  describe('listJobsPendingRetry', () => {
    it('should list jobs pending retry', async () => {
      // Use SQLite-compatible datetime format that datetime('now') will understand
      // datetime('now') returns format like '2025-12-14 18:30:00'
      const now = new Date();
      // Create a past timestamp by formatting to SQLite datetime format
      const past = new Date(now.getTime() - 60000).toISOString().replace('T', ' ').substring(0, 19);
      const future = new Date(now.getTime() + 60000).toISOString().replace('T', ' ').substring(0, 19);

      // Create jobs with various retry states
      const job1 = await jobManager.createJob('eval_execution', 'workspace_test');
      await db.update(schema.jobs)
        .set({
          status: 'queued',
          nextRetryAt: past // Ready to retry
        })
        .where(eq(schema.jobs.id, job1.id))
        .run();

      const job2 = await jobManager.createJob('eval_generation', 'workspace_test');
      await db.update(schema.jobs)
        .set({
          status: 'queued',
          nextRetryAt: future // Not ready yet
        })
        .where(eq(schema.jobs.id, job2.id))
        .run();

      const job3 = await jobManager.createJob('trace_import', 'workspace_test');
      await db.update(schema.jobs)
        .set({
          status: 'failed',
          nextRetryAt: past // Failed, shouldn't be included
        })
        .where(eq(schema.jobs.id, job3.id))
        .run();

      // List pending retries
      const pending = await jobManager.listJobsPendingRetry('workspace_test');

      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(job1.id);
      expect(pending[0].status).toBe('queued');
    });

    it('should list jobs pending retry with custom limit', async () => {
      const past = new Date(Date.now() - 60000).toISOString().replace('T', ' ').substring(0, 19);

      // Create multiple jobs ready for retry
      for (let i = 0; i < 5; i++) {
        const job = await jobManager.createJob('eval_execution', 'workspace_test');
        await db.update(schema.jobs)
          .set({
            status: 'queued',
            nextRetryAt: past,
            priority: i // Different priorities
          })
          .where(eq(schema.jobs.id, job.id))
          .run();
      }

      // List with limit
      const pending = await jobManager.listJobsPendingRetry('workspace_test', 3);

      expect(pending).toHaveLength(3);
      // Should be ordered by priority (descending), then nextRetryAt
      expect(pending[0].id).toBeDefined();
    });

    it('should return empty array when no jobs are pending retry', async () => {
      const pending = await jobManager.listJobsPendingRetry('workspace_test');

      expect(pending).toEqual([]);
    });

    it('should respect workspace isolation', async () => {
      // Create another workspace
      db.insert(schema.workspaces).values({
        id: 'workspace_other',
        userId: 'user_test',
        name: 'Other Workspace'
      }).run();

      const past = new Date(Date.now() - 60000).toISOString().replace('T', ' ').substring(0, 19);

      // Create job in test workspace
      const job1 = await jobManager.createJob('eval_execution', 'workspace_test');
      await db.update(schema.jobs)
        .set({ status: 'queued', nextRetryAt: past })
        .where(eq(schema.jobs.id, job1.id))
        .run();

      // Create job in other workspace
      const job2 = await jobManager.createJob('eval_execution', 'workspace_other');
      await db.update(schema.jobs)
        .set({ status: 'queued', nextRetryAt: past })
        .where(eq(schema.jobs.id, job2.id))
        .run();

      // Should only return job from test workspace
      const pending = await jobManager.listJobsPendingRetry('workspace_test');

      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(job1.id);
    });
  });

  describe('updateJobErrorCategory', () => {
    it('should update job error category', async () => {
      const job = await jobManager.createJob('eval_execution', 'workspace_test');

      // Update error category
      await jobManager.updateJobErrorCategory(job.id, 'transient_network');

      // Verify update
      const updated = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, job.id))
        .limit(1);

      expect(updated).toHaveLength(1);
      expect(updated[0].errorCategory).toBe('transient_network');
    });

    it('should handle permanent error categories', async () => {
      const job = await jobManager.createJob('eval_execution', 'workspace_test');

      await jobManager.updateJobErrorCategory(job.id, 'permanent_validation');

      const updated = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, job.id))
        .limit(1);

      expect(updated[0].errorCategory).toBe('permanent_validation');
    });

    it('should handle unknown error category', async () => {
      const job = await jobManager.createJob('eval_execution', 'workspace_test');

      await jobManager.updateJobErrorCategory(job.id, 'unknown');

      const updated = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, job.id))
        .limit(1);

      expect(updated[0].errorCategory).toBe('unknown');
    });
  });

  describe('getJobsByErrorCategory', () => {
    it('should get jobs by error category', async () => {
      // Create jobs with different error categories
      const job1 = await jobManager.createJob('eval_execution', 'workspace_test');
      await jobManager.updateJobErrorCategory(job1.id, 'transient_network');

      const job2 = await jobManager.createJob('eval_generation', 'workspace_test');
      await jobManager.updateJobErrorCategory(job2.id, 'transient_network');

      const job3 = await jobManager.createJob('trace_import', 'workspace_test');
      await jobManager.updateJobErrorCategory(job3.id, 'permanent_validation');

      // Get jobs by category
      const networkJobs = await jobManager.getJobsByErrorCategory(
        'workspace_test',
        'transient_network'
      );

      expect(networkJobs).toHaveLength(2);
      expect(networkJobs.map(j => j.id).sort()).toEqual([job1.id, job2.id].sort());
    });

    it('should get jobs by error category with custom limit', async () => {
      // Create multiple jobs with same error category
      const jobIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const job = await jobManager.createJob('eval_execution', 'workspace_test');
        await jobManager.updateJobErrorCategory(job.id, 'transient_rate_limit');
        jobIds.push(job.id);
      }

      // Get with limit
      const jobs = await jobManager.getJobsByErrorCategory(
        'workspace_test',
        'transient_rate_limit',
        3
      );

      expect(jobs).toHaveLength(3);
    });

    it('should return empty array when no jobs match category', async () => {
      const job = await jobManager.createJob('eval_execution', 'workspace_test');
      await jobManager.updateJobErrorCategory(job.id, 'transient_network');

      const jobs = await jobManager.getJobsByErrorCategory(
        'workspace_test',
        'permanent_validation'
      );

      expect(jobs).toEqual([]);
    });

    it('should respect workspace isolation', async () => {
      // Create another workspace
      db.insert(schema.workspaces).values({
        id: 'workspace_other',
        userId: 'user_test',
        name: 'Other Workspace'
      }).run();

      // Create job in test workspace
      const job1 = await jobManager.createJob('eval_execution', 'workspace_test');
      await jobManager.updateJobErrorCategory(job1.id, 'transient_network');

      // Create job in other workspace with same error category
      const job2 = await jobManager.createJob('eval_execution', 'workspace_other');
      await jobManager.updateJobErrorCategory(job2.id, 'transient_network');

      // Should only return job from test workspace
      const jobs = await jobManager.getJobsByErrorCategory(
        'workspace_test',
        'transient_network'
      );

      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe(job1.id);
    });

    it('should order jobs by created_at descending', async () => {
      // Create jobs with slight time differences
      const job1 = await jobManager.createJob('eval_execution', 'workspace_test');
      await jobManager.updateJobErrorCategory(job1.id, 'transient_server');

      // Wait a tiny bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const job2 = await jobManager.createJob('eval_execution', 'workspace_test');
      await jobManager.updateJobErrorCategory(job2.id, 'transient_server');

      await new Promise(resolve => setTimeout(resolve, 10));

      const job3 = await jobManager.createJob('eval_execution', 'workspace_test');
      await jobManager.updateJobErrorCategory(job3.id, 'transient_server');

      // Get jobs - should be in reverse chronological order
      const jobs = await jobManager.getJobsByErrorCategory(
        'workspace_test',
        'transient_server'
      );

      expect(jobs).toHaveLength(3);
      // Most recent job should be first
      expect(jobs[0].id).toBe(job3.id);
      expect(jobs[1].id).toBe(job2.id);
      expect(jobs[2].id).toBe(job1.id);
    });
  });
});
