# Job Queue Processing Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance job queue processing with exponential backoff, error classification, retry tracking, and frontend dashboard components.

**Architecture:** Adds error categorization (transient vs permanent), exponential backoff with jitter, enhanced DLQ handling, database schema updates for retry tracking, and frontend job dashboard components.

**Tech Stack:** TypeScript, Cloudflare Workers, D1 SQLite, Next.js, React

---

## Task 1: Create Error Classifier Module

**Files:**
- Create: `src/errors/classifier.ts`
- Test: `src/errors/classifier.test.ts`

**Step 1: Write the failing test**

```typescript
// src/errors/classifier.test.ts
import { describe, it, expect } from 'vitest';
import { classifyError, ErrorCategory, isRetryable } from './classifier';

describe('classifyError', () => {
  it('should classify network timeouts as transient_network', () => {
    const error = new Error('ETIMEDOUT');
    expect(classifyError(error)).toBe('transient_network');
  });

  it('should classify rate limit errors as transient_rate_limit', () => {
    const error = { status: 429, message: 'Rate limit exceeded' };
    expect(classifyError(error)).toBe('transient_rate_limit');
  });

  it('should classify 5xx errors as transient_server', () => {
    const error = { status: 503, message: 'Service unavailable' };
    expect(classifyError(error)).toBe('transient_server');
  });

  it('should classify validation errors as permanent_validation', () => {
    const error = new Error('Insufficient examples for eval generation');
    error.name = 'ValidationError';
    expect(classifyError(error)).toBe('permanent_validation');
  });

  it('should classify 401/403 errors as permanent_auth', () => {
    const error = { status: 401, message: 'Unauthorized' };
    expect(classifyError(error)).toBe('permanent_auth');
  });

  it('should classify 404 errors as permanent_not_found', () => {
    const error = { status: 404, message: 'Not found' };
    expect(classifyError(error)).toBe('permanent_not_found');
  });

  it('should classify unknown errors as unknown', () => {
    const error = new Error('Something weird happened');
    expect(classifyError(error)).toBe('unknown');
  });
});

describe('isRetryable', () => {
  it('should return true for transient errors', () => {
    expect(isRetryable('transient_network')).toBe(true);
    expect(isRetryable('transient_rate_limit')).toBe(true);
    expect(isRetryable('transient_server')).toBe(true);
    expect(isRetryable('transient_db_lock')).toBe(true);
  });

  it('should return false for permanent errors', () => {
    expect(isRetryable('permanent_validation')).toBe(false);
    expect(isRetryable('permanent_auth')).toBe(false);
    expect(isRetryable('permanent_not_found')).toBe(false);
    expect(isRetryable('permanent_security')).toBe(false);
  });

  it('should return true for unknown errors (safe default)', () => {
    expect(isRetryable('unknown')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ygupta/workspace/iofold && npx vitest run src/errors/classifier.test.ts`
Expected: FAIL with "Cannot find module './classifier'"

**Step 3: Write minimal implementation**

```typescript
// src/errors/classifier.ts
/**
 * Error classification for retry logic
 */

export type ErrorCategory =
  | 'transient_network'      // Network timeouts, connection errors
  | 'transient_rate_limit'   // 429 responses
  | 'transient_server'       // 5xx server errors
  | 'transient_db_lock'      // Database lock/busy errors
  | 'permanent_validation'   // Invalid input data
  | 'permanent_auth'         // 401/403 authentication errors
  | 'permanent_not_found'    // 404 resource not found
  | 'permanent_security'     // Security violations (sandbox, imports)
  | 'unknown';               // Unclassified errors

/**
 * Classify an error into a category for retry decisions
 */
export function classifyError(error: unknown): ErrorCategory {
  // Handle error objects with status code
  if (typeof error === 'object' && error !== null) {
    const statusError = error as { status?: number; message?: string; name?: string; code?: string };

    // Check HTTP status codes
    if (statusError.status) {
      if (statusError.status === 429) return 'transient_rate_limit';
      if (statusError.status >= 500 && statusError.status < 600) return 'transient_server';
      if (statusError.status === 401 || statusError.status === 403) return 'permanent_auth';
      if (statusError.status === 404) return 'permanent_not_found';
      if (statusError.status === 400 || statusError.status === 422) return 'permanent_validation';
    }

    // Check error name
    if (statusError.name === 'ValidationError') return 'permanent_validation';
    if (statusError.name === 'SecurityError') return 'permanent_security';

    // Check error code (Node.js style)
    if (statusError.code) {
      const code = statusError.code;
      if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(code)) {
        return 'transient_network';
      }
    }
  }

  // Check error message patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network patterns
    if (message.includes('timeout') || message.includes('etimedout') ||
        message.includes('econnreset') || message.includes('network')) {
      return 'transient_network';
    }

    // Rate limit patterns
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'transient_rate_limit';
    }

    // Database patterns
    if (message.includes('database is locked') || message.includes('busy') ||
        message.includes('d1') && message.includes('lock')) {
      return 'transient_db_lock';
    }

    // Validation patterns
    if (message.includes('insufficient') || message.includes('invalid') ||
        message.includes('required') || message.includes('validation')) {
      return 'permanent_validation';
    }

    // Auth patterns
    if (message.includes('unauthorized') || message.includes('forbidden') ||
        message.includes('api key') || message.includes('authentication')) {
      return 'permanent_auth';
    }

    // Not found patterns
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'permanent_not_found';
    }

    // Security patterns
    if (message.includes('dangerous import') || message.includes('sandbox') ||
        message.includes('security') || message.includes('not allowed')) {
      return 'permanent_security';
    }
  }

  return 'unknown';
}

/**
 * Check if an error category is retryable
 */
export function isRetryable(category: ErrorCategory): boolean {
  return category.startsWith('transient_') || category === 'unknown';
}

/**
 * Get human-readable description for error category
 */
export function getErrorCategoryDescription(category: ErrorCategory): string {
  const descriptions: Record<ErrorCategory, string> = {
    transient_network: 'Network timeout or connection error',
    transient_rate_limit: 'API rate limit exceeded',
    transient_server: 'Server temporarily unavailable',
    transient_db_lock: 'Database temporarily busy',
    permanent_validation: 'Invalid input or insufficient data',
    permanent_auth: 'Authentication or authorization failed',
    permanent_not_found: 'Resource not found',
    permanent_security: 'Security violation detected',
    unknown: 'Unknown error'
  };
  return descriptions[category];
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ygupta/workspace/iofold && npx vitest run src/errors/classifier.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/errors/classifier.ts src/errors/classifier.test.ts
git commit -m "feat(queue): add error classification for retry logic"
```

