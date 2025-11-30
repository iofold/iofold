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
