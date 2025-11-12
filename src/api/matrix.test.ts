/**
 * Test suite for matrix API endpoints
 *
 * These tests demonstrate the API usage and validate query optimization strategies.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getComparisonMatrix,
  getEvalExecutionDetail,
  getTraceExecutions,
  getEvalExecutions
} from './matrix';

// Mock D1 database for testing
class MockD1Database {
  private data: Record<string, any[]> = {
    traces: [],
    feedback: [],
    evals: [],
    eval_executions: []
  };

  prepare(sql: string) {
    return {
      bind: (...params: any[]) => ({
        all: async () => ({ results: [] }),
        first: async () => null
      })
    };
  }
}

describe('Matrix API', () => {
  let db: any;

  beforeAll(() => {
    db = new MockD1Database();
  });

  describe('GET /api/eval-sets/:id/matrix', () => {
    it('should return empty matrix when no feedback exists', async () => {
      const queryParams = new URLSearchParams({
        eval_ids: 'eval_1,eval_2'
      });

      const response = await getComparisonMatrix(db, 'set_123', queryParams);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.rows).toEqual([]);
      expect(data.stats.total_traces).toBe(0);
    });

    it('should validate required eval_ids parameter', async () => {
      const queryParams = new URLSearchParams({});

      const response = await getComparisonMatrix(db, 'set_123', queryParams);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle pagination cursor', async () => {
      const queryParams = new URLSearchParams({
        eval_ids: 'eval_1',
        cursor: Buffer.from('2025-11-12T10:00:00Z|trace_123').toString('base64'),
        limit: '10'
      });

      const response = await getComparisonMatrix(db, 'set_123', queryParams);
      expect(response.status).toBe(200);
    });

    it('should support filter parameters', async () => {
      const queryParams = new URLSearchParams({
        eval_ids: 'eval_1',
        filter: 'contradictions_only',
        rating: 'positive',
        date_from: '2025-11-01T00:00:00Z',
        date_to: '2025-11-12T23:59:59Z'
      });

      const response = await getComparisonMatrix(db, 'set_123', queryParams);
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/eval-executions/:trace_id/:eval_id', () => {
    it('should return 404 when execution not found', async () => {
      const response = await getEvalExecutionDetail(
        db,
        'trace_123',
        'eval_456'
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/traces/:trace_id/executions', () => {
    it('should return empty array when no executions exist', async () => {
      const response = await getTraceExecutions(db, 'trace_123');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.executions).toEqual([]);
    });
  });

  describe('GET /api/evals/:eval_id/executions', () => {
    it('should support result filtering', async () => {
      const queryParams = new URLSearchParams({
        result: 'true',
        limit: '50'
      });

      const response = await getEvalExecutions(db, 'eval_123', queryParams);
      expect(response.status).toBe(200);
    });

    it('should support error filtering', async () => {
      const queryParams = new URLSearchParams({
        has_error: 'true'
      });

      const response = await getEvalExecutions(db, 'eval_123', queryParams);
      expect(response.status).toBe(200);
    });
  });
});