---

## Task 2: Create Exponential Backoff Module

**Files:**
- Create: `src/retry/backoff.ts`
- Test: `src/retry/backoff.test.ts`

**Step 1: Write the failing test**

```typescript
// src/retry/backoff.test.ts
import { describe, it, expect } from 'vitest';
import { calculateBackoffDelay, RetryConfig, DEFAULT_RETRY_CONFIG } from './backoff';

describe('calculateBackoffDelay', () => {
  const config: RetryConfig = {
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitterFactor: 0, // No jitter for deterministic tests
    rateLimitDelayMs: 30000
  };

  it('should return initialDelayMs for first attempt', () => {
    const delay = calculateBackoffDelay(1, 'transient_network', config);
    expect(delay).toBe(1000);
  });

  it('should double delay for each subsequent attempt', () => {
    expect(calculateBackoffDelay(2, 'transient_network', config)).toBe(2000);
    expect(calculateBackoffDelay(3, 'transient_network', config)).toBe(4000);
    expect(calculateBackoffDelay(4, 'transient_network', config)).toBe(8000);
  });

  it('should cap delay at maxDelayMs', () => {
    expect(calculateBackoffDelay(10, 'transient_network', config)).toBe(60000);
  });

  it('should use rateLimitDelayMs for rate limit errors', () => {
    const delay = calculateBackoffDelay(1, 'transient_rate_limit', config);
    expect(delay).toBe(30000);
  });

  it('should use shorter delay for db lock errors', () => {
    const delay = calculateBackoffDelay(1, 'transient_db_lock', config);
    expect(delay).toBe(100); // Special case for DB locks
  });

  it('should add jitter when jitterFactor > 0', () => {
    const configWithJitter = { ...config, jitterFactor: 0.1 };
    const delays = new Set<number>();

    // Generate multiple delays - with jitter they should vary
    for (let i = 0; i < 10; i++) {
      delays.add(calculateBackoffDelay(1, 'transient_network', configWithJitter));
    }

    // With 10% jitter, delays should be between 900-1100ms
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(900);
      expect(delay).toBeLessThanOrEqual(1100);
    }
  });

  it('should return 0 for permanent errors', () => {
    expect(calculateBackoffDelay(1, 'permanent_validation', config)).toBe(0);
    expect(calculateBackoffDelay(1, 'permanent_auth', config)).toBe(0);
  });
});

describe('DEFAULT_RETRY_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000);
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(60000);
    expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ygupta/workspace/iofold && npx vitest run src/retry/backoff.test.ts`
Expected: FAIL with "Cannot find module './backoff'"

**Step 3: Write minimal implementation**

```typescript
// src/retry/backoff.ts
/**
 * Exponential backoff calculation for job retries
 */

import type { ErrorCategory } from '../errors/classifier';

export interface RetryConfig {
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Random jitter factor (0-1) to prevent thundering herd */
  jitterFactor: number;
  /** Special delay for rate limit errors */
  rateLimitDelayMs: number;
  /** Maximum number of retries */
  maxRetries?: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  initialDelayMs: 1000,      // 1 second
  maxDelayMs: 60000,         // 1 minute
  backoffMultiplier: 2,      // Double each retry
  jitterFactor: 0.1,         // 10% random jitter
  rateLimitDelayMs: 30000,   // 30 seconds for rate limits
  maxRetries: 5
};

/**
 * Calculate the delay before the next retry attempt
 *
 * Formula: min(initialDelay * multiplier^(attempt-1), maxDelay) * (1 + random(jitter))
 *
 * @param attempt Current attempt number (1-based)
 * @param category Error category from classifier
 * @param config Retry configuration
 * @returns Delay in milliseconds, or 0 if should not retry
 */
export function calculateBackoffDelay(
  attempt: number,
  category: ErrorCategory,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  // Permanent errors should not be retried
  if (category.startsWith('permanent_')) {
    return 0;
  }

  // Special case: database lock errors use short, fixed delays
  if (category === 'transient_db_lock') {
    return 100 * attempt; // 100ms, 200ms, 300ms
  }

  // Special case: rate limit errors use longer initial delay
  if (category === 'transient_rate_limit') {
    const baseDelay = config.rateLimitDelayMs;
    const exponentialDelay = baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    return Math.min(exponentialDelay, config.maxDelayMs);
  }

  // Standard exponential backoff
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter
  if (config.jitterFactor > 0) {
    const jitter = 1 + (Math.random() * 2 - 1) * config.jitterFactor;
    return Math.round(cappedDelay * jitter);
  }

  return cappedDelay;
}

/**
 * Check if we should retry based on attempt count and config
 */
export function shouldRetry(
  attempt: number,
  category: ErrorCategory,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
  // Never retry permanent errors
  if (category.startsWith('permanent_')) {
    return false;
  }

  // Check max retries
  const maxRetries = config.maxRetries ?? 5;
  return attempt < maxRetries;
}

/**
 * Create a retry schedule for a job
 */
export function createRetrySchedule(
  category: ErrorCategory,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number[] {
  const maxRetries = config.maxRetries ?? 5;
  const schedule: number[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const delay = calculateBackoffDelay(attempt, category, { ...config, jitterFactor: 0 });
    if (delay === 0) break;
    schedule.push(delay);
  }

  return schedule;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ygupta/workspace/iofold && npx vitest run src/retry/backoff.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/retry/backoff.ts src/retry/backoff.test.ts
git commit -m "feat(queue): add exponential backoff with jitter for retries"
```

