import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptImprovementJob } from './prompt-improvement-job';
import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types';
import type { PromptImprovementJobResult } from '../types/agent';

// Mock chat.completions.create function
const mockChatCompletionsCreate = vi.fn();

// Mock OpenAI SDK
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockChatCompletionsCreate
        }
      }
    }))
  };
});

// Mock AI Gateway module to bypass token validation
vi.mock('../ai/gateway', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    createGatewayClient: vi.fn(() => ({
      chat: {
        completions: {
          create: mockChatCompletionsCreate
        }
      }
    }))
  };
});

describe('PromptImprovementJob', () => {
  let mockDb: D1Database;
  let job: PromptImprovementJob;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockChatCompletionsCreate.mockReset();

    // Mock D1 Database
    const createMockPreparedStatement = (results: any[] = []): D1PreparedStatement => {
      return {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(results[0] || null),
        all: vi.fn().mockResolvedValue({ results }),
        run: vi.fn().mockResolvedValue({ success: true }),
        raw: vi.fn().mockResolvedValue(results)
      } as any;
    };

    mockDb = {
      prepare: vi.fn((sql: string) => {
        // Return different results based on SQL query
        if (sql.includes('FROM agents')) {
          return createMockPreparedStatement([{
            id: 'agent_123',
            active_version_id: 'agv_active_1'
          }]);
        }
        if (sql.includes('FROM agent_versions') && sql.includes('WHERE id = ?')) {
          return createMockPreparedStatement([{
            prompt_template: 'You are a helpful assistant. Help the user with {{task}}.',
            variables: JSON.stringify(['task'])
          }]);
        }
        if (sql.includes('FROM feedback f')) {
          // Contradictions query
          return createMockPreparedStatement([
            {
              trace_id: 'trace_1',
              human_rating: 'positive',
              predicted_result: 0,
              predicted_reason: 'Failed to understand context',
              trace_data: JSON.stringify({ input: 'test input', output: 'test output' })
            },
            {
              trace_id: 'trace_2',
              human_rating: 'negative',
              predicted_result: 1,
              predicted_reason: 'Incorrectly passed validation',
              trace_data: JSON.stringify({ input: 'bad input', output: 'bad output' })
            }
          ]);
        }
        if (sql.includes('FROM prompt_best_practices')) {
          return createMockPreparedStatement([
            {
              title: 'Be Specific',
              content: 'Use specific instructions rather than vague guidance',
              category: 'clarity'
            },
            {
              title: 'Provide Examples',
              content: 'Include examples to clarify expected behavior',
              category: 'structure'
            }
          ]);
        }
        if (sql.includes('MAX(version)')) {
          return createMockPreparedStatement([{ max_version: 2 }]);
        }
        if (sql.includes('INSERT INTO agent_versions')) {
          return createMockPreparedStatement([]);
        }
        if (sql.includes('INSERT INTO jobs') || sql.includes('UPDATE jobs')) {
          return createMockPreparedStatement([]);
        }
        return createMockPreparedStatement([]);
      }),
      batch: vi.fn().mockResolvedValue([])
    } as any;
  });

  describe('Happy path: contradictions → improved prompt', () => {
    it('should generate improved prompt when contradictions exist', async () => {
      // Setup: Mock OpenAI responses
      mockChatCompletionsCreate
        .mockResolvedValueOnce({
          // First call: failure analysis
          choices: [{
            message: {
              content: JSON.stringify({
                failure_patterns: [
                  'Fails on multi-part questions',
                  'Struggles with ambiguous requests'
                ],
                summary: 'The prompt lacks clarity on handling complex queries'
              })
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          model: 'anthropic/claude-sonnet-4-5'
        })
        .mockResolvedValueOnce({
          // Second call: improved prompt
          choices: [{
            message: {
              content: JSON.stringify({
                improved_prompt: 'You are a helpful assistant. When handling {{task}}, break it down into steps and address each part clearly.',
                changes: [
                  'Added instruction to break down complex tasks',
                  'Clarified handling of multi-part questions'
                ],
                reasoning: 'The improvements address failure patterns by explicitly guiding the agent to handle complex queries step-by-step'
              })
            }
          }],
          usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
          model: 'anthropic/claude-sonnet-4-5'
        });

      job = new PromptImprovementJob(
        {
          jobId: 'job_123',
          agentId: 'agent_123',
          workspaceId: 'ws_123',
          maxContradictions: 20
        },
        {
          db: mockDb,
          cfAccountId: 'test-account-id',
          cfGatewayId: 'test-gateway-id',
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      // Assertions
      expect(result.new_version_id).toMatch(/^agv_/);
      expect(result.new_version_number).toBe(3); // max was 2, so next is 3
      expect(result.failure_patterns).toHaveLength(2);
      expect(result.failure_patterns).toContain('Fails on multi-part questions');
      expect(result.best_practices_applied).toHaveLength(2);
      expect(result.changes_summary).toContain('step-by-step');

      // Verify agent_versions INSERT was called
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_versions')
      );

      // Verify job completion
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE jobs')
      );
    });
  });

  describe('No contradictions (early return)', () => {
    it('should complete job without improvement when no contradictions', async () => {
      // Override contradictions query to return empty
      mockDb.prepare = vi.fn((sql: string) => {
        const createMockStmt = (results: any[] = []): D1PreparedStatement => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(results[0] || null),
          all: vi.fn().mockResolvedValue({ results }),
          run: vi.fn().mockResolvedValue({ success: true }),
          raw: vi.fn().mockResolvedValue(results)
        } as any);

        if (sql.includes('FROM agents')) {
          return createMockStmt([{
            id: 'agent_123',
            active_version_id: 'agv_active_1'
          }]);
        }
        if (sql.includes('FROM agent_versions')) {
          return createMockStmt([{
            prompt_template: 'Test prompt',
            variables: JSON.stringify([])
          }]);
        }
        if (sql.includes('FROM feedback f')) {
          // No contradictions
          return createMockStmt([]);
        }
        return createMockStmt([]);
      });

      job = new PromptImprovementJob(
        {
          jobId: 'job_123',
          agentId: 'agent_123',
          workspaceId: 'ws_123'
        },
        {
          db: mockDb,
          cfAccountId: 'test-account-id',
          cfGatewayId: 'test-gateway-id',
          cfGatewayToken: 'test-token'
        }
      );

      const result = await job.execute();

      expect(result.new_version_id).toBe('');
      expect(result.new_version_number).toBe(0);
      expect(result.changes_summary).toContain('No contradictions found');
      expect(result.failure_patterns).toHaveLength(0);
      expect(result.best_practices_applied).toHaveLength(0);

      // Verify OpenAI was NOT called
      expect(mockChatCompletionsCreate).not.toHaveBeenCalled();

      // Verify no version was created
      expect(mockDb.prepare).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_versions')
      );
    });
  });

  describe('Best practices applied correctly', () => {
    it('should fetch and apply best practices in meta-prompt', async () => {
      mockChatCompletionsCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                failure_patterns: ['Pattern 1'],
                summary: 'Summary'
              })
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          model: 'anthropic/claude-sonnet-4-5'
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                improved_prompt: 'Improved prompt with best practices',
                changes: ['Applied best practice: Be Specific'],
                reasoning: 'Used clarity guidelines'
              })
            }
          }],
          usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
          model: 'anthropic/claude-sonnet-4-5'
        });

      job = new PromptImprovementJob(
        {
          jobId: 'job_123',
          agentId: 'agent_123',
          workspaceId: 'ws_123'
        },
        {
          db: mockDb,
          cfAccountId: 'test-account-id',
          cfGatewayId: 'test-gateway-id',
          cfGatewayToken: 'test-token'
        }
      );

      await job.execute();

      // Verify best practices query was called
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('FROM prompt_best_practices')
      );

      // Verify OpenAI was called with best practices in prompt
      const secondOpenAICall = mockChatCompletionsCreate.mock.calls[1];
      expect(secondOpenAICall[0].messages[0].content).toContain('Be Specific');
      expect(secondOpenAICall[0].messages[0].content).toContain('Provide Examples');
    });
  });

  describe('LLM failure handling', () => {
    it('should handle OpenAI API failure gracefully', async () => {
      mockChatCompletionsCreate.mockRejectedValueOnce(
        new Error('OpenAI API error: rate limit exceeded')
      );

      job = new PromptImprovementJob(
        {
          jobId: 'job_123',
          agentId: 'agent_123',
          workspaceId: 'ws_123'
        },
        {
          db: mockDb,
          cfAccountId: 'test-account-id',
          cfGatewayId: 'test-gateway-id',
          cfGatewayToken: 'test-token'
        }
      );

      await expect(job.execute()).rejects.toThrow('OpenAI API error');

      // Verify job was marked as failed
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE jobs')
      );
    });

    it('should handle invalid JSON response from OpenAI', async () => {
      // First call: valid failure analysis
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              failure_patterns: ['Pattern'],
              summary: 'Summary'
            })
          }
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        model: 'anthropic/claude-sonnet-4-5'
      });

      // Second call: invalid JSON response
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'This is not valid JSON'
          }
        }],
        usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
        model: 'anthropic/claude-sonnet-4-5'
      });

      job = new PromptImprovementJob(
        {
          jobId: 'job_123',
          agentId: 'agent_123',
          workspaceId: 'ws_123'
        },
        {
          db: mockDb,
          cfAccountId: 'test-account-id',
          cfGatewayId: 'test-gateway-id',
          cfGatewayToken: 'test-token'
        }
      );

      // Should throw due to invalid JSON in improvement response
      await expect(job.execute()).rejects.toThrow();

      // Verify both OpenAI calls were made
      expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(2);
    });

    it('should handle missing required fields in improved prompt response', async () => {
      mockChatCompletionsCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                failure_patterns: ['Pattern'],
                summary: 'Summary'
              })
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          model: 'anthropic/claude-sonnet-4-5'
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                improved_prompt: 'Some prompt',
                // Missing 'changes' and 'reasoning'
              })
            }
          }],
          usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
          model: 'anthropic/claude-sonnet-4-5'
        });

      job = new PromptImprovementJob(
        {
          jobId: 'job_123',
          agentId: 'agent_123',
          workspaceId: 'ws_123'
        },
        {
          db: mockDb,
          cfAccountId: 'test-account-id',
          cfGatewayId: 'test-gateway-id',
          cfGatewayToken: 'test-token'
        }
      );

      await expect(job.execute()).rejects.toThrow('Invalid improved prompt format');
    });
  });

  describe('Variables preserved in improved prompt', () => {
    it('should preserve all variables from original prompt', async () => {
      // Setup with multiple variables
      mockDb.prepare = vi.fn((sql: string) => {
        const createMockStmt = (results: any[] = []): D1PreparedStatement => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(results[0] || null),
          all: vi.fn().mockResolvedValue({ results }),
          run: vi.fn().mockResolvedValue({ success: true }),
          raw: vi.fn().mockResolvedValue(results)
        } as any);

        if (sql.includes('FROM agents')) {
          return createMockStmt([{
            id: 'agent_123',
            active_version_id: 'agv_active_1'
          }]);
        }
        if (sql.includes('FROM agent_versions') && sql.includes('WHERE id = ?')) {
          return createMockStmt([{
            prompt_template: 'You are {{role}} helping with {{task}} in {{language}}.',
            variables: JSON.stringify(['role', 'task', 'language'])
          }]);
        }
        if (sql.includes('FROM feedback f')) {
          return createMockStmt([
            {
              trace_id: 'trace_1',
              human_rating: 'positive',
              predicted_result: 0,
              predicted_reason: 'Test',
              trace_data: JSON.stringify({})
            }
          ]);
        }
        if (sql.includes('FROM prompt_best_practices')) {
          return createMockStmt([]);
        }
        if (sql.includes('MAX(version)')) {
          return createMockStmt([{ max_version: 1 }]);
        }
        return createMockStmt([]);
      });

      mockChatCompletionsCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                failure_patterns: ['Pattern'],
                summary: 'Summary'
              })
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          model: 'anthropic/claude-sonnet-4-5'
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                improved_prompt: 'You are {{role}} expertly handling {{task}} in {{language}}.',
                changes: ['Enhanced clarity'],
                reasoning: 'Improved wording'
              })
            }
          }],
          usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
          model: 'anthropic/claude-sonnet-4-5'
        });

      job = new PromptImprovementJob(
        {
          jobId: 'job_123',
          agentId: 'agent_123',
          workspaceId: 'ws_123'
        },
        {
          db: mockDb,
          cfAccountId: 'test-account-id',
          cfGatewayId: 'test-gateway-id',
          cfGatewayToken: 'test-token'
        }
      );

      await job.execute();

      // Verify the meta-prompt includes all variables
      const secondOpenAICall = mockChatCompletionsCreate.mock.calls[1];
      const metaPrompt = secondOpenAICall[0].messages[0].content;
      expect(metaPrompt).toContain('role, task, language');
      expect(metaPrompt).toContain('Preserve these variables');

      // Verify INSERT preserves variables
      const insertCall = (mockDb.prepare as any).mock.calls.find((call: any) =>
        call[0].includes('INSERT INTO agent_versions')
      );
      expect(insertCall).toBeDefined();
    });
  });

  describe('Agent without active version', () => {
    it('should throw error if agent has no active version', async () => {
      mockDb.prepare = vi.fn((sql: string) => {
        const createMockStmt = (results: any[] = []): D1PreparedStatement => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(results[0] || null),
          all: vi.fn().mockResolvedValue({ results }),
          run: vi.fn().mockResolvedValue({ success: true }),
          raw: vi.fn().mockResolvedValue(results)
        } as any);

        if (sql.includes('FROM agents')) {
          return createMockStmt([{
            id: 'agent_123',
            active_version_id: null // No active version
          }]);
        }
        return createMockStmt([]);
      });

      job = new PromptImprovementJob(
        {
          jobId: 'job_123',
          agentId: 'agent_123',
          workspaceId: 'ws_123'
        },
        {
          db: mockDb,
          cfAccountId: 'test-account-id',
          cfGatewayId: 'test-gateway-id',
          cfGatewayToken: 'test-token'
        }
      );

      await expect(job.execute()).rejects.toThrow('Agent has no active version to improve');
    });
  });

  describe('SSE streaming', () => {
    it('should emit progress events throughout execution', async () => {
      const mockStream = {
        sendProgress: vi.fn(),
        sendCompleted: vi.fn(),
        sendFailed: vi.fn()
      };

      mockChatCompletionsCreate
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                failure_patterns: ['Pattern'],
                summary: 'Summary'
              })
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          model: 'anthropic/claude-sonnet-4-5'
        })
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                improved_prompt: 'Improved',
                changes: ['Change'],
                reasoning: 'Reason'
              })
            }
          }],
          usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
          model: 'anthropic/claude-sonnet-4-5'
        });

      job = new PromptImprovementJob(
        {
          jobId: 'job_123',
          agentId: 'agent_123',
          workspaceId: 'ws_123'
        },
        {
          db: mockDb,
          cfAccountId: 'test-account-id',
          cfGatewayId: 'test-gateway-id',
          cfGatewayToken: 'test-token'
        }
      );

      await job.execute(mockStream as any);

      // Verify progress events were emitted
      expect(mockStream.sendProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'fetching_agent', progress: 0 })
      );
      expect(mockStream.sendProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'fetching_contradictions', progress: 10 })
      );
      expect(mockStream.sendProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'analyzing_failures', progress: 30 })
      );
      expect(mockStream.sendProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed', progress: 100 })
      );
    });
  });
});
