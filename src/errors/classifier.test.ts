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