---

## Task 3: Create Database Migration for Job Retry Tracking

**Files:**
- Create: `migrations/006_job_retry_tracking.sql`

**Step 1: Write the migration SQL**

```sql
-- migrations/006_job_retry_tracking.sql
-- Migration 006: Add retry tracking and expanded job types
-- Created: 2025-11-30
-- Description: Adds retry_count, max_retries, error_category, and expands job type constraint

-- ============================================================================
-- Step 1: Create new jobs table with updated schema
-- ============================================================================

-- SQLite doesn't support ALTER TABLE for CHECK constraints, so we recreate
CREATE TABLE jobs_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  -- Expanded type constraint to include all job types
  type TEXT NOT NULL CHECK(type IN (
    'import', 'generate', 'execute',
    'monitor', 'auto_refine',
    'agent_discovery', 'prompt_improvement', 'prompt_evaluation',
    'template_drift', 'eval_revalidation'
  )),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN (
    'queued', 'running', 'completed', 'failed', 'cancelled'
  )),
  progress INTEGER NOT NULL DEFAULT 0,

  -- Existing fields
  context JSON,
  metadata JSON,
  result JSON,
  error TEXT,

  -- NEW: Retry tracking fields
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  error_category TEXT,  -- From ErrorCategory type
  last_error_at DATETIME,
  next_retry_at DATETIME,

  -- NEW: Priority for job ordering (higher = process first)
  priority INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,

  -- Foreign keys (from migration 005)
  agent_id TEXT,
  agent_version_id TEXT,
  trigger_event TEXT,
  trigger_threshold TEXT,

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- ============================================================================
-- Step 2: Copy data from old table
-- ============================================================================

INSERT INTO jobs_new (
  id, workspace_id, type, status, progress,
  context, metadata, result, error,
  retry_count, max_retries, priority,
  created_at, started_at, completed_at,
  agent_id, agent_version_id, trigger_event, trigger_threshold
)
SELECT
  id, workspace_id,
  -- Map any unsupported types to 'execute' as fallback
  CASE
    WHEN type IN ('import', 'generate', 'execute') THEN type
    ELSE 'execute'
  END as type,
  status, progress,
  context, metadata, result, error,
  0 as retry_count,  -- Default for existing jobs
  3 as max_retries,  -- Match old behavior
  0 as priority,
  created_at, started_at, completed_at,
  agent_id, agent_version_id, trigger_event, trigger_threshold
FROM jobs;

-- ============================================================================
-- Step 3: Drop old table and rename new
-- ============================================================================

DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;

-- ============================================================================
-- Step 4: Recreate indexes
-- ============================================================================

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_workspace_status ON jobs(workspace_id, status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);

-- NEW: Index for retry scheduling
CREATE INDEX idx_jobs_next_retry ON jobs(next_retry_at) WHERE status = 'queued' AND next_retry_at IS NOT NULL;

-- NEW: Index for priority ordering
CREATE INDEX idx_jobs_priority ON jobs(priority DESC, created_at ASC) WHERE status = 'queued';

-- NEW: Index for error category analysis
CREATE INDEX idx_jobs_error_category ON jobs(error_category) WHERE status = 'failed';

-- ============================================================================
-- Step 5: Create job_retry_history table for audit trail
-- ============================================================================

CREATE TABLE job_retry_history (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  error TEXT NOT NULL,
  error_category TEXT NOT NULL,
  delay_ms INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_retry_history_job ON job_retry_history(job_id);
```

**Step 2: Apply migration**

Run: `cd /home/ygupta/workspace/iofold && wrangler d1 execute iofold_validation --file=migrations/006_job_retry_tracking.sql --local`
Expected: Success message

**Step 3: Verify migration**

Run: `cd /home/ygupta/workspace/iofold && wrangler d1 execute iofold_validation --command="SELECT sql FROM sqlite_master WHERE name='jobs'" --local`
Expected: Shows new table schema with retry_count, max_retries, error_category columns

**Step 4: Commit**

