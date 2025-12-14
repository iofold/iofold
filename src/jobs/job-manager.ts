import { eq, and, desc, lte, isNotNull, sql } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { Job, JobType, JobStatus, JobMetadata } from '../types/api';
import type { ErrorCategory } from '../errors/classifier';
import { createDb, type Database } from '../db/client';
import { jobs, jobRetryHistory } from '../db/schema';

export class JobManager {
  private drizzle: Database;

  constructor(private db: D1Database) {
    this.drizzle = createDb(db);
  }

  async createJob(
    type: JobType,
    workspaceId: string,
    metadata: Partial<JobMetadata> & { maxRetries?: number; priority?: number } = {}
  ): Promise<Job> {
    const id = `job_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const maxRetries = metadata.maxRetries ?? 5;
    const priority = metadata.priority ?? 0;

    const fullMetadata: JobMetadata = {
      workspaceId,
      ...metadata
    };

    await this.drizzle.insert(jobs).values({
      id,
      workspaceId,
      type: type as typeof jobs.$inferInsert['type'],
      status: 'queued',
      progress: 0,
      metadata: fullMetadata as unknown as Record<string, unknown>,
      maxRetries,
      priority,
      createdAt: now,
    });

    return {
      id,
      workspace_id: workspaceId,
      type,
      status: 'queued',
      progress: 0,
      created_at: now,
      started_at: null,
      completed_at: null
    };
  }

  async getJob(id: string): Promise<Job | null> {
    const result = await this.drizzle
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);

    if (result.length === 0) return null;

    return this.jobFromRecord(result[0]);
  }

  async updateJobStatus(
    id: string,
    status: JobStatus,
    progress?: number,
    error?: string
  ): Promise<void> {
    const updateData: Partial<typeof jobs.$inferInsert> = {
      status: status as any,
    };

    if (progress !== undefined) {
      updateData.progress = progress;
    }

    if (status === 'running' && progress === 0) {
      updateData.startedAt = new Date().toISOString();
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updateData.completedAt = new Date().toISOString();
    }

    if (error) {
      updateData.error = error;
    }

    await this.drizzle
      .update(jobs)
      .set(updateData)
      .where(eq(jobs.id, id));
  }

  async updateJobProgress(id: string, progress: number): Promise<void> {
    await this.drizzle
      .update(jobs)
      .set({
        progress,
        status: progress > 0 ? 'running' : 'queued',
      })
      .where(eq(jobs.id, id));
  }

  async completeJob(id: string, result: any): Promise<void> {
    await this.drizzle
      .update(jobs)
      .set({
        status: 'completed',
        progress: 100,
        completedAt: new Date().toISOString(),
        result,
      })
      .where(eq(jobs.id, id));
  }

  async failJob(id: string, error: string): Promise<void> {
    await this.drizzle
      .update(jobs)
      .set({
        status: 'failed',
        completedAt: new Date().toISOString(),
        error,
      })
      .where(eq(jobs.id, id));
  }

  async cancelJob(id: string): Promise<boolean> {
    const job = await this.getJob(id);
    if (!job) return false;

    // Can only cancel queued or running jobs
    if (job.status !== 'queued' && job.status !== 'running') {
      return false;
    }

    await this.updateJobStatus(id, 'cancelled');
    return true;
  }

  async listJobs(
    workspaceId: string,
    filters: {
      type?: JobType;
      status?: JobStatus;
      limit?: number;
    } = {}
  ): Promise<Job[]> {
    const conditions = [eq(jobs.workspaceId, workspaceId)];

    if (filters.type) {
      conditions.push(eq(jobs.type, filters.type as any));
    }

    if (filters.status) {
      conditions.push(eq(jobs.status, filters.status as any));
    }

    const limit = filters.limit || 20;

    const results = await this.drizzle
      .select()
      .from(jobs)
      .where(and(...conditions))
      .orderBy(desc(jobs.createdAt))
      .limit(limit);

    return results.map(r => this.jobFromRecord(r));
  }

  async getJobMetadata(id: string): Promise<JobMetadata | null> {
    const result = await this.drizzle
      .select({ metadata: jobs.metadata })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);

    if (result.length === 0 || !result[0].metadata) return null;

    return result[0].metadata as unknown as JobMetadata;
  }

  /**
   * Get retry history for a job
   */
  async getJobRetryHistory(jobId: string): Promise<Array<{
    attempt: number;
    error: string;
    error_category: ErrorCategory;
    delay_ms: number;
    created_at: string;
  }>> {
    const results = await this.drizzle
      .select({
        attempt: jobRetryHistory.attempt,
        error: jobRetryHistory.error,
        error_category: jobRetryHistory.errorCategory,
        delay_ms: jobRetryHistory.delayMs,
        created_at: jobRetryHistory.createdAt,
      })
      .from(jobRetryHistory)
      .where(eq(jobRetryHistory.jobId, jobId))
      .orderBy(jobRetryHistory.attempt);

    return results.map(r => ({
      attempt: r.attempt,
      error: r.error,
      error_category: r.error_category as ErrorCategory,
      delay_ms: r.delay_ms,
      created_at: r.created_at
    }));
  }

  /**
   * List jobs that are pending retry
   */
  async listJobsPendingRetry(workspaceId: string, limit = 50): Promise<Job[]> {
    const results = await this.drizzle
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspaceId),
          eq(jobs.status, 'queued'),
          isNotNull(jobs.nextRetryAt),
          lte(jobs.nextRetryAt, sql`datetime('now')`)
        )
      )
      .orderBy(desc(jobs.priority), jobs.nextRetryAt)
      .limit(limit);

    return results.map(r => this.jobFromRecord(r));
  }

  /**
   * Update job error category
   */
  async updateJobErrorCategory(id: string, category: ErrorCategory): Promise<void> {
    await this.drizzle
      .update(jobs)
      .set({ errorCategory: category })
      .where(eq(jobs.id, id));
  }

  /**
   * Get jobs by error category for analysis
   */
  async getJobsByErrorCategory(
    workspaceId: string,
    category: ErrorCategory,
    limit = 50
  ): Promise<Job[]> {
    const results = await this.drizzle
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspaceId),
          eq(jobs.errorCategory, category)
        )
      )
      .orderBy(desc(jobs.createdAt))
      .limit(limit);

    return results.map(r => this.jobFromRecord(r));
  }

  private jobFromRecord(record: typeof jobs.$inferSelect): Job {
    return {
      id: record.id,
      workspace_id: record.workspaceId,
      type: record.type as JobType,
      status: record.status as JobStatus,
      progress: record.progress,
      created_at: record.createdAt,
      started_at: record.startedAt ?? null,
      completed_at: record.completedAt ?? null,
      result: record.result as any,
      error: record.error ?? undefined
    };
  }
}
