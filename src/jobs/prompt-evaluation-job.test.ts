import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the @cloudflare/sandbox module BEFORE importing anything else
vi.mock('@cloudflare/sandbox', async () => {
  const mock = await import('../sandbox/__mocks__/sandbox-mock');
  return {
    getSandbox: mock.getMockSandbox
  };
});

import { PromptEvaluationJob } from './prompt-evaluation-job';
import type { D1Database } from '@cloudflare/workers-types';
import { mockSandboxBinding } from '../sandbox/__mocks__/sandbox-mock';

// Mock dependencies
const mockDb = {
  prepare: vi.fn(),
  batch: vi.fn(),
  exec: vi.fn()
} as unknown as D1Database;

// Helper to create a mock D1 prepared statement
function createMockStatement(results: any[]) {
  return {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue({ results }),
    first: vi.fn().mockResolvedValue(results[0] || null),
    run: vi.fn().mockResolvedValue({ success: true })
  };
}

describe('PromptEvaluationJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should evaluate candidate vs active version comparison', async () => {
    const candidateVersion = {
      id: 'version_candidate',
      agent_id: 'agent_1',
      version: 2,
      prompt_template: 'You are a helpful assistant',
      variables: JSON.stringify([])
    };

    const activeVersion = {
      id: 'version_active',
      accuracy: 0.75
    };

    const traces = [
      {
        id: 'trace_1',
        external_id: 'ext_1',
        integration_id: 'int_1',
        trace_data: JSON.stringify({
          steps: [{ input: 'test', output: 'result' }]
        })
      },
      {
        id: 'trace_2',
        external_id: 'ext_2',
        integration_id: 'int_1',
        trace_data: JSON.stringify({
          steps: [{ input: 'test2', output: 'result2' }]
        })
      }
    ];

    const evals = [
      {
        id: 'eval_1',
        name: 'Test Eval',
        code: `import json

def test_eval(trace):
    return True, "pass"`
      }
    ];

    // Mock database calls based on SQL query content
    mockDb.prepare = vi.fn((query: string) => {
      // Fetch candidate version
      if (query.includes('FROM agent_versions') && query.includes('WHERE id = ?')) {
        return createMockStatement([candidateVersion]);
      }
      // Fetch active version
      if (query.includes('FROM agents a') && query.includes('JOIN agent_versions av')) {
        return createMockStatement([activeVersion]);
      }
      // Fetch traces
      if (query.includes('FROM traces') && query.includes('agent_version_id')) {
        return createMockStatement(traces);
      }
      // Fetch evals
      if (query.includes('FROM evals') && query.includes('agent_id')) {
        return createMockStatement(evals);
      }
      // All other calls (updates, etc)
      return createMockStatement([]);
    });

    // The sandbox is automatically mocked via the mock import above

    const config = {
      jobId: 'job_1',
      agentVersionId: 'version_candidate',
      workspaceId: 'workspace_1',
      maxTraces: 50
    };

    const deps = {
      db: mockDb,
      sandboxBinding: mockSandboxBinding
    };

    const job = new PromptEvaluationJob(config, deps);
    const result = await job.execute();

    // Verify result structure
    expect(result.candidate_version_id).toBe('version_candidate');
    expect(result.active_version_id).toBe('version_active');
    expect(result.active_accuracy).toBe(0.75);
    expect(result.accuracy_delta).toBeGreaterThan(0); // Should be positive since all evals pass
    expect(result.recommendation).toBe('promote'); // Delta >= 0.05
    expect(result.eval_results).toHaveLength(1);
    expect(result.eval_results[0].eval_name).toBe('Test Eval');
    expect(result.eval_results[0].passed).toBe(2); // 2 traces
  });

  it('should handle first version (no active to compare, delta is null)', async () => {
    const candidateVersion = {
      id: 'version_first',
      agent_id: 'agent_1',
      version: 1,
      prompt_template: 'You are a helpful assistant',
      variables: JSON.stringify([])
    };

    const traces = [
      {
        id: 'trace_1',
        external_id: 'ext_1',
        integration_id: 'int_1',
        trace_data: JSON.stringify({
          steps: [{ input: 'test', output: 'result' }]
        })
      }
    ];

    const evals = [
      {
        id: 'eval_1',
        name: 'Test Eval',
        code: `import json

def test_eval(trace):
    return True, "pass"`
      }
    ];

    mockDb.prepare = vi.fn((query: string) => {
      if (query.includes('FROM agent_versions') && query.includes('WHERE id = ?')) {
        return createMockStatement([candidateVersion]);
      }
      if (query.includes('FROM agents a') && query.includes('JOIN agent_versions av')) {
        return createMockStatement([]); // No active version
      }
      if (query.includes('FROM traces') && query.includes('agent_version_id')) {
        return createMockStatement(traces);
      }
      if (query.includes('FROM evals') && query.includes('agent_id')) {
        return createMockStatement(evals);
      }
      return createMockStatement([]);
    });

    const config = {
      jobId: 'job_1',
      agentVersionId: 'version_first',
      workspaceId: 'workspace_1'
    };

    const deps = {
      db: mockDb,
      sandboxBinding: mockSandboxBinding
    };

    const job = new PromptEvaluationJob(config, deps);
    const result = await job.execute();

    // Verify result
    expect(result.active_version_id).toBeNull();
    expect(result.active_accuracy).toBeNull();
    expect(result.accuracy_delta).toBeNull();
    expect(result.recommendation).toBe('promote'); // First version always recommended
  });

  it('should handle all evals pass (high accuracy)', async () => {
    const candidateVersion = {
      id: 'version_candidate',
      agent_id: 'agent_1',
      version: 2,
      prompt_template: 'You are a helpful assistant',
      variables: JSON.stringify([])
    };

    const activeVersion = {
      id: 'version_active',
      accuracy: 0.5
    };

    const traces = [
      {
        id: 'trace_1',
        external_id: 'ext_1',
        integration_id: 'int_1',
        trace_data: JSON.stringify({
          steps: [{ input: 'test', output: 'result' }]
        })
      }
    ];

    const evals = [
      {
        id: 'eval_1',
        name: 'Eval 1',
        code: `import json

def eval_1(trace):
    return True, "pass"`
      },
      {
        id: 'eval_2',
        name: 'Eval 2',
        code: `import json

def eval_2(trace):
    return True, "pass"`
      }
    ];

    mockDb.prepare = vi.fn((query: string) => {
      if (query.includes('FROM agent_versions') && query.includes('WHERE id = ?')) {
        return createMockStatement([candidateVersion]);
      }
      if (query.includes('FROM agents a') && query.includes('JOIN agent_versions av')) {
        return createMockStatement([activeVersion]);
      }
      if (query.includes('FROM traces') && query.includes('agent_version_id')) {
        return createMockStatement(traces);
      }
      if (query.includes('FROM evals') && query.includes('agent_id')) {
        return createMockStatement(evals);
      }
      return createMockStatement([]);
    });

    const config = {
      jobId: 'job_1',
      agentVersionId: 'version_candidate',
      workspaceId: 'workspace_1'
    };

    const deps = {
      db: mockDb,
      sandboxBinding: mockSandboxBinding
    };

    const job = new PromptEvaluationJob(config, deps);
    const result = await job.execute();

    // All evals pass = accuracy 1.0
    expect(result.candidate_accuracy).toBe(1.0);
    expect(result.accuracy_delta).toBeGreaterThan(0.4); // 1.0 - 0.5 = 0.5
    expect(result.recommendation).toBe('promote');
  });

  it('should handle all evals fail (low accuracy)', async () => {
    const candidateVersion = {
      id: 'version_candidate',
      agent_id: 'agent_1',
      version: 2,
      prompt_template: 'You are a helpful assistant',
      variables: JSON.stringify([])
    };

    const activeVersion = {
      id: 'version_active',
      accuracy: 0.8
    };

    const traces = [
      {
        id: 'trace_1',
        external_id: 'ext_1',
        integration_id: 'int_1',
        trace_data: JSON.stringify({
          steps: [{ input: 'test', output: 'result' }]
        })
      }
    ];

    const evals = [
      {
        id: 'eval_1',
        name: 'Eval 1',
        code: `import json

def eval_1(trace):
    return False, "fail"`
      }
    ];

    mockDb.prepare = vi.fn((query: string) => {
      if (query.includes('FROM agent_versions') && query.includes('WHERE id = ?')) {
        return createMockStatement([candidateVersion]);
      }
      if (query.includes('FROM agents a') && query.includes('JOIN agent_versions av')) {
        return createMockStatement([activeVersion]);
      }
      if (query.includes('FROM traces') && query.includes('agent_version_id')) {
        return createMockStatement(traces);
      }
      if (query.includes('FROM evals') && query.includes('agent_id')) {
        return createMockStatement(evals);
      }
      return createMockStatement([]);
    });

    const config = {
      jobId: 'job_1',
      agentVersionId: 'version_candidate',
      workspaceId: 'workspace_1'
    };

    const deps = {
      db: mockDb,
      sandboxBinding: mockSandboxBinding
    };

    const job = new PromptEvaluationJob(config, deps);
    const result = await job.execute();

    // All evals fail = accuracy 0.0
    expect(result.candidate_accuracy).toBe(0.0);
    expect(result.accuracy_delta).toBeLessThan(-0.05); // 0.0 - 0.8 = -0.8
    expect(result.recommendation).toBe('reject');
  });

  it('should handle sandbox execution errors', async () => {
    const candidateVersion = {
      id: 'version_candidate',
      agent_id: 'agent_1',
      version: 2,
      prompt_template: 'You are a helpful assistant',
      variables: JSON.stringify([])
    };

    const activeVersion = {
      id: 'version_active',
      accuracy: 0.8
    };

    const traces = [
      {
        id: 'trace_1',
        external_id: 'ext_1',
        integration_id: 'int_1',
        trace_data: JSON.stringify({
          steps: [{ input: 'test', output: 'result' }]
        })
      }
    ];

    const evals = [
      {
        id: 'eval_1',
        name: 'Eval 1',
        code: `import json

def eval_1(trace):
    raise Exception("Sandbox error")`
      }
    ];

    mockDb.prepare = vi.fn((query: string) => {
      if (query.includes('FROM agent_versions') && query.includes('WHERE id = ?')) {
        return createMockStatement([candidateVersion]);
      }
      if (query.includes('FROM agents a') && query.includes('JOIN agent_versions av')) {
        return createMockStatement([activeVersion]);
      }
      if (query.includes('FROM traces') && query.includes('agent_version_id')) {
        return createMockStatement(traces);
      }
      if (query.includes('FROM evals') && query.includes('agent_id')) {
        return createMockStatement(evals);
      }
      return createMockStatement([]);
    });

    const config = {
      jobId: 'job_1',
      agentVersionId: 'version_candidate',
      workspaceId: 'workspace_1'
    };

    const deps = {
      db: mockDb,
      sandboxBinding: mockSandboxBinding
    };

    const job = new PromptEvaluationJob(config, deps);
    const result = await job.execute();

    // Errors should be counted
    expect(result.eval_results[0].errors).toBe(1);
    expect(result.eval_results[0].passed).toBe(0);
  });

  it('should test recommendation logic', async () => {
    const candidateVersion = {
      id: 'version_candidate',
      agent_id: 'agent_1',
      version: 2,
      prompt_template: 'You are a helpful assistant',
      variables: JSON.stringify([])
    };

    // Test marginal change (needs review)
    const activeVersion = {
      id: 'version_active',
      accuracy: 0.77
    };

    const traces = [
      {
        id: 'trace_1',
        external_id: 'ext_1',
        integration_id: 'int_1',
        trace_data: JSON.stringify({
          steps: [{ input: 'test', output: 'result' }]
        })
      }
    ];

    const evals = [
      {
        id: 'eval_1',
        name: 'Eval 1',
        code: `def eval_1(trace):
    return True, "pass"`
      }
    ];

    mockDb.prepare = vi.fn((query: string) => {
      if (query.includes('FROM agent_versions') && query.includes('WHERE id = ?')) {
        return createMockStatement([candidateVersion]);
      }
      if (query.includes('FROM agents a') && query.includes('JOIN agent_versions av')) {
        return createMockStatement([activeVersion]);
      }
      if (query.includes('FROM traces') && query.includes('agent_version_id')) {
        return createMockStatement(traces);
      }
      if (query.includes('FROM evals') && query.includes('agent_id')) {
        return createMockStatement(evals);
      }
      return createMockStatement([]);
    });

    const config = {
      jobId: 'job_1',
      agentVersionId: 'version_candidate',
      workspaceId: 'workspace_1'
    };

    const deps = {
      db: mockDb,
      sandboxBinding: mockSandboxBinding
    };

    const job = new PromptEvaluationJob(config, deps);
    const result = await job.execute();

    // Accuracy will be 1.0, delta = 1.0 - 0.77 = 0.23 > 0.05
    expect(result.recommendation).toBe('promote');
  });
});