```bash
git add migrations/006_job_retry_tracking.sql
git commit -m "feat(db): add job retry tracking schema (migration 006)"
```

---

## Task 4: Update QueueMessage and DeadLetterMessage Types

**Files:**
- Modify: `src/types/queue.ts`

**Step 1: Update the types file**

```typescript
// Add to src/types/queue.ts after the existing imports

import type { ErrorCategory } from '../errors/classifier';

// Update QueueMessage interface to include retry metadata
export interface QueueMessage {
  /** Unique job identifier */
  job_id: string;
  /** Job type determines which handler processes the message */
  type: JobType | 'monitor' | 'auto_refine' | 'agent_discovery' | 'prompt_improvement' | 'prompt_evaluation' | 'template_drift' | 'eval_revalidation';
  /** Workspace this job belongs to */
  workspace_id: string;
  /** Job-specific payload data */
  payload: JobPayload;
  /** Current attempt number (starts at 1) */
  attempt: number;
  /** ISO timestamp when message was created */
  created_at: string;

  // NEW: Retry metadata
  /** Last error category for retry decisions */
  error_category?: ErrorCategory;
  /** ISO timestamp of last error */
  last_error_at?: string;
  /** Retry history for debugging */
  retry_history?: RetryAttempt[];
}

// NEW: Retry attempt record
export interface RetryAttempt {
  attempt: number;
  error: string;
  error_category: ErrorCategory;
  delay_ms: number;
  timestamp: string;
}

// Update DeadLetterMessage for enhanced debugging
export interface DeadLetterMessage {
  /** Original queue message */
  original_message: QueueMessage;
  /** Error that caused the failure */
  error: string;
  /** Error category for analysis */
  error_category: ErrorCategory;
  /** Final attempt number */
  final_attempt: number;
  /** ISO timestamp when moved to DLQ */
  failed_at: string;
  /** Full retry history */
  retry_history: RetryAttempt[];
  /** Whether this job requires user action */
  requires_user_action: boolean;
  /** Suggested action for resolution */
  suggested_action?: string;
}
```

**Step 2: Run TypeScript check**

Run: `cd /home/ygupta/workspace/iofold && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/types/queue.ts
git commit -m "feat(types): add retry metadata to QueueMessage and DeadLetterMessage"
```

---

## Task 5: Update Queue Consumer with Retry Logic

**Files:**
- Modify: `src/queue/consumer.ts`
- Test: `src/queue/consumer.test.ts`

**Step 1: Write the failing test for retry logic**

```typescript
// Add to src/queue/consumer.test.ts (create if doesn't exist)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueConsumer } from './consumer';
import type { QueueMessage } from '../types/queue';

// Mock dependencies
const mockDb = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  run: vi.fn().mockResolvedValue({}),
  first: vi.fn().mockResolvedValue(null),
  all: vi.fn().mockResolvedValue({ results: [] })
};

const mockDlq = {
  send: vi.fn().mockResolvedValue(undefined)
};

describe('QueueConsumer retry logic', () => {
  let consumer: QueueConsumer;

  beforeEach(() => {
    vi.clearAllMocks();
    consumer = new QueueConsumer({
      db: mockDb as any,
      encryptionKey: 'test-key',
      deadLetterQueue: mockDlq as any
    });
  });

  it('should classify transient errors and schedule retry', async () => {
    const message = createMockMessage({
      type: 'import',
      attempt: 1,
      payload: { type: 'import', integration_id: 'test' }
    });

    // Simulate network timeout
    const timeoutError = new Error('ETIMEDOUT');

    // The consumer should classify this as transient and retry
    const result = await consumer.handleMessageError(message, timeoutError);

    expect(result.shouldRetry).toBe(true);
    expect(result.errorCategory).toBe('transient_network');
    expect(result.delayMs).toBeGreaterThan(0);
  });

  it('should move permanent errors to DLQ immediately', async () => {
    const message = createMockMessage({
      type: 'generate',
      attempt: 1,
      payload: { type: 'generate', agent_id: 'test', name: 'test' }
    });

    // Simulate validation error
    const validationError = new Error('Insufficient examples for eval generation');
    validationError.name = 'ValidationError';

    const result = await consumer.handleMessageError(message, validationError);

    expect(result.shouldRetry).toBe(false);
    expect(result.errorCategory).toBe('permanent_validation');
    expect(result.moveToDlq).toBe(true);
  });

  it('should move to DLQ after max retries exhausted', async () => {
    const message = createMockMessage({
      type: 'import',
      attempt: 5, // Max retries
      payload: { type: 'import', integration_id: 'test' }
    });

    const networkError = new Error('Connection refused');

    const result = await consumer.handleMessageError(message, networkError);

    expect(result.shouldRetry).toBe(false);
    expect(result.moveToDlq).toBe(true);
  });

  it('should record retry history', async () => {
    const message = createMockMessage({
      type: 'import',
      attempt: 2,
      retry_history: [{
        attempt: 1,
        error: 'First failure',
        error_category: 'transient_network',
        delay_ms: 1000,
        timestamp: '2025-11-30T00:00:00Z'
      }],
      payload: { type: 'import', integration_id: 'test' }
    });

    const networkError = new Error('Second timeout');

    const result = await consumer.handleMessageError(message, networkError);

    expect(result.retryHistory).toHaveLength(2);
    expect(result.retryHistory![1].attempt).toBe(2);
  });
});

function createMockMessage(overrides: Partial<QueueMessage>): { body: QueueMessage; ack: () => void; retry: () => void } {
  return {
    body: {
      job_id: 'job_test',
      type: 'import',
      workspace_id: 'ws_test',
      payload: { type: 'import', integration_id: 'test' },
      attempt: 1,
      created_at: new Date().toISOString(),
      ...overrides
    } as QueueMessage,
    ack: vi.fn(),
    retry: vi.fn()
  };
}
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ygupta/workspace/iofold && npx vitest run src/queue/consumer.test.ts`
Expected: FAIL with "handleMessageError is not a function"

