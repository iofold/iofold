/**
 * Tests for PromptExtractor
 *
 * Tests system prompt extraction across different trace formats:
 * - Standard LangGraph format (messages_added with role='system')
 * - Langfuse raw_data.input.messages
 * - Langfuse raw_data.output.messages
 * - Langfuse observations with GENERATION type
 * - Metadata-based prompts
 */

import { describe, it, expect } from 'vitest';
import { PromptExtractor } from './extractor';
import type { Trace, LangGraphExecutionStep } from '../types/trace';

// Helper to create a minimal trace
function createTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    id: 'trace_123',
    trace_id: 'ext_trace_123',
    steps: [],
    source: 'langfuse',
    raw_data: null,
    ...overrides
  };
}

// Helper to create a step with messages
function createStep(messages: Array<{ role: string; content: string }>, metadata: Record<string, any> = {}): LangGraphExecutionStep {
  return {
    step_id: 'step_1',
    trace_id: 'trace_123',
    timestamp: new Date().toISOString(),
    messages_added: messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content
    })),
    tool_calls: [],
    input: {},
    output: {},
    metadata
  };
}

describe('PromptExtractor', () => {
  const extractor = new PromptExtractor();

  describe('extractFromStepMessages (Strategy 1)', () => {
    it('should extract system prompt from step messages', () => {
      const trace = createTrace({
        steps: [
          createStep([
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello' }
          ])
        ]
      });

      const result = extractor.extract(trace);

      expect(result).not.toBeNull();
      expect(result!.content).toBe('You are a helpful assistant.');
      expect(result!.extractionSource).toBe('messages');
    });

    it('should extract from first step with system message', () => {
      const trace = createTrace({
        steps: [
          createStep([{ role: 'user', content: 'First user message' }]),
          createStep([
            { role: 'system', content: 'System prompt in second step' },
            { role: 'user', content: 'Second user message' }
          ])
        ]
      });

      const result = extractor.extract(trace);

      expect(result).not.toBeNull();
      expect(result!.content).toBe('System prompt in second step');
    });

    it('should include step metadata in extraction result', () => {
      const trace = createTrace({
        steps: [
          createStep(
            [{ role: 'system', content: 'Test prompt' }],
            { model: 'gpt-4', tokens: 100 }
          )
        ]
      });

      const result = extractor.extract(trace);

      expect(result!.metadata).toEqual({ model: 'gpt-4', tokens: 100 });
    });

    it('should skip empty content system messages', () => {
      const trace = createTrace({
        steps: [
          createStep([
            { role: 'system', content: '' },
            { role: 'system', content: 'Valid system prompt' }
          ])
        ]
      });

      const result = extractor.extract(trace);

      expect(result!.content).toBe('Valid system prompt');
    });
  });

  describe('extractFromRawDataInput (Strategy 2)', () => {
    it('should extract from raw_data.input.messages', () => {
      const trace = createTrace({
        steps: [],
        raw_data: {
          input: {
            messages: [
              { role: 'system', content: 'System prompt from raw input' },
              { role: 'user', content: 'User message' }
            ]
          }
        }
      });

      const result = extractor.extract(trace);

      expect(result).not.toBeNull();
      expect(result!.content).toBe('System prompt from raw input');
      expect(result!.extractionSource).toBe('input');
      expect(result!.metadata?.originalFormat).toBe('input.messages');
    });

    it('should extract from raw_data.input.system_prompt direct field', () => {
      const trace = createTrace({
        steps: [],
        raw_data: {
          input: {
            system_prompt: 'Direct system prompt field'
          }
        }
      });

      const result = extractor.extract(trace);

      expect(result!.content).toBe('Direct system prompt field');
      expect(result!.extractionSource).toBe('input');
      expect(result!.metadata?.originalFormat).toBe('input.system_prompt');
    });

    it('should handle structured content (stringify if not string)', () => {
      const trace = createTrace({
        steps: [],
        raw_data: {
          input: {
            messages: [
              {
                role: 'system',
                content: { text: 'Structured content', format: 'special' }
              }
            ]
          }
        }
      });

      const result = extractor.extract(trace);

      expect(result!.content).toBe('{"text":"Structured content","format":"special"}');
    });
  });

  describe('extractFromRawDataMetadata (Strategy 3)', () => {
    it('should extract from raw_data.metadata.system_prompt', () => {
      const trace = createTrace({
        steps: [],
        raw_data: {
          metadata: {
            system_prompt: 'Prompt from metadata.system_prompt'
          }
        }
      });

      const result = extractor.extract(trace);

      expect(result!.content).toBe('Prompt from metadata.system_prompt');
      expect(result!.extractionSource).toBe('metadata');
    });

    it('should extract from raw_data.metadata.prompt', () => {
      const trace = createTrace({
        steps: [],
        raw_data: {
          metadata: {
            prompt: 'Prompt from metadata.prompt field'
          }
        }
      });

      const result = extractor.extract(trace);

      expect(result!.content).toBe('Prompt from metadata.prompt field');
      expect(result!.extractionSource).toBe('metadata');
    });
  });

  describe('extractFromLangfuseSpecific (Strategy 4)', () => {
    it('should extract from Langfuse output.messages with type=system', () => {
      const trace = createTrace({
        source: 'langfuse',
        steps: [],
        raw_data: {
          output: {
            messages: [
              { type: 'system', content: 'Langfuse system message' },
              { type: 'human', content: 'User message' }
            ]
          }
        }
      });

      const result = extractor.extract(trace);

      expect(result!.content).toBe('Langfuse system message');
      expect(result!.extractionSource).toBe('raw_data');
      expect(result!.metadata?.originalFormat).toBe('langfuse.output.messages');
    });

    it('should extract from Langfuse observations GENERATION input', () => {
      const trace = createTrace({
        source: 'langfuse',
        steps: [],
        raw_data: {
          observations: [
            {
              id: 'obs_1',
              type: 'GENERATION',
              name: 'chat-completion',
              input: JSON.stringify([
                { role: 'system', content: 'System prompt from observation' },
                { role: 'user', content: 'User message' }
              ])
            }
          ]
        }
      });

      const result = extractor.extract(trace);

      expect(result!.content).toBe('System prompt from observation');
      expect(result!.extractionSource).toBe('raw_data');
      expect(result!.metadata?.originalFormat).toBe('langfuse.observation.input');
      expect(result!.metadata?.observationId).toBe('obs_1');
    });

    it('should handle pre-parsed observation input (not stringified)', () => {
      const trace = createTrace({
        source: 'langfuse',
        steps: [],
        raw_data: {
          observations: [
            {
              id: 'obs_2',
              type: 'GENERATION',
              name: 'llm-call',
              input: [
                { role: 'system', content: 'Pre-parsed observation input' }
              ]
            }
          ]
        }
      });

      const result = extractor.extract(trace);

      expect(result!.content).toBe('Pre-parsed observation input');
    });

    it('should not use Langfuse-specific extraction for non-Langfuse sources', () => {
      const trace = createTrace({
        source: 'openai',  // Not langfuse
        steps: [],
        raw_data: {
          output: {
            messages: [
              { type: 'system', content: 'Should not extract this' }
            ]
          }
        }
      });

      const result = extractor.extract(trace);

      expect(result).toBeNull();
    });
  });

  describe('Strategy priority (fallback chain)', () => {
    it('should prefer step messages over raw_data', () => {
      const trace = createTrace({
        steps: [
          createStep([{ role: 'system', content: 'From step messages' }])
        ],
        raw_data: {
          input: {
            messages: [{ role: 'system', content: 'From raw input' }]
          }
        }
      });

      const result = extractor.extract(trace);

      expect(result!.content).toBe('From step messages');
      expect(result!.extractionSource).toBe('messages');
    });

    it('should fallback to raw_data when steps have no system prompt', () => {
      const trace = createTrace({
        steps: [
          createStep([{ role: 'user', content: 'Only user message' }])
        ],
        raw_data: {
          input: {
            messages: [{ role: 'system', content: 'Fallback to raw input' }]
          }
        }
      });

      const result = extractor.extract(trace);

      expect(result!.content).toBe('Fallback to raw input');
      expect(result!.extractionSource).toBe('input');
    });
  });

  describe('Agent name detection', () => {
    it('should detect agent name from step metadata.agent_name', () => {
      const trace = createTrace({
        steps: [
          createStep(
            [{ role: 'system', content: 'Test' }],
            { agent_name: 'Customer Support Bot' }
          )
        ]
      });

      const result = extractor.extract(trace);

      expect(result!.agentName).toBe('Customer Support Bot');
    });

    it('should derive agent name from step metadata.model', () => {
      const trace = createTrace({
        steps: [
          createStep(
            [{ role: 'system', content: 'Test' }],
            { model: 'gpt-4-turbo' }
          )
        ]
      });

      const result = extractor.extract(trace);

      expect(result!.agentName).toBe('agent_gpt-4-turbo');
    });

    it('should detect agent name from raw_data.name', () => {
      const trace = createTrace({
        steps: [],
        raw_data: {
          name: 'My Custom Agent',
          input: { system_prompt: 'Test' }
        }
      });

      const result = extractor.extract(trace);

      expect(result!.agentName).toBe('My Custom Agent');
    });

    it('should extract agent name from Langfuse tags', () => {
      const trace = createTrace({
        steps: [],
        raw_data: {
          tags: ['env:production', 'agent:code-reviewer', 'version:1.0'],
          input: { system_prompt: 'Test' }
        }
      });

      const result = extractor.extract(trace);

      expect(result!.agentName).toBe('code-reviewer');
    });

    it('should fallback to unknown_agent when no name found', () => {
      const trace = createTrace({
        steps: [],
        raw_data: {
          input: { system_prompt: 'Test' }
        }
      });

      const result = extractor.extract(trace);

      expect(result!.agentName).toBe('unknown_agent');
    });
  });

  describe('No extraction scenarios', () => {
    it('should return null for empty trace', () => {
      const trace = createTrace({
        steps: [],
        raw_data: null
      });

      const result = extractor.extract(trace);

      expect(result).toBeNull();
    });

    it('should return null when no system prompt exists anywhere', () => {
      const trace = createTrace({
        steps: [
          createStep([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' }
          ])
        ],
        raw_data: {
          input: {
            messages: [
              { role: 'user', content: 'User only' }
            ]
          }
        }
      });

      const result = extractor.extract(trace);

      expect(result).toBeNull();
    });

    it('should return null for trace with empty steps array', () => {
      const trace = createTrace({
        steps: [],
        raw_data: {}
      });

      const result = extractor.extract(trace);

      expect(result).toBeNull();
    });
  });

  describe('hashPromptContent', () => {
    it('should generate consistent SHA-256 hash for same content', async () => {
      const content = 'You are a helpful assistant.';

      const hash1 = await extractor.hashPromptContent(content);
      const hash2 = await extractor.hashPromptContent(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it('should generate different hashes for different content', async () => {
      const hash1 = await extractor.hashPromptContent('Content A');
      const hash2 = await extractor.hashPromptContent('Content B');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('extractBatch', () => {
    it('should extract prompts from multiple traces', async () => {
      const traces = [
        createTrace({
          id: 'trace_1',
          steps: [createStep([{ role: 'system', content: 'Prompt 1' }])]
        }),
        createTrace({
          id: 'trace_2',
          steps: [createStep([{ role: 'system', content: 'Prompt 2' }])]
        })
      ];

      const results = await extractor.extractBatch(traces);

      expect(results.size).toBe(2);
    });

    it('should deduplicate identical prompts by hash', async () => {
      const traces = [
        createTrace({
          id: 'trace_1',
          steps: [createStep([{ role: 'system', content: 'Same prompt' }])]
        }),
        createTrace({
          id: 'trace_2',
          steps: [createStep([{ role: 'system', content: 'Same prompt' }])]  // Duplicate
        }),
        createTrace({
          id: 'trace_3',
          steps: [createStep([{ role: 'system', content: 'Different prompt' }])]
        })
      ];

      const results = await extractor.extractBatch(traces);

      expect(results.size).toBe(2); // Only 2 unique prompts
    });

    it('should skip traces without system prompts', async () => {
      const traces = [
        createTrace({
          id: 'trace_1',
          steps: [createStep([{ role: 'system', content: 'Valid prompt' }])]
        }),
        createTrace({
          id: 'trace_2',
          steps: [createStep([{ role: 'user', content: 'No system prompt' }])]
        })
      ];

      const results = await extractor.extractBatch(traces);

      expect(results.size).toBe(1);
    });

    it('should include hash in result objects', async () => {
      const traces = [
        createTrace({
          id: 'trace_1',
          steps: [createStep([{ role: 'system', content: 'Test prompt' }])]
        })
      ];

      const results = await extractor.extractBatch(traces);

      const firstResult = results.values().next().value;
      expect(firstResult).toHaveProperty('hash');
      expect(firstResult.hash).toHaveLength(64);
    });
  });

  describe('Real-world trace formats', () => {
    it('should handle Langfuse trace with reasoning blocks', () => {
      const trace = createTrace({
        source: 'langfuse',
        steps: [],
        raw_data: {
          output: {
            messages: [
              {
                type: 'system',
                content: [
                  { type: 'text', text: 'You are a helpful assistant.' },
                  { type: 'reasoning', text: 'Internal reasoning here' }
                ]
              }
            ]
          }
        }
      });

      const result = extractor.extract(trace);

      // Should stringify the structured content
      expect(result).not.toBeNull();
      expect(result!.content).toContain('You are a helpful assistant');
    });

    it('should handle playground trace format', () => {
      const trace = createTrace({
        source: 'playground',
        steps: [
          createStep([
            { role: 'system', content: 'You are a code assistant. Help users write clean code.' }
          ], { model: 'claude-sonnet-4-5-20250929' })
        ]
      });

      const result = extractor.extract(trace);

      expect(result!.content).toBe('You are a code assistant. Help users write clean code.');
      expect(result!.extractionSource).toBe('messages');
    });
  });
});
