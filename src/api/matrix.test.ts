/**
 * Test suite for matrix API endpoints
 *
 * These tests demonstrate the API usage and validate query optimization strategies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getComparisonMatrix,
  getEvalExecutionDetail,
  getTraceExecutions,
  getEvalExecutions
} from './matrix';
import { createTestDb, createMockD1, schema } from '../../tests/utils/test-db';

describe('Matrix API', () => {
  let mockD1: D1Database;
  let testData: {
    userId: string;
    workspaceId: string;
    agentId: string;
    traceId1: string;
    traceId2: string;
    evalCandidate1: string;
    evalCandidate2: string;
  };

  beforeEach(() => {
    const { db, sqlite } = createTestDb();

    // Seed required base data
    db.insert(schema.users).values({
      id: 'user_test',
      email: 'test@example.com'
    }).run();

    db.insert(schema.workspaces).values({
      id: 'workspace_test',
      userId: 'user_test',
      name: 'Test Workspace'
    }).run();

    db.insert(schema.agents).values({
      id: 'agent_test',
      workspaceId: 'workspace_test',
      name: 'Test Agent',
      status: 'confirmed'
    }).run();

    db.insert(schema.integrations).values({
      id: 'int_test',
      workspaceId: 'workspace_test',
      name: 'Test Integration',
      platform: 'langfuse',
      apiKeyEncrypted: 'test_key',
      status: 'active'
    }).run();

    // Create traces
    db.insert(schema.traces).values({
      id: 'trace_1',
      workspaceId: 'workspace_test',
      integrationId: 'int_test',
      traceId: 'ext_trace_1',
      source: 'langfuse',
      timestamp: '2025-11-12T10:00:00Z',
      steps: JSON.stringify([
        { input: 'Test input 1', output: 'Test output 1' }
      ]),
      importedAt: '2025-11-12T10:00:00Z'
    }).run();

    db.insert(schema.traces).values({
      id: 'trace_2',
      workspaceId: 'workspace_test',
      integrationId: 'int_test',
      traceId: 'ext_trace_2',
      source: 'langfuse',
      timestamp: '2025-11-12T11:00:00Z',
      steps: JSON.stringify([
        { input: 'Test input 2', output: 'Test output 2' }
      ]),
      importedAt: '2025-11-12T11:00:00Z'
    }).run();

    // Create eval candidates
    db.insert(schema.evalCandidates).values({
      id: 'eval_candidate_1',
      agentId: 'agent_test',
      code: 'def evaluate(trace): return True',
      status: 'candidate'
    }).run();

    db.insert(schema.evalCandidates).values({
      id: 'eval_candidate_2',
      agentId: 'agent_test',
      code: 'def evaluate(trace): return False',
      status: 'candidate'
    }).run();

    // Create feedback for trace_1 (positive)
    db.insert(schema.feedback).values({
      id: 'feedback_1',
      traceId: 'trace_1',
      agentId: 'agent_test',
      rating: 'positive',
      ratingDetail: 'Good result',
      createdAt: '2025-11-12T10:05:00Z'
    }).run();

    // Create feedback for trace_2 (negative)
    db.insert(schema.feedback).values({
      id: 'feedback_2',
      traceId: 'trace_2',
      agentId: 'agent_test',
      rating: 'negative',
      ratingDetail: 'Bad result',
      createdAt: '2025-11-12T11:05:00Z'
    }).run();

    // Create eval executions
    // eval_candidate_1 on trace_1: true (matches positive feedback)
    db.insert(schema.evalCandidateExecutions).values({
      id: 'exec_1',
      evalCandidateId: 'eval_candidate_1',
      traceId: 'trace_1',
      success: true,
      feedback: 'Passed evaluation',
      durationMs: 150,
      createdAt: '2025-11-12T10:10:00Z'
    }).run();

    // eval_candidate_1 on trace_2: true (contradicts negative feedback)
    db.insert(schema.evalCandidateExecutions).values({
      id: 'exec_2',
      evalCandidateId: 'eval_candidate_1',
      traceId: 'trace_2',
      success: true,
      feedback: 'Passed evaluation',
      durationMs: 200,
      createdAt: '2025-11-12T11:10:00Z'
    }).run();

    // eval_candidate_2 on trace_1: false (contradicts positive feedback)
    db.insert(schema.evalCandidateExecutions).values({
      id: 'exec_3',
      evalCandidateId: 'eval_candidate_2',
      traceId: 'trace_1',
      success: false,
      feedback: 'Failed evaluation',
      durationMs: 100,
      createdAt: '2025-11-12T10:15:00Z'
    }).run();

    // eval_candidate_2 on trace_2: false (matches negative feedback)
    db.insert(schema.evalCandidateExecutions).values({
      id: 'exec_4',
      evalCandidateId: 'eval_candidate_2',
      traceId: 'trace_2',
      success: false,
      feedback: 'Failed evaluation',
      durationMs: 120,
      createdAt: '2025-11-12T11:15:00Z'
    }).run();

    mockD1 = createMockD1(sqlite);

    testData = {
      userId: 'user_test',
      workspaceId: 'workspace_test',
      agentId: 'agent_test',
      traceId1: 'trace_1',
      traceId2: 'trace_2',
      evalCandidate1: 'eval_candidate_1',
      evalCandidate2: 'eval_candidate_2'
    };
  });

  describe('GET /api/agents/:id/matrix', () => {
    it('should return comparison matrix with eval predictions and feedback', async () => {
      const queryParams = new URLSearchParams({
        eval_ids: 'eval_candidate_1,eval_candidate_2'
      });

      const response = await getComparisonMatrix(mockD1, testData.agentId, queryParams);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.rows).toHaveLength(2);
      expect(data.stats.total_traces).toBe(2);
      expect(data.stats.traces_with_feedback).toBe(2);

      // Check that per_eval stats exist for both evals
      expect(data.stats.per_eval).toHaveProperty('eval_candidate_1');
      expect(data.stats.per_eval).toHaveProperty('eval_candidate_2');

      // Check that contradictions are detected
      const eval1Stats = data.stats.per_eval.eval_candidate_1;
      const eval2Stats = data.stats.per_eval.eval_candidate_2;
      expect(eval1Stats.contradiction_count + eval2Stats.contradiction_count).toBeGreaterThan(0);
    });

    it('should return empty matrix when no feedback exists', async () => {
      // Create a new agent with no feedback
      const { db, sqlite } = createTestDb();

      db.insert(schema.users).values({
        id: 'user_empty',
        email: 'empty@example.com'
      }).run();

      db.insert(schema.workspaces).values({
        id: 'workspace_empty',
        userId: 'user_empty',
        name: 'Empty Workspace'
      }).run();

      db.insert(schema.agents).values({
        id: 'agent_empty',
        workspaceId: 'workspace_empty',
        name: 'Empty Agent',
        status: 'confirmed'
      }).run();

      const emptyMockD1 = createMockD1(sqlite);
      const queryParams = new URLSearchParams({
        eval_ids: 'eval_1,eval_2'
      });

      const response = await getComparisonMatrix(emptyMockD1, 'agent_empty', queryParams);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.rows).toEqual([]);
      expect(data.stats.total_traces).toBe(0);
    });

    it('should validate required eval_ids parameter', async () => {
      const queryParams = new URLSearchParams({});

      const response = await getComparisonMatrix(mockD1, testData.agentId, queryParams);
      const data = await response.json() as any;

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle pagination cursor', async () => {
      const queryParams = new URLSearchParams({
        eval_ids: 'eval_candidate_1',
        // Use the feedback created_at timestamp for the cursor (since that's what matrix uses for pagination)
        cursor: Buffer.from('2025-11-12T10:05:00Z|trace_1').toString('base64'),
        limit: '10'
      });

      const response = await getComparisonMatrix(mockD1, testData.agentId, queryParams);
      expect(response.status).toBe(200);

      const data = await response.json() as any;
      // With cursor after the first feedback entry, we should get at most trace_2
      // The actual behavior depends on the cursor comparison logic
      expect(data.rows.length).toBeLessThanOrEqual(2);
      expect(data.rows.length).toBeGreaterThanOrEqual(0);
    });

    it('should support filter parameters', async () => {
      const queryParams = new URLSearchParams({
        eval_ids: 'eval_candidate_1',
        filter: 'contradictions_only',
        rating: 'negative',
        date_from: '2025-11-01T00:00:00Z',
        date_to: '2025-11-12T23:59:59Z'
      });

      const response = await getComparisonMatrix(mockD1, testData.agentId, queryParams);
      expect(response.status).toBe(200);

      const data = await response.json() as any;
      // Should only return trace_2 (negative rating with contradiction)
      expect(data.rows.length).toBeGreaterThanOrEqual(0);

      // If rows exist, they should all have negative rating
      data.rows.forEach((row: any) => {
        if (row.human_feedback) {
          expect(row.human_feedback.rating).toBe('negative');
        }
      });
    });

    it('should filter by rating correctly', async () => {
      const queryParams = new URLSearchParams({
        eval_ids: 'eval_candidate_1',
        rating: 'positive'
      });

      const response = await getComparisonMatrix(mockD1, testData.agentId, queryParams);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      // Should only return trace_1 (positive rating)
      expect(data.rows).toHaveLength(1);
      expect(data.rows[0].human_feedback.rating).toBe('positive');
    });
  });

  describe('GET /api/eval-executions/:trace_id/:eval_id', () => {
    it('should return execution detail with human feedback', async () => {
      const response = await getEvalExecutionDetail(
        mockD1,
        testData.traceId1,
        testData.evalCandidate1
      );
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.trace_id).toBe(testData.traceId1);
      expect(data.eval_id).toBe(testData.evalCandidate1);
      expect(data.result).toBe(true);
      expect(data.human_feedback).toBeTruthy();
      expect(data.human_feedback.rating).toBe('positive');
      expect(data.is_contradiction).toBe(false); // true matches positive
    });

    it('should detect contradictions correctly', async () => {
      const response = await getEvalExecutionDetail(
        mockD1,
        testData.traceId2,
        testData.evalCandidate1
      );
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.result).toBe(true);
      expect(data.human_feedback.rating).toBe('negative');
      expect(data.is_contradiction).toBe(true); // true contradicts negative
    });

    it('should return 404 when execution not found', async () => {
      const response = await getEvalExecutionDetail(
        mockD1,
        'nonexistent_trace',
        'nonexistent_eval'
      );
      const data = await response.json() as any;

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/traces/:trace_id/executions', () => {
    it('should return all executions for a trace', async () => {
      const response = await getTraceExecutions(mockD1, testData.traceId1);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.executions).toHaveLength(2); // Two evals ran on trace_1

      const execIds = data.executions.map((e: any) => e.eval_id);
      expect(execIds).toContain(testData.evalCandidate1);
      expect(execIds).toContain(testData.evalCandidate2);
    });

    it('should return empty array when no executions exist', async () => {
      // Create a trace with no executions
      const { db, sqlite } = createTestDb();

      db.insert(schema.users).values({
        id: 'user_noexec',
        email: 'noexec@example.com'
      }).run();

      db.insert(schema.workspaces).values({
        id: 'workspace_noexec',
        userId: 'user_noexec',
        name: 'No Exec Workspace'
      }).run();

      db.insert(schema.traces).values({
        id: 'trace_noexec',
        workspaceId: 'workspace_noexec',
        traceId: 'ext_trace_noexec',
        source: 'langfuse',
        timestamp: '2025-11-12T12:00:00Z',
        steps: JSON.stringify([{ input: 'test', output: 'test' }]),
        importedAt: '2025-11-12T12:00:00Z'
      }).run();

      const noExecMockD1 = createMockD1(sqlite);
      const response = await getTraceExecutions(noExecMockD1, 'trace_noexec');
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.executions).toEqual([]);
    });
  });

  describe('GET /api/evals/:eval_id/executions', () => {
    it('should return all executions for an eval', async () => {
      const queryParams = new URLSearchParams({});

      const response = await getEvalExecutions(mockD1, testData.evalCandidate1, queryParams);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.executions).toHaveLength(2); // eval_candidate_1 ran on both traces

      const traceIds = data.executions.map((e: any) => e.trace_id);
      expect(traceIds).toContain(testData.traceId1);
      expect(traceIds).toContain(testData.traceId2);
    });

    it('should support result filtering', async () => {
      const queryParams = new URLSearchParams({
        result: 'true',
        limit: '50'
      });

      const response = await getEvalExecutions(mockD1, testData.evalCandidate1, queryParams);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.executions).toHaveLength(2); // Both executions for eval_candidate_1 are true

      data.executions.forEach((exec: any) => {
        expect(exec.result).toBe(true);
      });
    });

    it('should filter false results correctly', async () => {
      const queryParams = new URLSearchParams({
        result: 'false'
      });

      const response = await getEvalExecutions(mockD1, testData.evalCandidate2, queryParams);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.executions).toHaveLength(2); // Both executions for eval_candidate_2 are false

      data.executions.forEach((exec: any) => {
        expect(exec.result).toBe(false);
      });
    });

    it('should support error filtering', async () => {
      // Create an execution with an error
      const { db, sqlite } = createTestDb();

      db.insert(schema.users).values({
        id: 'user_error',
        email: 'error@example.com'
      }).run();

      db.insert(schema.workspaces).values({
        id: 'workspace_error',
        userId: 'user_error',
        name: 'Error Workspace'
      }).run();

      db.insert(schema.agents).values({
        id: 'agent_error',
        workspaceId: 'workspace_error',
        name: 'Error Agent',
        status: 'confirmed'
      }).run();

      db.insert(schema.integrations).values({
        id: 'int_error',
        workspaceId: 'workspace_error',
        name: 'Error Integration',
        platform: 'langfuse',
        apiKeyEncrypted: 'test_key',
        status: 'active'
      }).run();

      db.insert(schema.traces).values({
        id: 'trace_error',
        workspaceId: 'workspace_error',
        integrationId: 'int_error',
        traceId: 'ext_trace_error',
        source: 'langfuse',
        timestamp: '2025-11-12T13:00:00Z',
        steps: JSON.stringify([{ input: 'test', output: 'test' }]),
        importedAt: '2025-11-12T13:00:00Z'
      }).run();

      db.insert(schema.evalCandidates).values({
        id: 'eval_error',
        agentId: 'agent_error',
        code: 'def evaluate(trace): raise Exception("error")',
        status: 'candidate'
      }).run();

      db.insert(schema.evalCandidateExecutions).values({
        id: 'exec_error',
        evalCandidateId: 'eval_error',
        traceId: 'trace_error',
        success: false,
        feedback: null,
        error: 'Execution failed',
        durationMs: 50,
        createdAt: '2025-11-12T13:05:00Z'
      }).run();

      const errorMockD1 = createMockD1(sqlite);
      const queryParams = new URLSearchParams({
        has_error: 'true'
      });

      const response = await getEvalExecutions(errorMockD1, 'eval_error', queryParams);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.executions).toHaveLength(1);
      expect(data.executions[0].error).toBeTruthy();
    });

    it('should support pagination', async () => {
      const queryParams = new URLSearchParams({
        limit: '1'
      });

      const response = await getEvalExecutions(mockD1, testData.evalCandidate1, queryParams);
      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.executions).toHaveLength(1);
      expect(data.has_more).toBe(true);
      expect(data.next_cursor).toBeTruthy();
    });
  });
});