**Step 3: Update consumer implementation**

Add the following method to `QueueConsumer` class in `src/queue/consumer.ts`:

```typescript
// Add imports at top of file
import { classifyError, isRetryable, getErrorCategoryDescription, type ErrorCategory } from '../errors/classifier';
import { calculateBackoffDelay, shouldRetry as shouldRetryBackoff, DEFAULT_RETRY_CONFIG } from '../retry/backoff';
import type { RetryAttempt } from '../types/queue';

// Add this interface before the class
export interface MessageErrorResult {
  shouldRetry: boolean;
  moveToDlq: boolean;
  errorCategory: ErrorCategory;
  delayMs: number;
  retryHistory?: RetryAttempt[];
  suggestedAction?: string;
}

// Add this method to QueueConsumer class
/**
 * Handle message error with classification and retry decisions
 */
async handleMessageError(
  message: { body: QueueMessage; ack: () => void; retry: () => void },
  error: unknown
): Promise<MessageErrorResult> {
  const queueMessage = message.body;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCategory = classifyError(error);
  const now = new Date().toISOString();

  // Build retry history
  const retryHistory: RetryAttempt[] = [
    ...(queueMessage.retry_history || []),
    {
      attempt: queueMessage.attempt,
      error: errorMessage,
      error_category: errorCategory,
      delay_ms: 0, // Will be set below if retrying
      timestamp: now
    }
  ];

  // Check if we should retry
  const canRetry = isRetryable(errorCategory) &&
                   shouldRetryBackoff(queueMessage.attempt, errorCategory, DEFAULT_RETRY_CONFIG);

  if (!canRetry) {
    // Move to DLQ
    const suggestedAction = this.getSuggestedAction(errorCategory);

    return {
      shouldRetry: false,
      moveToDlq: true,
      errorCategory,
      delayMs: 0,
      retryHistory,
      suggestedAction
    };
  }

  // Calculate backoff delay
  const delayMs = calculateBackoffDelay(queueMessage.attempt, errorCategory, DEFAULT_RETRY_CONFIG);

  // Update the last retry record with actual delay
  retryHistory[retryHistory.length - 1].delay_ms = delayMs;

  // Record retry attempt in database
  await this.recordRetryAttempt(queueMessage.job_id, queueMessage.attempt, errorMessage, errorCategory, delayMs);

  return {
    shouldRetry: true,
    moveToDlq: false,
    errorCategory,
    delayMs,
    retryHistory
  };
}

/**
 * Record retry attempt in database for audit trail
 */
private async recordRetryAttempt(
  jobId: string,
  attempt: number,
  error: string,
  errorCategory: ErrorCategory,
  delayMs: number
): Promise<void> {
  const id = `retry_${crypto.randomUUID()}`;

  await this.db
    .prepare(
      `INSERT INTO job_retry_history (id, job_id, attempt, error, error_category, delay_ms)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, jobId, attempt, error, errorCategory, delayMs)
    .run();

  // Update job record with retry info
  await this.db
    .prepare(
      `UPDATE jobs SET
       retry_count = ?,
       error_category = ?,
       last_error_at = ?,
       next_retry_at = datetime('now', '+' || ? || ' seconds')
       WHERE id = ?`
    )
    .bind(attempt, errorCategory, new Date().toISOString(), Math.ceil(delayMs / 1000), jobId)
    .run();
}

/**
 * Get suggested action for error category
 */
private getSuggestedAction(category: ErrorCategory): string {
  const actions: Record<ErrorCategory, string> = {
    transient_network: 'Check network connectivity and retry',
    transient_rate_limit: 'Wait for rate limit reset and retry',
    transient_server: 'Wait for service recovery and retry',
    transient_db_lock: 'Retry after a short delay',
    permanent_validation: 'Review input data and fix validation errors',
    permanent_auth: 'Check API credentials and permissions',
    permanent_not_found: 'Verify resource exists before retrying',
    permanent_security: 'Review code for security violations',
    unknown: 'Investigate error and determine appropriate action'
  };
  return actions[category];
}
```

**Step 4: Update processBatch to use new error handling**

Update the `processBatch` method in `src/queue/consumer.ts`:

```typescript
/**
 * Process a batch of queue messages
 * This is the entry point called by Cloudflare Workers queue handler
 */
