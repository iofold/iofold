/**
 * Tests for AgentDiscoveryJob
 *
 * Mocks all external dependencies:
 * - Workers AI (embedding generation)
 * - Vectorize (vector storage and similarity search)
 * - OpenAI SDK via Cloudflare AI Gateway (template extraction using Claude models)
 * - D1 Database
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentDiscoveryJob } from './agent-discovery-job';
import type { D1Database } from '@cloudflare/workers-types';

// Mock OpenAI SDK at the module level
vi.mock('openai', () => {
  return {
    default: vi.fn()
  };
});

// Mock D1 result structure
const createMockD1Result = (results: any[] = []) => ({
  results,
  success: true,
  meta: {}
});

// Mock D1 prepared statement
const createMockPreparedStatement = (results: any[] = []) => ({
  bind: vi.fn().mockReturnThis(),
  all: vi.fn().mockResolvedValue(createMockD1Result(results)),
  first: vi.fn().mockResolvedValue(results[0] || null),
  run: vi.fn().mockResolvedValue({ success: true, meta: {} })
});

describe('AgentDiscoveryJob', () => {
  let mockDb: D1Database;
  let mockAi: Ai;
  let mockVectorize: VectorizeIndex;
  let mockCfAccountId: string;
  let mockCfGatewayId: string;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    mockCfAccountId = 'test-account-id';
    mockCfGatewayId = 'test-gateway-id';
  });

  describe('Happy path - 20 traces → 2 agents discovered', () => {
    it('should discover 2 agents from 20 traces with 2 distinct clusters', async () => {
      // Mock traces with 2 distinct system prompts
      const traces = [
        // Cluster 1: Customer support agent (10 traces)
        ...Array(10).fill(null).map((_, i) => ({
          id: `trace_cs_${i}`,
          workspace_id: 'ws_1',
          steps: JSON.stringify([{
            messages_added: [{
              role: 'system',
              content: `You are a helpful customer support agent for Acme Corp. Today's date is 2025-11-${20 + i}.`
            }]
          }])
        })),
        // Cluster 2: Code reviewer agent (10 traces)
        ...Array(10).fill(null).map((_, i) => ({
          id: `trace_cr_${i}`,
          workspace_id: 'ws_1',
          steps: JSON.stringify([{
            messages_added: [{
              role: 'system',
              content: `You are an expert code reviewer. Review the following ${i % 2 === 0 ? 'Python' : 'JavaScript'} code for best practices.`
            }]
          }])
        }))
      ];

      // Mock database
      const preparedStatements: any = {};
      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result(traces));
          } else if (sql.includes('INSERT INTO agents')) {
            stmt.run.mockResolvedValue({ success: true, meta: {} });
          } else if (sql.includes('INSERT INTO agent_versions')) {
            stmt.run.mockResolvedValue({ success: true, meta: {} });
          } else if (sql.includes('UPDATE traces')) {
            stmt.run.mockResolvedValue({ success: true, meta: {} });
          } else if (sql.includes('INSERT INTO jobs')) {
            stmt.run.mockResolvedValue({ success: true, meta: {} });
          } else if (sql.includes('UPDATE jobs')) {
            stmt.run.mockResolvedValue({ success: true, meta: {} });
          }

          return stmt;
        }),
        batch: vi.fn().mockResolvedValue([])
      } as any;

      // Mock Workers AI - return different embeddings for different prompt types
      mockAi = {
        run: vi.fn((model: string, input: any) => {
          const texts = input.text as string[];
          // Generate mock embeddings based on prompt content
          return Promise.resolve({
            shape: [texts.length, 768],
            data: texts.map(text => {
              // Customer support prompts get similar embeddings
              if (text.includes('customer support')) {
                return Array(768).fill(0).map(() => 0.5 + Math.random() * 0.1);
              }
              // Code reviewer prompts get different but similar embeddings
              return Array(768).fill(0).map(() => 0.3 + Math.random() * 0.1);
            })
          });
        })
      } as any;

      // Mock Vectorize
      let storedVectors: any[] = [];
      mockVectorize = {
        upsert: vi.fn((vectors: any[]) => {
          storedVectors.push(...vectors);
          return Promise.resolve({ count: vectors.length });
        }),
        query: vi.fn((queryVector: number[], options: any) => {
          // Simulate similarity search
          // For customer support prompts, return other customer support traces
          const isSupportQuery = queryVector[0] > 0.45;

          const matches = storedVectors
            .filter(v => {
              const isSupportVector = v.values[0] > 0.45;
              return isSupportQuery === isSupportVector;
            })
            .map(v => ({
              id: v.id,
              score: 0.92, // High similarity within same cluster
              metadata: v.metadata
            }));

          return Promise.resolve({
            count: matches.length,
            matches
          });
        }),
        getByIds: vi.fn(),
        deleteByIds: vi.fn()
      } as any;

      // Mock OpenAI (via Gateway)
      const mockOpenAICreate = vi.fn()
        .mockResolvedValueOnce({
          // First call: Customer support template
          id: 'chatcmpl-cs1',
          object: 'chat.completion',
          created: Date.now(),
          model: 'anthropic/claude-sonnet-4-5-20250929',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                template: 'You are a helpful customer support agent for Acme Corp. Today\'s date is {{date}}.',
                variables: ['date'],
                agent_name: 'Customer Support Agent'
              })
            },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
        })
        .mockResolvedValueOnce({
          // Second call: Code reviewer template
          id: 'chatcmpl-cr1',
          object: 'chat.completion',
          created: Date.now(),
          model: 'anthropic/claude-sonnet-4-5-20250929',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                template: 'You are an expert code reviewer. Review the following {{language}} code for best practices.',
                variables: ['language'],
                agent_name: 'Code Reviewer Agent'
              })
            },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
        });

      // Setup OpenAI mock
      const OpenAI = (await import('openai')).default;
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockOpenAICreate
          }
        }
      }));

      // Execute job
      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_1',
          workspaceId: 'ws_1',
          similarityThreshold: 0.85,
          minClusterSize: 5,
          maxTracesToProcess: 100
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      // Verify results
      expect(result.discovered_agents).toHaveLength(2);
      expect(result.assigned_traces).toBe(20);
      expect(result.orphaned_traces).toBe(0);

      // Verify database interactions
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO agents'));
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO agent_versions'));
      expect(mockDb.batch).toHaveBeenCalled(); // Batch trace updates

      // Verify AI interactions
      expect(mockAi.run).toHaveBeenCalled();
      expect(mockVectorize.upsert).toHaveBeenCalled();
      expect(mockOpenAICreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('No clusters found (all orphaned)', () => {
    it('should mark all traces as orphaned when no similar prompts found', async () => {
      // Mock traces with completely different system prompts
      const traces = Array(8).fill(null).map((_, i) => ({
        id: `trace_unique_${i}`,
        workspace_id: 'ws_1',
        steps: JSON.stringify([{
          messages_added: [{
            role: 'system',
            content: `Completely unique prompt number ${i} with no similarity to others.`
          }]
        }])
      }));

      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result(traces));
          }

          return stmt;
        }),
        batch: vi.fn().mockResolvedValue([])
      } as any;

      mockAi = {
        run: vi.fn(() => Promise.resolve({
          shape: [1, 768],
          data: [Array(768).fill(0).map(() => Math.random())]
        }))
      } as any;

      mockVectorize = {
        upsert: vi.fn(() => Promise.resolve({ count: 1 })),
        query: vi.fn(() => Promise.resolve({
          count: 1,
          matches: [{ id: 'trace_unique_0', score: 0.95, metadata: {} }] // Only self-match
        })),
        getByIds: vi.fn(),
        deleteByIds: vi.fn()
      } as any;

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_2',
          workspaceId: 'ws_1',
          minClusterSize: 5
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      expect(result.discovered_agents).toHaveLength(0);
      expect(result.assigned_traces).toBe(0);
      expect(result.orphaned_traces).toBe(8);

      // Verify traces were marked as orphaned
      expect(mockDb.batch).toHaveBeenCalled();
    });
  });

  describe('Single large cluster', () => {
    it('should create one agent when all traces are similar', async () => {
      const traces = Array(15).fill(null).map((_, i) => ({
        id: `trace_${i}`,
        workspace_id: 'ws_1',
        steps: JSON.stringify([{
          messages_added: [{
            role: 'system',
            content: `You are a helpful assistant. User name is User${i}.`
          }]
        }])
      }));

      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result(traces));
          }

          return stmt;
        }),
        batch: vi.fn().mockResolvedValue([])
      } as any;

      mockAi = {
        run: vi.fn(() => Promise.resolve({
          shape: [1, 768],
          data: [Array(768).fill(0.5)] // All identical embeddings
        }))
      } as any;

      mockVectorize = {
        upsert: vi.fn(() => Promise.resolve({ count: 1 })),
        query: vi.fn(() => {
          // Return all traces as similar
          const matches = traces.map(t => ({
            id: t.id,
            score: 0.95,
            metadata: { status: 'unassigned' }
          }));
          return Promise.resolve({ count: matches.length, matches });
        }),
        getByIds: vi.fn(),
        deleteByIds: vi.fn()
      } as any;

      const mockOpenAICreate = vi.fn().mockResolvedValue({
        id: 'chatcmpl-ga1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'anthropic/claude-sonnet-4-5-20250929',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({
              template: 'You are a helpful assistant. User name is {{user_name}}.',
              variables: ['user_name'],
              agent_name: 'General Assistant'
            })
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      });

      const OpenAI = (await import('openai')).default;
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockOpenAICreate
          }
        }
      }));

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_3',
          workspaceId: 'ws_1',
          minClusterSize: 5
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      expect(result.discovered_agents).toHaveLength(1);
      expect(result.assigned_traces).toBe(15);
      expect(result.orphaned_traces).toBe(0);

      expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Embedding failure handling', () => {
    it('should fail gracefully when embedding service fails', async () => {
      const traces = [{
        id: 'trace_1',
        workspace_id: 'ws_1',
        steps: JSON.stringify([{
          messages_added: [{
            role: 'system',
            content: 'Test prompt'
          }]
        }])
      }];

      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result(traces));
          }

          return stmt;
        }),
        batch: vi.fn().mockResolvedValue([])
      } as any;

      // Mock AI failure
      mockAi = {
        run: vi.fn(() => Promise.reject(new Error('Workers AI service unavailable')))
      } as any;

      mockVectorize = {
        upsert: vi.fn(),
        query: vi.fn(),
        getByIds: vi.fn(),
        deleteByIds: vi.fn()
      } as any;

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_4',
          workspaceId: 'ws_1'
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      await expect(job.execute()).rejects.toThrow('Workers AI service unavailable');

      // Verify job was marked as failed
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE jobs'));
    });
  });

  describe('Template extraction failure', () => {
    it('should mark cluster as orphaned when Claude fails to extract template', async () => {
      const traces = Array(6).fill(null).map((_, i) => ({
        id: `trace_${i}`,
        workspace_id: 'ws_1',
        steps: JSON.stringify([{
          messages_added: [{
            role: 'system',
            content: `Similar prompt ${i}`
          }]
        }])
      }));

      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result(traces));
          }

          return stmt;
        }),
        batch: vi.fn().mockResolvedValue([])
      } as any;

      mockAi = {
        run: vi.fn(() => Promise.resolve({
          shape: [1, 768],
          data: [Array(768).fill(0.5)]
        }))
      } as any;

      mockVectorize = {
        upsert: vi.fn(() => Promise.resolve({ count: 1 })),
        query: vi.fn(() => Promise.resolve({
          count: 6,
          matches: traces.map(t => ({ id: t.id, score: 0.9, metadata: { status: 'unassigned' } }))
        })),
        getByIds: vi.fn(),
        deleteByIds: vi.fn()
      } as any;

      // Mock OpenAI to return invalid JSON
      const mockOpenAICreate = vi.fn().mockResolvedValue({
        id: 'chatcmpl-invalid1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'anthropic/claude-sonnet-4-5-20250929',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Invalid response, not JSON'
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      });

      const OpenAI = (await import('openai')).default;
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockOpenAICreate
          }
        }
      }));

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_5',
          workspaceId: 'ws_1',
          minClusterSize: 5
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      // Should complete successfully but mark cluster as orphaned
      expect(result.discovered_agents).toHaveLength(0);
      expect(result.assigned_traces).toBe(0);
      expect(result.orphaned_traces).toBeGreaterThan(0);
    });
  });

  describe('No unassigned traces', () => {
    it('should complete successfully with no action when no unassigned traces exist', async () => {
      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result([])); // Empty result
          }

          return stmt;
        }),
        batch: vi.fn()
      } as any;

      mockAi = { run: vi.fn() } as any;
      mockVectorize = { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() } as any;

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_6',
          workspaceId: 'ws_1'
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      expect(result.discovered_agents).toHaveLength(0);
      expect(result.assigned_traces).toBe(0);
      expect(result.orphaned_traces).toBe(0);

      // Should not call AI services
      expect(mockAi.run).not.toHaveBeenCalled();
    });
  });

  describe('Traces without system prompts', () => {
    it('should mark traces as orphaned when they have no system prompts', async () => {
      const traces = [
        {
          id: 'trace_1',
          workspace_id: 'ws_1',
          steps: JSON.stringify([{
            messages_added: [{
              role: 'user',
              content: 'Hello'
            }]
          }])
        },
        {
          id: 'trace_2',
          workspace_id: 'ws_1',
          steps: JSON.stringify([]) // Empty steps
        }
      ];

      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result(traces));
          }

          return stmt;
        }),
        batch: vi.fn().mockResolvedValue([])
      } as any;

      mockAi = { run: vi.fn() } as any;
      mockVectorize = { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() } as any;

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_7',
          workspaceId: 'ws_1'
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      expect(result.discovered_agents).toHaveLength(0);
      expect(result.assigned_traces).toBe(0);
      expect(result.orphaned_traces).toBe(2);

      // Verify orphaned status update
      expect(mockDb.batch).toHaveBeenCalled();
    });

    it('should skip system messages with empty content', async () => {
      const traces = [
        {
          id: 'trace_1',
          workspace_id: 'ws_1',
          steps: JSON.stringify([{
            messages_added: [{
              role: 'system',
              content: ''  // Empty content should be skipped
            }, {
              role: 'user',
              content: 'Hello'
            }]
          }])
        }
      ];

      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result(traces));
          }

          return stmt;
        }),
        batch: vi.fn().mockResolvedValue([])
      } as any;

      mockAi = { run: vi.fn() } as any;
      mockVectorize = { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() } as any;

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_8',
          workspaceId: 'ws_1'
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      expect(result.discovered_agents).toHaveLength(0);
      expect(result.orphaned_traces).toBe(1);
    });

    it('should handle null messages_added gracefully', async () => {
      const traces = [
        {
          id: 'trace_1',
          workspace_id: 'ws_1',
          steps: JSON.stringify([{
            messages_added: null,  // null instead of array
            tool_calls: []
          }])
        }
      ];

      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result(traces));
          }

          return stmt;
        }),
        batch: vi.fn().mockResolvedValue([])
      } as any;

      mockAi = { run: vi.fn() } as any;
      mockVectorize = { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() } as any;

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_9',
          workspaceId: 'ws_1'
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      expect(result.discovered_agents).toHaveLength(0);
      expect(result.orphaned_traces).toBe(1);
    });
  });

  describe('System prompt extraction edge cases', () => {
    it('should extract system prompt from first step that contains one', async () => {
      const traces = Array(6).fill(null).map((_, i) => ({
        id: `trace_${i}`,
        workspace_id: 'ws_1',
        steps: JSON.stringify([
          {
            messages_added: [{
              role: 'user',
              content: 'First user message'
            }]
          },
          {
            messages_added: [{
              role: 'system',
              content: 'You are a helpful assistant.'  // System prompt in second step
            }]
          }
        ])
      }));

      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result(traces));
          }

          return stmt;
        }),
        batch: vi.fn().mockResolvedValue([])
      } as any;

      mockAi = {
        run: vi.fn(() => Promise.resolve({
          shape: [1, 768],
          data: [Array(768).fill(0.5)]
        }))
      } as any;

      mockVectorize = {
        upsert: vi.fn(() => Promise.resolve({ count: 1 })),
        query: vi.fn(() => Promise.resolve({
          count: 6,
          matches: traces.map(t => ({ id: t.id, score: 0.95, metadata: { status: 'unassigned' } }))
        })),
        getByIds: vi.fn(),
        deleteByIds: vi.fn()
      } as any;

      const mockOpenAICreate = vi.fn().mockResolvedValue({
        id: 'chatcmpl-ga2',
        object: 'chat.completion',
        created: Date.now(),
        model: 'anthropic/claude-sonnet-4-5-20250929',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({
              template: 'You are a helpful assistant.',
              variables: [],
              agent_name: 'General Assistant'
            })
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      });

      const OpenAI = (await import('openai')).default;
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockOpenAICreate
          }
        }
      }));

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_10',
          workspaceId: 'ws_1',
          minClusterSize: 5
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      // Should find the system prompt in second step and create agent
      expect(result.discovered_agents).toHaveLength(1);
      expect(result.assigned_traces).toBe(6);
    });

    it('should handle mixed traces (some with prompts, some without)', async () => {
      // NOTE: Current implementation skips traces without system prompts
      // They are not counted as orphaned - only traces that fail clustering are orphaned
      const traces = [
        // 6 traces WITH system prompts (should cluster)
        ...Array(6).fill(null).map((_, i) => ({
          id: `trace_with_prompt_${i}`,
          workspace_id: 'ws_1',
          steps: JSON.stringify([{
            messages_added: [{
              role: 'system',
              content: 'You are a helpful assistant.'
            }]
          }])
        })),
        // 2 traces WITHOUT system prompts (will be skipped, not orphaned)
        {
          id: 'trace_no_prompt_1',
          workspace_id: 'ws_1',
          steps: JSON.stringify([{
            messages_added: [{
              role: 'user',
              content: 'Hello'
            }]
          }])
        },
        {
          id: 'trace_no_prompt_2',
          workspace_id: 'ws_1',
          steps: JSON.stringify([])
        }
      ];

      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result(traces));
          }

          return stmt;
        }),
        batch: vi.fn().mockResolvedValue([])
      } as any;

      mockAi = {
        run: vi.fn(() => Promise.resolve({
          shape: [1, 768],
          data: [Array(768).fill(0.5)]
        }))
      } as any;

      mockVectorize = {
        upsert: vi.fn(() => Promise.resolve({ count: 1 })),
        query: vi.fn(() => Promise.resolve({
          count: 6,
          matches: traces.filter(t => t.id.includes('with_prompt')).map(t => ({
            id: t.id,
            score: 0.95,
            metadata: { status: 'unassigned' }
          }))
        })),
        getByIds: vi.fn(),
        deleteByIds: vi.fn()
      } as any;

      const mockOpenAICreate = vi.fn().mockResolvedValue({
        id: 'chatcmpl-mixed1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'anthropic/claude-sonnet-4-5-20250929',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({
              template: 'You are a helpful assistant.',
              variables: [],
              agent_name: 'Assistant'
            })
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      });

      const OpenAI = (await import('openai')).default;
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockOpenAICreate
          }
        }
      }));

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_11',
          workspaceId: 'ws_1',
          minClusterSize: 5
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      // Should create 1 agent from the 6 traces with prompts
      // Traces without system prompts are skipped (not counted as orphaned)
      expect(result.discovered_agents).toHaveLength(1);
      expect(result.assigned_traces).toBe(6);
      // Note: Traces without prompts are skipped, not orphaned in current impl
      expect(result.orphaned_traces).toBe(0);
    });

    it('should use first system message when multiple exist in same step', async () => {
      const traces = Array(5).fill(null).map((_, i) => ({
        id: `trace_${i}`,
        workspace_id: 'ws_1',
        steps: JSON.stringify([{
          messages_added: [
            {
              role: 'system',
              content: 'First system prompt - should use this one'
            },
            {
              role: 'system',
              content: 'Second system prompt - should ignore'
            }
          ]
        }])
      }));

      mockDb = {
        prepare: vi.fn((sql: string) => {
          const stmt = createMockPreparedStatement();

          if (sql.includes('SELECT id, steps')) {
            stmt.all.mockResolvedValue(createMockD1Result(traces));
          }

          return stmt;
        }),
        batch: vi.fn().mockResolvedValue([])
      } as any;

      mockAi = {
        run: vi.fn(() => Promise.resolve({
          shape: [1, 768],
          data: [Array(768).fill(0.5)]
        }))
      } as any;

      mockVectorize = {
        upsert: vi.fn(() => Promise.resolve({ count: 1 })),
        query: vi.fn(() => Promise.resolve({
          count: 5,
          matches: traces.map(t => ({ id: t.id, score: 0.95, metadata: { status: 'unassigned' } }))
        })),
        getByIds: vi.fn(),
        deleteByIds: vi.fn()
      } as any;

      const mockOpenAICreate = vi.fn().mockResolvedValue({
        id: 'chatcmpl-first1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'anthropic/claude-sonnet-4-5-20250929',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({
              template: 'First system prompt - should use this one',
              variables: [],
              agent_name: 'First Prompt Agent'
            })
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      });

      const OpenAI = (await import('openai')).default;
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockOpenAICreate
          }
        }
      }));

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_12',
          workspaceId: 'ws_1',
          minClusterSize: 5
        },
        {
          db: mockDb,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      expect(result.discovered_agents).toHaveLength(1);
      // Verify OpenAI was called with the first prompt
      expect(mockOpenAICreate).toHaveBeenCalled();
      const openAIInput = mockOpenAICreate.mock.calls[0][0].messages[0].content;
      expect(openAIInput).toContain('First system prompt');
      expect(openAIInput).not.toContain('Second system prompt');
    });
  });
});
