// src/services/eval/eval-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the @cloudflare/sandbox module BEFORE importing anything else
vi.mock('@cloudflare/sandbox', async () => {
  const mock = await import('../../sandbox/__mocks__/sandbox-mock');
  return {
    getSandbox: mock.getMockSandbox
  };
});

import { createFetchTracesTool, createGetTraceDetailsTool, createTestEvalCodeTool } from './eval-tools';
import type { ToolContext } from './eval-tools';

describe('eval-tools', () => {
  const mockDb = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    all: vi.fn(),
    first: vi.fn(),
  };

  const mockContext: ToolContext = {
    db: mockDb as any,
    agentId: 'agent_123',
    sandbox: undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetch_traces', () => {
    it('returns trace summaries with correct structure', async () => {
      mockDb.all.mockResolvedValue({
        results: [
          {
            id: 'trace_1',
            trace_id: 'ext_trace_1',
            steps: JSON.stringify([{ output: 'This is a test output that is longer than 200 characters to test truncation. '.repeat(5) }]),
            rating: 'positive',
          },
        ],
      });

      const tool = createFetchTracesTool(mockContext);
      const result = await tool.invoke({ rating: 'positive', limit: 10 });
      const parsed = JSON.parse(result);

      expect(parsed.traces).toHaveLength(1);
      expect(parsed.traces[0].id).toBe('trace_1');
      expect(parsed.traces[0].summary.length).toBeLessThanOrEqual(200);
      expect(parsed.traces[0].rating).toBe('positive');
    });

    it('filters by rating when provided', async () => {
      mockDb.all.mockResolvedValue({ results: [] });
      mockDb.first.mockResolvedValue({ total: 0 });

      const tool = createFetchTracesTool(mockContext);
      await tool.invoke({ rating: 'negative', limit: 5 });

      // Check that the query uses parameterized queries (? placeholder) instead of string interpolation
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("rating = ?")
      );
      // Verify rating parameter was bound correctly
      expect(mockDb.bind).toHaveBeenCalledWith('agent_123', 'negative', 5, 0);
    });
  });
});