async processBatch(batch: MessageBatch<QueueMessage>): Promise<ConsumerBatchResult> {
  const result: ConsumerBatchResult = {
    processed: batch.messages.length,
    succeeded: 0,
    failed: 0,
    retried: 0
  };

  console.log(`[QueueConsumer] Processing batch of ${batch.messages.length} messages from ${batch.queue}`);

  for (const message of batch.messages) {
    try {
      await this.processMessage(message);
      message.ack();
      result.succeeded++;
    } catch (error) {
      const errorResult = await this.handleMessageError(message, error);

      if (errorResult.shouldRetry) {
        // Update message with retry metadata before retry
        message.body.attempt++;
        message.body.error_category = errorResult.errorCategory;
        message.body.last_error_at = new Date().toISOString();
        message.body.retry_history = errorResult.retryHistory;

        message.retry();
        result.retried++;
        console.log(
          `[QueueConsumer] Retrying message ${message.id} in ${errorResult.delayMs}ms ` +
          `(attempt ${message.body.attempt}, category: ${errorResult.errorCategory})`
        );
      } else {
        // Move to DLQ
        await this.moveToDeadLetterQueueEnhanced(message.body, error, errorResult);
        message.ack();
        result.failed++;
      }
    }
  }

  console.log(
    `[QueueConsumer] Batch complete: ${result.succeeded} succeeded, ${result.retried} retried, ${result.failed} failed`
  );

  return result;
}

/**
 * Move failed message to dead letter queue with enhanced metadata
 */
