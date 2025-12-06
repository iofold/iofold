import type { D1Database } from '@cloudflare/workers-types';
import type { Job, JobType, JobStatus, JobMetadata } from '../types/api';
import type { ErrorCategory } from '../errors/classifier';

export class JobManager {
  constructor(private db: D1Database) {}

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

    await this.db
      .prepare(
        `INSERT INTO jobs (id, workspace_id, type, status, progress, metadata, max_retries, priority, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        workspaceId,
        type,
        'queued',
        0,
        JSON.stringify(fullMetadata),
        maxRetries,
        priority,
        now
      )
      .run();

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
    const result = await this.db
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .bind(id)
      .first();

    if (!result) return null;

    return this.jobFromRecord(result);
  }

  async updateJobStatus(
    id: string,
    status: JobStatus,
    progress?: number,
    error?: string
  ): Promise<void> {
    const updates: string[] = ['status = ?'];
    const bindings: any[] = [status];

    if (progress !== undefined) {
      updates.push('progress = ?');
      bindings.push(progress);
    }

    if (status === 'running' && progress === 0) {
      updates.push('started_at = ?');
      bindings.push(new Date().toISOString());
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updates.push('completed_at = ?');
      bindings.push(new Date().toISOString());
    }

    if (error) {
      updates.push('error = ?');
      bindings.push(error);
    }

    bindings.push(id);

    await this.db
      .prepare(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...bindings)
      .run();
  }

  async updateJobProgress(id: string, progress: number): Promise<void> {
    await this.db
      .prepare('UPDATE jobs SET progress = ?, status = ? WHERE id = ?')
      .bind(progress, progress > 0 ? 'running' : 'queued', id)
      .run();
  }

  async completeJob(id: string, result: any): Promise<void> {
    await this.db
      .prepare(
        `UPDATE jobs
         SET status = ?, progress = ?, completed_at = ?, result = ?
         WHERE id = ?`
      )
      .bind('completed', 100, new Date().toISOString(), JSON.stringify(result), id)
      .run();
  }

  async failJob(id: string, error: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE jobs
         SET status = ?, completed_at = ?, error = ?
         WHERE id = ?`
      )
      .bind('failed', new Date().toISOString(), error, id)
      .run();
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
    const conditions: string[] = ['workspace_id = ?'];
    const bindings: any[] = [workspaceId];

    if (filters.type) {
      conditions.push('type = ?');
      bindings.push(filters.type);
    }

    if (filters.status) {
      conditions.push('status = ?');
      bindings.push(filters.status);
    }

    const limit = filters.limit || 20;
    bindings.push(limit);

    const results = await this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(...bindings)
      .all();

    return results.results.map(r => this.jobFromRecord(r));
  }

  async getJobMetadata(id: string): Promise<JobMetadata | null> {
    const result = await this.db
      .prepare('SELECT metadata FROM jobs WHERE id = ?')
      .bind(id)
      .first();

    if (!result || !result.metadata) return null;

    return JSON.parse(result.metadata as string);
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
    const results = await this.db
      .prepare(
        `SELECT attempt, error, error_category, delay_ms, created_at
         FROM job_retry_history
         WHERE job_id = ?
         ORDER BY attempt ASC`
      )
      .bind(jobId)
      .all();

    return results.results.map(r => ({
      attempt: r.attempt as number,
      error: r.error as string,
      error_category: r.error_category as ErrorCategory,
      delay_ms: r.delay_ms as number,
      created_at: r.created_at as string
    }));
  }

  /**
   * List jobs that are pending retry
   */
  async listJobsPendingRetry(workspaceId: string, limit = 50): Promise<Job[]> {
    const results = await this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE workspace_id = ?
         AND status = 'queued'
         AND next_retry_at IS NOT NULL
         AND next_retry_at <= datetime('now')
         ORDER BY priority DESC, next_retry_at ASC
         LIMIT ?`
      )
      .bind(workspaceId, limit)
      .all();

    return results.results.map(r => this.jobFromRecord(r));
  }

  /**
   * Update job error category
   */
  async updateJobErrorCategory(id: string, category: ErrorCategory): Promise<void> {
    await this.db
      .prepare('UPDATE jobs SET error_category = ? WHERE id = ?')
      .bind(category, id)
      .run();
  }

  /**
   * Get jobs by error category for analysis
   */
  async getJobsByErrorCategory(
    workspaceId: string,
    category: ErrorCategory,
    limit = 50
  ): Promise<Job[]> {
    const results = await this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE workspace_id = ?
         AND error_category = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(workspaceId, category, limit)
      .all();

    return results.results.map(r => this.jobFromRecord(r));
  }

  private jobFromRecord(record: any): Job {
    return {
      id: record.id as string,
      workspace_id: record.workspace_id as string,
      type: record.type as JobType,
      status: record.status as JobStatus,
      progress: record.progress as number,
      created_at: record.created_at as string,
      started_at: record.started_at as string | null,
      completed_at: record.completed_at as string | null,
      result: record.result ? JSON.parse(record.result as string) : undefined,
      error: record.error as string | undefined
    };
  }
}
