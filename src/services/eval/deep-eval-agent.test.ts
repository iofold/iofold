import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @cloudflare/sandbox
vi.mock('@cloudflare/sandbox', async () => {
  const mock = await import('../../sandbox/__mocks__/sandbox-mock');
  return {
    getSandbox: mock.getMockSandbox
  };
});

// Mock LangChain modules
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class ChatOpenAI {
    constructor(public config: any) {}
  },
}));

vi.mock('@langchain/core/tools', () => ({
  tool: vi.fn((fn, schema) => ({ invoke: fn, ...schema })),
}));

vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: vi.fn(() => ({
    streamEvents: vi.fn(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield { event: 'on_chat_model_stream', data: { chunk: { content: '' } } };
      },
    })),
  })),
}));

import { DeepEvalAgent, type DeepEvalAgentConfig } from './deep-eval-agent';

describe('DeepEvalAgent', () => {
  const mockDb = {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    all: vi.fn(),
    first: vi.fn(),
  };

  const mockConfig: DeepEvalAgentConfig = {
    agentId: 'agent_123',
    evalName: 'test_quality',
    db: mockDb as any,
    env: {
      CF_ACCOUNT_ID: 'test',
      CF_AI_GATEWAY_ID: 'test',
      CF_AI_GATEWAY_TOKEN: 'test-token',
    } as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with required config', () => {
    const agent = new DeepEvalAgent(mockConfig);
    expect(agent).toBeDefined();
  });

  it('has correct system prompt with eval name', () => {
    const agent = new DeepEvalAgent(mockConfig);
    const systemPrompt = agent.getSystemPrompt();
    expect(systemPrompt).toContain('eval_test_quality');
    expect(systemPrompt).toContain('80%');
  });
});
