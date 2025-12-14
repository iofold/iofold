/**
 * Tests for AgentDiscoveryJob
 *
 * Tests the agent discovery job using Drizzle ORM with mocked external dependencies:
 * - Workers AI (embedding generation)
 * - Vectorize (vector storage and similarity search)
 * - OpenAI SDK via Cloudflare AI Gateway (template extraction using Claude models)
 * - D1 Database (via Drizzle ORM with in-memory SQLite)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentDiscoveryJob } from './agent-discovery-job';
import type { D1Database } from '@cloudflare/workers-types';
import { createTestDb, createMockD1, schema } from '../../tests/utils/test-db';
import type { TestDatabase } from '../../tests/utils/test-db';
import Database from 'better-sqlite3';

// Mock OpenAI SDK at the module level
vi.mock('openai', () => {
  return {
    default: vi.fn()
  };
});

describe('AgentDiscoveryJob', () => {
  let testDb: TestDatabase;
  let sqlite: Database.Database;
  let mockD1: D1Database;
  let mockAi: Ai;
  let mockVectorize: VectorizeIndex;
  let mockCfAccountId: string;
  let mockCfGatewayId: string;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create fresh in-memory database for each test
    const dbContext = createTestDb();
    testDb = dbContext.db;
    sqlite = dbContext.sqlite;

    // Seed basic workspace data
    testDb.insert(schema.users).values({
      id: 'user_test',
      email: 'test@example.com',
    }).run();

    testDb.insert(schema.workspaces).values({
      id: 'workspace_test',
      userId: 'user_test',
      name: 'Test Workspace',
    }).run();

    // Create D1-compatible mock
    mockD1 = createMockD1(sqlite);

    mockCfAccountId = 'test-account-id';
    mockCfGatewayId = 'test-gateway-id';
  });

  afterEach(() => {
    // Close database connection
    sqlite.close();
  });

  describe('Happy path - 20 traces → 2 agents discovered', () => {
    it('should discover 2 agents from 20 traces with 2 distinct clusters', async () => {
      // Create traces with 2 distinct system prompts
      const customerSupportTraces = Array(10).fill(null).map((_, i) => ({
        id: `trace_cs_${i}`,
        workspaceId: 'workspace_test',
        traceId: `langfuse_cs_${i}`,
        source: 'langfuse',
        timestamp: new Date().toISOString(),
        steps: JSON.stringify([{
          messages_added: [{
            role: 'system',
            content: `You are a helpful customer support agent for Acme Corp. Today's date is 2025-11-${20 + i}.`
          }]
        }]),
        assignmentStatus: 'unassigned',
      }));

      const codeReviewerTraces = Array(10).fill(null).map((_, i) => ({
        id: `trace_cr_${i}`,
        workspaceId: 'workspace_test',
        traceId: `langfuse_cr_${i}`,
        source: 'langfuse',
        timestamp: new Date().toISOString(),
        steps: JSON.stringify([{
          messages_added: [{
            role: 'system',
            content: `You are an expert code reviewer. Review the following ${i % 2 === 0 ? 'Python' : 'JavaScript'} code for best practices.`
          }]
        }]),
        assignmentStatus: 'unassigned',
      }));

      // Insert traces into database
      for (const trace of [...customerSupportTraces, ...codeReviewerTraces]) {
        testDb.insert(schema.traces).values(trace).run();
      }

      // Mock Workers AI - return different embeddings for different prompt types
      mockAi = {
        run: vi.fn((model: string, input: any) => {
          const texts = input.text as string[];
          // Generate mock embeddings based on prompt content
          return Promise.resolve({
            shape: [texts.length, 768],
            data: texts.map(text => {
              // Customer support prompts get similar embeddings (0.5-0.6 range)
              if (text.includes('customer support')) {
                return Array(768).fill(0).map(() => 0.5 + Math.random() * 0.1);
              }
              // Code reviewer prompts get different but similar embeddings (0.3-0.4 range)
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
          // Customer support prompts have embeddings starting with ~0.5
          const isSupportQuery = queryVector[0] > 0.45;

          const matches = storedVectors
            .filter(v => {
              const isSupportVector = v.values[0] > 0.45;
              return isSupportQuery === isSupportVector && v.metadata.status === 'unassigned';
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

      // Mock OpenAI (via Gateway) - respond with templates for each cluster
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
          workspaceId: 'workspace_test',
          similarityThreshold: 0.85,
          minClusterSize: 5,
          maxTracesToProcess: 100
        },
        {
          db: mockD1,
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

      // Verify agents were created in database
      const agents = testDb.select().from(schema.agents).all();
      expect(agents).toHaveLength(2);
      expect(agents.every(a => a.status === 'discovered')).toBe(true);

      // Verify agent versions were created
      const versions = testDb.select().from(schema.agentVersions).all();
      expect(versions).toHaveLength(2);
      expect(versions.every(v => v.status === 'active')).toBe(true);

      // Verify traces were assigned
      const updatedTraces = testDb.select().from(schema.traces).all();
      expect(updatedTraces.every(t => t.assignmentStatus === 'assigned')).toBe(true);
      expect(updatedTraces.every(t => t.agentVersionId !== null)).toBe(true);

      // Verify AI interactions
      expect(mockAi.run).toHaveBeenCalled();
      expect(mockVectorize.upsert).toHaveBeenCalled();
      expect(mockOpenAICreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('No clusters found (all orphaned)', () => {
    it('should mark all traces as orphaned when no similar prompts found', async () => {
      // Create traces with completely different system prompts
      const traces = Array(8).fill(null).map((_, i) => ({
        id: `trace_unique_${i}`,
        workspaceId: 'workspace_test',
        traceId: `langfuse_unique_${i}`,
        source: 'langfuse',
        timestamp: new Date().toISOString(),
        steps: JSON.stringify([{
          messages_added: [{
            role: 'system',
            content: `Completely unique prompt number ${i} with no similarity to others.`
          }]
        }]),
        assignmentStatus: 'unassigned',
      }));

      for (const trace of traces) {
        testDb.insert(schema.traces).values(trace).run();
      }

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
          matches: [] // No matches above threshold (only self-match excluded by filter)
        })),
        getByIds: vi.fn(),
        deleteByIds: vi.fn()
      } as any;

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_2',
          workspaceId: 'workspace_test',
          minClusterSize: 5
        },
        {
          db: mockD1,
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
      const updatedTraces = testDb.select().from(schema.traces).all();
      expect(updatedTraces.every(t => t.assignmentStatus === 'orphaned')).toBe(true);
    });
  });

  describe('Single large cluster', () => {
    it('should create one agent when all traces are similar', async () => {
      const traces = Array(15).fill(null).map((_, i) => ({
        id: `trace_${i}`,
        workspaceId: 'workspace_test',
        traceId: `langfuse_${i}`,
        source: 'langfuse',
        timestamp: new Date().toISOString(),
        steps: JSON.stringify([{
          messages_added: [{
            role: 'system',
            content: `You are a helpful assistant. User name is User${i}.`
          }]
        }]),
        assignmentStatus: 'unassigned',
      }));

      for (const trace of traces) {
        testDb.insert(schema.traces).values(trace).run();
      }

      mockAi = {
        run: vi.fn(() => Promise.resolve({
          shape: [1, 768],
          data: [Array(768).fill(0.5)] // All identical embeddings
        }))
      } as any;

      let storedVectors: any[] = [];
      mockVectorize = {
        upsert: vi.fn((vectors: any[]) => {
          storedVectors.push(...vectors);
          return Promise.resolve({ count: vectors.length });
        }),
        query: vi.fn(() => {
          // Return all traces as similar (filter by status)
          const matches = storedVectors
            .filter(v => v.metadata.status === 'unassigned')
            .map(v => ({
              id: v.id,
              score: 0.95,
              metadata: v.metadata
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
          workspaceId: 'workspace_test',
          minClusterSize: 5
        },
        {
          db: mockD1,
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

      // Verify single agent created
      const agents = testDb.select().from(schema.agents).all();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('General Assistant');
    });
  });

  describe('Embedding failure handling', () => {
    it('should fail gracefully when embedding service fails', async () => {
      const traces = [{
        id: 'trace_1',
        workspaceId: 'workspace_test',
        traceId: 'langfuse_1',
        source: 'langfuse',
        timestamp: new Date().toISOString(),
        steps: JSON.stringify([{
          messages_added: [{
            role: 'system',
            content: 'Test prompt'
          }]
        }]),
        assignmentStatus: 'unassigned',
      }];

      testDb.insert(schema.traces).values(traces[0]).run();

      // Create the job record first (simulating what the job queue would do)
      testDb.insert(schema.jobs).values({
        id: 'job_4',
        workspaceId: 'workspace_test',
        type: 'agent_discovery',
        status: 'queued',
        progress: 0,
      }).run();

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
          workspaceId: 'workspace_test'
        },
        {
          db: mockD1,
          ai: mockAi,
          vectorize: mockVectorize,
          cfAccountId: mockCfAccountId,
          cfGatewayId: mockCfGatewayId,
          cfGatewayToken: 'test-token'
        }
      );

      await expect(job.execute()).rejects.toThrow('Workers AI service unavailable');

      // Verify job was marked as failed
      const jobs = testDb.select().from(schema.jobs).all();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('failed');
    });
  });

  describe('Template extraction failure', () => {
    it('should mark cluster as orphaned when Claude fails to extract template', async () => {
      const traces = Array(6).fill(null).map((_, i) => ({
        id: `trace_${i}`,
        workspaceId: 'workspace_test',
        traceId: `langfuse_${i}`,
        source: 'langfuse',
        timestamp: new Date().toISOString(),
        steps: JSON.stringify([{
          messages_added: [{
            role: 'system',
            content: `Similar prompt ${i}`
          }]
        }]),
        assignmentStatus: 'unassigned',
      }));

      for (const trace of traces) {
        testDb.insert(schema.traces).values(trace).run();
      }

      mockAi = {
        run: vi.fn(() => Promise.resolve({
          shape: [1, 768],
          data: [Array(768).fill(0.5)]
        }))
      } as any;

      let storedVectors: any[] = [];
      mockVectorize = {
        upsert: vi.fn((vectors: any[]) => {
          storedVectors.push(...vectors);
          return Promise.resolve({ count: vectors.length });
        }),
        query: vi.fn(() => {
          const matches = storedVectors
            .filter(v => v.metadata.status === 'unassigned')
            .map(v => ({ id: v.id, score: 0.9, metadata: v.metadata }));
          return Promise.resolve({ count: matches.length, matches });
        }),
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
          workspaceId: 'workspace_test',
          minClusterSize: 5
        },
        {
          db: mockD1,
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
      expect(result.orphaned_traces).toBe(6);

      // Verify traces marked as orphaned
      const updatedTraces = testDb.select().from(schema.traces).all();
      expect(updatedTraces.every(t => t.assignmentStatus === 'orphaned')).toBe(true);
    });
  });

  describe('No unassigned traces', () => {
    it('should complete successfully with no action when no unassigned traces exist', async () => {
      // No traces inserted, database is empty

      mockAi = { run: vi.fn() } as any;
      mockVectorize = { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() } as any;

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_6',
          workspaceId: 'workspace_test'
        },
        {
          db: mockD1,
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
          workspaceId: 'workspace_test',
          traceId: 'langfuse_1',
          source: 'langfuse',
          timestamp: new Date().toISOString(),
          steps: JSON.stringify([{
            messages_added: [{
              role: 'user',
              content: 'Hello'
            }]
          }]),
          assignmentStatus: 'unassigned',
        },
        {
          id: 'trace_2',
          workspaceId: 'workspace_test',
          traceId: 'langfuse_2',
          source: 'langfuse',
          timestamp: new Date().toISOString(),
          steps: JSON.stringify([]), // Empty steps
          assignmentStatus: 'unassigned',
        }
      ];

      for (const trace of traces) {
        testDb.insert(schema.traces).values(trace).run();
      }

      mockAi = { run: vi.fn() } as any;
      mockVectorize = { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() } as any;

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_7',
          workspaceId: 'workspace_test'
        },
        {
          db: mockD1,
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

      // Verify traces were marked as orphaned
      const updatedTraces = testDb.select().from(schema.traces).all();
      expect(updatedTraces.every(t => t.assignmentStatus === 'orphaned')).toBe(true);
    });

    it('should skip system messages with empty content', async () => {
      const traces = [
        {
          id: 'trace_1',
          workspaceId: 'workspace_test',
          traceId: 'langfuse_1',
          source: 'langfuse',
          timestamp: new Date().toISOString(),
          steps: JSON.stringify([{
            messages_added: [{
              role: 'system',
              content: ''  // Empty content should be skipped
            }, {
              role: 'user',
              content: 'Hello'
            }]
          }]),
          assignmentStatus: 'unassigned',
        }
      ];

      testDb.insert(schema.traces).values(traces[0]).run();

      mockAi = { run: vi.fn() } as any;
      mockVectorize = { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() } as any;

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_8',
          workspaceId: 'workspace_test'
        },
        {
          db: mockD1,
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
          workspaceId: 'workspace_test',
          traceId: 'langfuse_1',
          source: 'langfuse',
          timestamp: new Date().toISOString(),
          steps: JSON.stringify([{
            messages_added: null,  // null instead of array
            tool_calls: []
          }]),
          assignmentStatus: 'unassigned',
        }
      ];

      testDb.insert(schema.traces).values(traces[0]).run();

      mockAi = { run: vi.fn() } as any;
      mockVectorize = { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() } as any;

      const job = new AgentDiscoveryJob(
        {
          jobId: 'job_9',
          workspaceId: 'workspace_test'
        },
        {
          db: mockD1,
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
        workspaceId: 'workspace_test',
        traceId: `langfuse_${i}`,
        source: 'langfuse',
        timestamp: new Date().toISOString(),
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
        ]),
        assignmentStatus: 'unassigned',
      }));

      for (const trace of traces) {
        testDb.insert(schema.traces).values(trace).run();
      }

      mockAi = {
        run: vi.fn(() => Promise.resolve({
          shape: [1, 768],
          data: [Array(768).fill(0.5)]
        }))
      } as any;

      let storedVectors: any[] = [];
      mockVectorize = {
        upsert: vi.fn((vectors: any[]) => {
          storedVectors.push(...vectors);
          return Promise.resolve({ count: vectors.length });
        }),
        query: vi.fn(() => {
          const matches = storedVectors
            .filter(v => v.metadata.status === 'unassigned')
            .map(v => ({ id: v.id, score: 0.95, metadata: v.metadata }));
          return Promise.resolve({ count: matches.length, matches });
        }),
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
          workspaceId: 'workspace_test',
          minClusterSize: 5
        },
        {
          db: mockD1,
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

    it('should use first system message when multiple exist in same step', async () => {
      const traces = Array(5).fill(null).map((_, i) => ({
        id: `trace_${i}`,
        workspaceId: 'workspace_test',
        traceId: `langfuse_${i}`,
        source: 'langfuse',
        timestamp: new Date().toISOString(),
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
        }]),
        assignmentStatus: 'unassigned',
      }));

      for (const trace of traces) {
        testDb.insert(schema.traces).values(trace).run();
      }

      mockAi = {
        run: vi.fn(() => Promise.resolve({
          shape: [1, 768],
          data: [Array(768).fill(0.5)]
        }))
      } as any;

      let storedVectors: any[] = [];
      mockVectorize = {
        upsert: vi.fn((vectors: any[]) => {
          storedVectors.push(...vectors);
          return Promise.resolve({ count: vectors.length });
        }),
        query: vi.fn(() => {
          const matches = storedVectors
            .filter(v => v.metadata.status === 'unassigned')
            .map(v => ({ id: v.id, score: 0.95, metadata: v.metadata }));
          return Promise.resolve({ count: matches.length, matches });
        }),
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
          workspaceId: 'workspace_test',
          minClusterSize: 5
        },
        {
          db: mockD1,
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