private async moveToDeadLetterQueueEnhanced(
  message: QueueMessage,
  error: unknown,
  errorResult: MessageErrorResult
): Promise<void> {
  console.log(`[QueueConsumer] Moving job ${message.job_id} to dead letter queue (${errorResult.errorCategory})`);

  const errorMessage = error instanceof Error ? error.message : String(error);
  const requiresUserAction = errorResult.errorCategory.startsWith('permanent_');

  const dlqMessage: DeadLetterMessage = {
    original_message: message,
    error: errorMessage,
    error_category: errorResult.errorCategory,
    final_attempt: message.attempt,
    failed_at: new Date().toISOString(),
    retry_history: errorResult.retryHistory || [],
    requires_user_action: requiresUserAction,
    suggested_action: errorResult.suggestedAction
  };

  if (this.deadLetterQueue) {
    await this.deadLetterQueue.send(dlqMessage);
  } else {
    console.error(`[QueueConsumer] DLQ not configured, job ${message.job_id} permanently failed:`, dlqMessage);
  }

  // Update job status to failed with enhanced DLQ info
  await this.db
    .prepare(
      `UPDATE jobs SET
       status = 'failed',
       error = ?,
       error_category = ?,
       completed_at = ?,
       metadata = json_set(
         COALESCE(metadata, '{}'),
         '$.moved_to_dlq', true,
         '$.final_attempt', ?,
         '$.requires_user_action', ?,
         '$.suggested_action', ?
       )
       WHERE id = ?`
    )
    .bind(
      `Failed after ${message.attempt} attempts: ${errorMessage}`,
      errorResult.errorCategory,
      new Date().toISOString(),
      message.attempt,
      requiresUserAction,
      errorResult.suggestedAction || null,
      message.job_id
    )
    .run();
}
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ygupta/workspace/iofold && npx vitest run src/queue/consumer.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/queue/consumer.ts src/queue/consumer.test.ts
git commit -m "feat(queue): implement exponential backoff and error classification in consumer"
```

---

## Task 6: Update JobManager with Retry Tracking

**Files:**
- Modify: `src/jobs/job-manager.ts`
- Test: `src/jobs/job-manager.test.ts`

**Step 1: Write the failing test**

```typescript
// Add to src/jobs/job-manager.test.ts
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
      maxRetries: 3
    });

    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('max_retries')
    );
  });

  it('should get job retry history', async () => {
    mockDb.all.mockResolvedValueOnce({
      results: [
        { attempt: 1, error: 'Network timeout', error_category: 'transient_network', delay_ms: 1000 },
        { attempt: 2, error: 'Network timeout', error_category: 'transient_network', delay_ms: 2000 }
      ]
    });

    const history = await jobManager.getJobRetryHistory('job_123');

    expect(history).toHaveLength(2);
    expect(history[0].error_category).toBe('transient_network');
  });

  it('should list jobs pending retry', async () => {
    mockDb.all.mockResolvedValueOnce({
      results: [
        { id: 'job_1', status: 'queued', next_retry_at: '2025-11-30T12:00:00Z' },
        { id: 'job_2', status: 'queued', next_retry_at: '2025-11-30T12:01:00Z' }
      ]
    });

    const jobs = await jobManager.listJobsPendingRetry('ws_test');

    expect(jobs).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ygupta/workspace/iofold && npx vitest run src/jobs/job-manager.test.ts`
Expected: FAIL

**Step 3: Update job-manager.ts implementation**

```typescript
// Add these methods to JobManager class in src/jobs/job-manager.ts

import type { ErrorCategory } from '../errors/classifier';

// Update createJob to include retry configuration
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
    type,
    status: 'queued',
    progress: 0,
    created_at: now,
    started_at: null,
    completed_at: null
  };
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
```

**Step 4: Run test to verify it passes**

Run: `cd /home/ygupta/workspace/iofold && npx vitest run src/jobs/job-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/jobs/job-manager.ts src/jobs/job-manager.test.ts
git commit -m "feat(jobs): add retry tracking to JobManager"
```

---

## Task 7: Add API Endpoint for Job Retry History

**Files:**
- Modify: `src/api/jobs.ts`

**Step 1: Add the retry history endpoint**

Add to `src/api/jobs.ts`:

```typescript
// Add this route handler method to JobsAPI class

/**
 * GET /api/jobs/:id/retries - Get retry history for a job
 */
async getJobRetries(request: Request, { params }: { params: { id: string } }): Promise<Response> {
  const jobId = params.id;

  // Verify job exists
  const job = await this.jobManager.getJob(jobId);
  if (!job) {
    return notFoundError('Job', jobId);
  }

  // Get retry history
  const retries = await this.jobManager.getJobRetryHistory(jobId);

  return new Response(JSON.stringify({
    job_id: jobId,
    total_attempts: retries.length,
    retries: retries.map(r => ({
      attempt: r.attempt,
      error: r.error,
      error_category: r.error_category,
      delay_ms: r.delay_ms,
      timestamp: r.created_at
    }))
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * POST /api/jobs/:id/retry - Manually retry a failed job
 */
async retryJob(request: Request, { params }: { params: { id: string } }): Promise<Response> {
  const jobId = params.id;

  // Verify job exists and is failed
  const job = await this.jobManager.getJob(jobId);
  if (!job) {
    return notFoundError('Job', jobId);
  }

  if (job.status !== 'failed') {
    return createAPIError('INVALID_STATE', `Cannot retry job with status ${job.status}`, 400);
  }

  // Reset job status to queued
  await this.db
    .prepare(
      `UPDATE jobs SET
       status = 'queued',
       progress = 0,
       error = NULL,
       error_category = NULL,
       retry_count = retry_count + 1,
       next_retry_at = datetime('now'),
       completed_at = NULL
       WHERE id = ?`
    )
    .bind(jobId)
    .run();

  // Re-enqueue to queue (if queue binding available)
  // This would typically be done via the producer

  return new Response(JSON.stringify({
    success: true,
    job_id: jobId,
    message: 'Job queued for retry'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

**Step 2: Register routes**

Update the router in `src/api/jobs.ts` to include new routes:

```typescript
// In the route registration section, add:
router.get('/api/jobs/:id/retries', (req, ctx) => api.getJobRetries(req, ctx));
router.post('/api/jobs/:id/retry', (req, ctx) => api.retryJob(req, ctx));
```

**Step 3: Commit**

```bash
git add src/api/jobs.ts
git commit -m "feat(api): add job retry history and manual retry endpoints"
```

---

## Task 8: Create Frontend Job Queue Dashboard Component

**Files:**
- Create: `frontend/components/jobs/job-queue-dashboard.tsx`
- Create: `frontend/components/jobs/job-retry-badge.tsx`

**Step 1: Create JobRetryBadge component**

```typescript
// frontend/components/jobs/job-retry-badge.tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle, Clock, RefreshCw, XCircle } from 'lucide-react';

interface JobRetryBadgeProps {
  status: string;
  retryCount?: number;
  maxRetries?: number;
  errorCategory?: string;
}

export function JobRetryBadge({ status, retryCount = 0, maxRetries = 5, errorCategory }: JobRetryBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'completed':
        return { icon: CheckCircle, color: 'bg-success/10 text-success', label: 'Completed' };
      case 'failed':
        return { icon: XCircle, color: 'bg-error/10 text-error', label: 'Failed' };
      case 'running':
        return { icon: RefreshCw, color: 'bg-primary/10 text-primary', label: 'Running' };
      case 'queued':
        return { icon: Clock, color: 'bg-warning/10 text-warning', label: retryCount > 0 ? `Retry ${retryCount}/${maxRetries}` : 'Queued' };
      case 'cancelled':
        return { icon: XCircle, color: 'bg-muted text-muted-foreground', label: 'Cancelled' };
      default:
        return { icon: AlertTriangle, color: 'bg-muted text-muted-foreground', label: status };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const getErrorCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      transient_network: 'Network Error',
      transient_rate_limit: 'Rate Limited',
      transient_server: 'Server Error',
      transient_db_lock: 'DB Busy',
      permanent_validation: 'Validation Error',
      permanent_auth: 'Auth Failed',
      permanent_not_found: 'Not Found',
      permanent_security: 'Security Error',
      unknown: 'Unknown Error'
    };
    return labels[category] || category;
  };

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant="outline" className={`${config.color} gap-1`}>
          <Icon className="h-3 w-3" />
          {config.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-sm">
          <p><strong>Status:</strong> {status}</p>
          {retryCount > 0 && <p><strong>Retries:</strong> {retryCount}/{maxRetries}</p>}
          {errorCategory && <p><strong>Error:</strong> {getErrorCategoryLabel(errorCategory)}</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
```

**Step 2: Create JobQueueDashboard component**

```typescript
// frontend/components/jobs/job-queue-dashboard.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { JobRetryBadge } from './job-retry-badge';
import { RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Job {
  id: string;
  type: string;
  status: string;
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error?: string;
  error_category?: string;
  retry_count?: number;
  max_retries?: number;
}

interface JobQueueDashboardProps {
  workspaceId: string;
  refreshInterval?: number;
}

export function JobQueueDashboard({ workspaceId, refreshInterval = 5000 }: JobQueueDashboardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0
  });

  const fetchJobs = async () => {
    try {
      const response = await fetch(`/api/jobs?limit=20`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);

        // Calculate stats
        const newStats = { queued: 0, running: 0, completed: 0, failed: 0 };
        (data.jobs || []).forEach((job: Job) => {
          if (job.status in newStats) {
            newStats[job.status as keyof typeof newStats]++;
          }
        });
        setStats(newStats);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const handleRetry = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, { method: 'POST' });
      if (response.ok) {
        fetchJobs(); // Refresh list
      }
    } catch (error) {
      console.error('Failed to retry job:', error);
    }
  };

  const getJobTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      import: 'Import Traces',
      generate: 'Generate Eval',
      execute: 'Execute Eval',
      agent_discovery: 'Discover Agents',
      prompt_improvement: 'Improve Prompt',
      prompt_evaluation: 'Evaluate Prompt',
      monitor: 'Monitor',
      auto_refine: 'Auto Refine'
    };
    return labels[type] || type;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Job Queue</CardTitle>
          <CardDescription>Background job processing status</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchJobs}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10">
            <Clock className="h-5 w-5 text-warning" />
            <div>
              <p className="text-2xl font-bold">{stats.queued}</p>
              <p className="text-xs text-muted-foreground">Queued</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10">
            <RefreshCw className="h-5 w-5 text-primary animate-spin" />
            <div>
              <p className="text-2xl font-bold">{stats.running}</p>
              <p className="text-xs text-muted-foreground">Running</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10">
            <CheckCircle className="h-5 w-5 text-success" />
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10">
            <XCircle className="h-5 w-5 text-error" />
            <div>
              <p className="text-2xl font-bold">{stats.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>
        </div>

        {/* Job List */}
        <div className="space-y-3">
          {loading ? (
            <p className="text-muted-foreground text-center py-4">Loading jobs...</p>
          ) : jobs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No jobs in queue</p>
          ) : (
            jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{getJobTypeLabel(job.type)}</span>
                    <JobRetryBadge
                      status={job.status}
                      retryCount={job.retry_count}
                      maxRetries={job.max_retries}
                      errorCategory={job.error_category}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{job.id.slice(0, 12)}...</span>
                    <span>{formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</span>
                  </div>
                  {job.status === 'running' && (
                    <Progress value={job.progress} className="h-1 mt-2" />
                  )}
                  {job.error && (
                    <p className="text-xs text-error mt-1 truncate max-w-md">{job.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {job.status === 'failed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRetry(job.id)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Export components**

```typescript
// frontend/components/jobs/index.ts
export { JobQueueDashboard } from './job-queue-dashboard';
export { JobRetryBadge } from './job-retry-badge';
```

**Step 4: Commit**

```bash
git add frontend/components/jobs/
git commit -m "feat(frontend): add job queue dashboard with retry support"
```

---

## Task 9: Add Job Queue Section to System Page

**Files:**
- Modify: `frontend/app/system/page.tsx`

**Step 1: Import and add JobQueueDashboard**

Add to `frontend/app/system/page.tsx`:

```typescript
// Add import at top
import { JobQueueDashboard } from '@/components/jobs';

// Add in the page component, after existing sections
<section className="mt-8">
  <JobQueueDashboard workspaceId="default" refreshInterval={5000} />
</section>
```

**Step 2: Commit**

```bash
git add frontend/app/system/page.tsx
git commit -m "feat(system): add job queue dashboard to system monitoring page"
```

---

## Task 10: Update Progress Log and Run Tests

**Files:**
- Modify: `docs/progress_log.md`

**Step 1: Update progress log**

Add entry to `docs/progress_log.md`:

```markdown
## 2025-11-30

### Job Queue Processing Enhancements

Implemented comprehensive job queue processing improvements:

**Backend Changes:**
- Created error classification module (`src/errors/classifier.ts`) with transient vs permanent error categorization
- Implemented exponential backoff with jitter (`src/retry/backoff.ts`)
- Added database migration 006 for retry tracking (retry_count, max_retries, error_category, job_retry_history table)
- Updated QueueMessage and DeadLetterMessage types with retry metadata
- Enhanced QueueConsumer with intelligent retry logic and DLQ handling
- Updated JobManager with retry history tracking
- Added API endpoints for retry history and manual retry

**Frontend Changes:**
- Created JobRetryBadge component for status display with error info
- Created JobQueueDashboard component with stats overview and job list
- Added retry functionality to failed jobs
- Integrated dashboard into System monitoring page

**Files Changed:**
- src/errors/classifier.ts (new)
- src/retry/backoff.ts (new)
- migrations/006_job_retry_tracking.sql (new)
- src/types/queue.ts
- src/queue/consumer.ts
- src/jobs/job-manager.ts
- src/api/jobs.ts
- frontend/components/jobs/ (new)
- frontend/app/system/page.tsx
```

**Step 2: Run all tests**

Run: `cd /home/ygupta/workspace/iofold && pnpm test`
Expected: All tests pass

**Step 3: Run TypeScript check**

Run: `cd /home/ygupta/workspace/iofold && npx tsc --noEmit`
Expected: No type errors

**Step 4: Final commit**

```bash
git add docs/progress_log.md
git commit -m "docs: update progress log with job queue enhancements"
```

---

## Summary

This plan implements:

1. **Error Classification** - Categorizes errors as transient (retryable) or permanent (move to DLQ)
2. **Exponential Backoff** - Intelligent retry delays with jitter to prevent thundering herd
3. **Database Schema** - New migration with retry tracking columns and history table
4. **Enhanced Queue Consumer** - Full retry logic with error classification integration
5. **API Endpoints** - Retry history and manual retry capabilities
6. **Frontend Dashboard** - Visual job queue monitoring with retry support

Total: 10 tasks, each with TDD approach (test first, then implement)
