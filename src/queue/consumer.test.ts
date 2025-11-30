import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueueMessage } from '../types/queue';

// Mock the Cloudflare types that cause issues
vi.mock('@cloudflare/workers-types', () => ({}));
vi.mock('@cloudflare/sandbox', () => ({}));

// Import after mocking
const { QueueConsumer } = await import('./consumer');

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
  let consumer: any;

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
