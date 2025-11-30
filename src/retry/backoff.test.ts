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
