import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobManager } from './job-manager';

const mockDb = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  run: vi.fn().mockResolvedValue({}),
  first: vi.fn(),
  all: vi.fn().mockResolvedValue({ results: [] })
};

describe('JobManager retry tracking', () => {
  let jobManager: JobManager;

  beforeEach(() => {
    vi.clearAllMocks();
    jobManager = new JobManager(mockDb as any);
  });

  it('should create job with retry configuration', async () => {
    const job = await jobManager.createJob('import', 'ws_test', {
      integrationId: 'int_123',
      maxRetries: 3,
      priority: 10
    });

    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('max_retries')
    );
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('priority')
    );
    expect(mockDb.bind).toHaveBeenCalledWith(
      expect.anything(), // id
      'ws_test',
      'import',
      'queued',
      0,
      expect.any(String), // metadata JSON
      3, // maxRetries
      10, // priority
      expect.any(String) // created_at
    );
  });

  it('should create job with default retry configuration', async () => {
    const job = await jobManager.createJob('import', 'ws_test', {
      integrationId: 'int_123'
    });

    expect(mockDb.bind).toHaveBeenCalledWith(
      expect.anything(), // id
      'ws_test',
      'import',
      'queued',
      0,
      expect.any(String), // metadata JSON
      5, // default maxRetries
      0, // default priority
      expect.any(String) // created_at
    );
  });

  it('should get job retry history', async () => {
    mockDb.all.mockResolvedValueOnce({
      results: [
        {
          attempt: 1,
          error: 'Network timeout',
          error_category: 'transient_network',
          delay_ms: 1000,
          created_at: '2025-11-30T12:00:00Z'
        },
        {
          attempt: 2,
          error: 'Network timeout',
          error_category: 'transient_network',
          delay_ms: 2000,
          created_at: '2025-11-30T12:00:01Z'
        }
      ]
    });

    const history = await jobManager.getJobRetryHistory('job_123');

    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('FROM job_retry_history')
    );
    expect(mockDb.bind).toHaveBeenCalledWith('job_123');
    expect(history).toHaveLength(2);
    expect(history[0].error_category).toBe('transient_network');
    expect(history[0].delay_ms).toBe(1000);
    expect(history[1].attempt).toBe(2);
  });

  it('should list jobs pending retry', async () => {
    mockDb.all.mockResolvedValueOnce({
      results: [
        {
          id: 'job_1',
          type: 'import',
          status: 'queued',
          progress: 0,
          next_retry_at: '2025-11-30T12:00:00Z',
          created_at: '2025-11-30T11:00:00Z',
          started_at: null,
          completed_at: null
        },
        {
          id: 'job_2',
          type: 'generate',
          status: 'queued',
          progress: 0,
          next_retry_at: '2025-11-30T12:01:00Z',
          created_at: '2025-11-30T11:01:00Z',
          started_at: null,
          completed_at: null
        }
      ]
    });

    const jobs = await jobManager.listJobsPendingRetry('ws_test');

    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('next_retry_at IS NOT NULL')
    );
    expect(mockDb.bind).toHaveBeenCalledWith('ws_test', 50);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].id).toBe('job_1');
    expect(jobs[1].id).toBe('job_2');
  });

  it('should list jobs pending retry with custom limit', async () => {
    mockDb.all.mockResolvedValueOnce({ results: [] });

    await jobManager.listJobsPendingRetry('ws_test', 10);

    expect(mockDb.bind).toHaveBeenCalledWith('ws_test', 10);
  });

  it('should update job error category', async () => {
    await jobManager.updateJobErrorCategory('job_123', 'transient_network');

    expect(mockDb.prepare).toHaveBeenCalledWith(
      'UPDATE jobs SET error_category = ? WHERE id = ?'
    );
    expect(mockDb.bind).toHaveBeenCalledWith('transient_network', 'job_123');
    expect(mockDb.run).toHaveBeenCalled();
  });

  it('should get jobs by error category', async () => {
    mockDb.all.mockResolvedValueOnce({
      results: [
        {
          id: 'job_1',
          type: 'import',
          status: 'failed',
          progress: 50,
          error_category: 'transient_network',
          created_at: '2025-11-30T11:00:00Z',
          started_at: '2025-11-30T11:00:01Z',
          completed_at: '2025-11-30T11:00:05Z',
          error: 'Network timeout'
        },
        {
          id: 'job_2',
          type: 'generate',
          status: 'failed',
          progress: 0,
          error_category: 'transient_network',
          created_at: '2025-11-30T11:01:00Z',
          started_at: null,
          completed_at: '2025-11-30T11:01:01Z',
          error: 'ETIMEDOUT'
        }
      ]
    });

    const jobs = await jobManager.getJobsByErrorCategory('ws_test', 'transient_network');

    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('error_category = ?')
    );
    expect(mockDb.bind).toHaveBeenCalledWith('ws_test', 'transient_network', 50);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].id).toBe('job_1');
    expect(jobs[0].error).toBe('Network timeout');
  });

  it('should get jobs by error category with custom limit', async () => {
    mockDb.all.mockResolvedValueOnce({ results: [] });

    await jobManager.getJobsByErrorCategory('ws_test', 'permanent_validation', 25);

    expect(mockDb.bind).toHaveBeenCalledWith('ws_test', 'permanent_validation', 25);
  });
});
