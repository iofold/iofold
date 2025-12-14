/**
 * Tests for D1TraceCollector
 *
 * Tests event buffering, conversion to LangGraphExecutionStep format,
 * and D1 database insertion using real in-memory SQLite.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { D1TraceCollector } from './d1-collector';
import type { TraceMetadata } from './types';
import { createTestDb, createMockD1, schema } from '../../../tests/utils/test-db';

describe('D1TraceCollector', () => {
  let mockDb: D1Database;
  let collector: D1TraceCollector;
  let traceMetadata: TraceMetadata;

  beforeEach(() => {
    // Create fresh in-memory database with schema
    const { db, sqlite } = createTestDb();

    // Seed required data
    db.insert(schema.users).values({
      id: 'user_test',
      email: 'test@example.com',
    }).run();

    db.insert(schema.workspaces).values({
      id: 'ws_123',
      userId: 'user_test',
      name: 'Test Workspace',
    }).run();

    db.insert(schema.agents).values({
      id: 'agent_123',
      workspaceId: 'ws_123',
      name: 'Test Agent',
      status: 'confirmed',
    }).run();

    db.insert(schema.agentVersions).values({
      id: 'av_123',
      agentId: 'agent_123',
      version: 1,
      promptTemplate: 'Test prompt',
      source: 'manual',
      status: 'active',
    }).run();

    // Create an integration with ID 'playground' to satisfy foreign key constraint
    db.insert(schema.integrations).values({
      id: 'playground',
      workspaceId: 'ws_123',
      name: 'Playground',
      platform: 'internal',
      apiKeyEncrypted: 'n/a',
      status: 'active',
    }).run();

    // Create mock D1 interface from SQLite
    mockDb = createMockD1(sqlite);
    collector = new D1TraceCollector(mockDb);

    traceMetadata = {
      sessionId: 'sess_test_123',
      agentId: 'agent_123',
      agentVersionId: 'av_123',
      workspaceId: 'ws_123',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4-5-20250929',
    };
  });

  describe('Basic event buffering', () => {
    it('should buffer span start and end events', () => {
      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'test_span',
        input: { message: 'Hello' },
      });

      expect(spanId).toMatch(/^span_trace_1_\d+$/);

      collector.endSpan(spanId, { response: 'Hi' });

      expect(collector.getCurrentTraceId()).toBe('trace_1');
    });

    it('should handle multiple spans', () => {
      collector.startTrace('trace_1', traceMetadata);

      const span1 = collector.startSpan({
        traceId: 'trace_1',
        name: 'llm_call',
        input: 'Question?',
      });

      const span2 = collector.startSpan({
        traceId: 'trace_1',
        parentSpanId: span1,
        name: 'tool_call',
        input: { tool: 'calculator' },
      });

      collector.endSpan(span1, 'Answer');
      collector.endSpan(span2, { result: 42 });

      expect(collector.getCurrentTraceId()).toBe('trace_1');
    });
  });

  describe('Generation events', () => {
    it('should log generation event with token usage', () => {
      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'llm_generation',
      });

      collector.logGeneration({
        traceId: 'trace_1',
        spanId,
        name: 'claude_call',
        input: { prompt: 'What is 2+2?' },
        output: { content: '4' },
        usage: {
          inputTokens: 10,
          outputTokens: 2,
        },
        latencyMs: 150,
      });

      collector.endSpan(spanId, { content: '4' });

      expect(collector.getCurrentTraceId()).toBe('trace_1');
    });
  });

  describe('Tool call events', () => {
    it('should log tool call and result', () => {
      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'calculator_tool',
      });

      collector.logToolCall({
        traceId: 'trace_1',
        spanId,
        toolName: 'calculator',
        input: { expression: '2+2' },
      });

      collector.logToolResult(spanId, { result: 4 });

      collector.endSpan(spanId);

      expect(collector.getCurrentTraceId()).toBe('trace_1');
    });

    it('should handle tool errors', () => {
      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'failing_tool',
      });

      collector.logToolCall({
        traceId: 'trace_1',
        spanId,
        toolName: 'file_read',
        input: { path: '/nonexistent' },
      });

      collector.logToolResult(spanId, null, 'File not found');

      collector.endSpan(spanId, null, 'Tool execution failed');

      expect(collector.getCurrentTraceId()).toBe('trace_1');
    });
  });

  describe('Flush and DB insertion', () => {
    it('should insert trace into traces table', async () => {
      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'test_span',
        input: 'Hello',
      });

      collector.endSpan(spanId, 'World');

      await collector.endTrace('trace_1');

      // Verify trace was inserted
      const result = await mockDb.prepare(
        'SELECT * FROM traces WHERE trace_id = ?'
      ).bind('trace_1').first();

      expect(result).toBeDefined();
      expect((result as any).workspace_id).toBe('ws_123');
      expect((result as any).source).toBe('playground');
      expect((result as any).agent_version_id).toBe('av_123');
    });

    it('should convert spans to LangGraphExecutionStep format', async () => {
      collector.startTrace('trace_1', traceMetadata);

      // Create LLM call span
      const llmSpan = collector.startSpan({
        traceId: 'trace_1',
        name: 'llm_call',
        input: { messages: [{ role: 'user', content: 'Hello' }] },
      });

      collector.logGeneration({
        traceId: 'trace_1',
        spanId: llmSpan,
        name: 'claude',
        input: { messages: [{ role: 'user', content: 'Hello' }] },
        output: { content: 'Hi there!' },
        usage: { inputTokens: 5, outputTokens: 3 },
      });

      collector.endSpan(llmSpan, { content: 'Hi there!' });

      // Create tool call span
      const toolSpan = collector.startSpan({
        traceId: 'trace_1',
        name: 'calculator',
        input: { expression: '2+2' },
      });

      collector.logToolCall({
        traceId: 'trace_1',
        spanId: toolSpan,
        toolName: 'calculator',
        input: { expression: '2+2' },
      });

      collector.logToolResult(toolSpan, 4);
      collector.endSpan(toolSpan, 4);

      await collector.endTrace('trace_1');

      // Verify steps were inserted correctly
      const result = await mockDb.prepare(
        'SELECT steps FROM traces WHERE trace_id = ?'
      ).bind('trace_1').first();

      expect(result).toBeDefined();
      const steps = JSON.parse((result as any).steps);

      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBe(2);

      // Verify first step (LLM call)
      expect(steps[0]).toHaveProperty('step_id');
      expect(steps[0]).toHaveProperty('trace_id', 'trace_1');
      expect(steps[0]).toHaveProperty('timestamp');
      expect(steps[0]).toHaveProperty('messages_added');
      expect(steps[0]).toHaveProperty('tool_calls');
      expect(steps[0]).toHaveProperty('metadata');
      expect(steps[0].metadata).toHaveProperty('tokens_input', 5);
      expect(steps[0].metadata).toHaveProperty('tokens_output', 3);

      // Verify second step (tool call)
      expect(steps[1].tool_calls).toHaveLength(1);
      expect(steps[1].tool_calls[0]).toHaveProperty('tool_name', 'calculator');
      expect(steps[1].tool_calls[0]).toHaveProperty('result', 4);
    });

    it('should generate input and output previews', async () => {
      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'test',
        input: 'This is a long input that should be truncated: ' + 'x'.repeat(200),
      });

      collector.endSpan(spanId, 'This is a long output: ' + 'y'.repeat(200));

      await collector.endTrace('trace_1');

      // Verify previews were generated
      const result = await mockDb.prepare(
        'SELECT input_preview, output_preview FROM traces WHERE trace_id = ?'
      ).bind('trace_1').first();

      expect(result).toBeDefined();
      const inputPreview = (result as any).input_preview;
      const outputPreview = (result as any).output_preview;

      expect(inputPreview).toBeTruthy();
      expect(outputPreview).toBeTruthy();
      expect(inputPreview.length).toBeLessThanOrEqual(203); // 200 + "..."
      expect(outputPreview.length).toBeLessThanOrEqual(203);
    });

    it('should detect errors in steps', async () => {
      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'failing_step',
        input: 'Test',
      });

      collector.endSpan(spanId, null, 'Something went wrong');

      await collector.endTrace('trace_1');

      // Verify has_errors flag was set
      const result = await mockDb.prepare(
        'SELECT has_errors FROM traces WHERE trace_id = ?'
      ).bind('trace_1').first();

      expect(result).toBeDefined();
      expect((result as any).has_errors).toBe(1); // true as integer
    });
  });

  describe('Clear functionality', () => {
    it('should clear all buffered data', () => {
      collector.startTrace('trace_1', traceMetadata);

      collector.startSpan({
        traceId: 'trace_1',
        name: 'test',
        input: 'data',
      });

      expect(collector.getCurrentTraceId()).toBe('trace_1');

      collector.clear();

      expect(collector.getCurrentTraceId()).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should throw error if flushing without initialization', async () => {
      await expect(collector.flush()).rejects.toThrow(
        'Cannot flush: trace not initialized'
      );
    });

    it('should throw error if ending wrong trace', async () => {
      collector.startTrace('trace_1', traceMetadata);

      await expect(collector.endTrace('trace_2')).rejects.toThrow(
        'Trace ID mismatch'
      );
    });

    it('should warn when ending non-existent span', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      collector.startTrace('trace_1', traceMetadata);
      collector.endSpan('non_existent_span', 'output');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Span non_existent_span not found')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Playground steps table insertion', () => {
    it('should attempt to insert granular steps into playground_steps table', async () => {
      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'test_span',
        input: 'input',
      });

      collector.endSpan(spanId, 'output');

      // This should not throw even though playground_steps table doesn't exist
      // The collector handles missing table gracefully
      await expect(collector.endTrace('trace_1')).resolves.not.toThrow();

      // Verify trace was still inserted into traces table
      const result = await mockDb.prepare(
        'SELECT * FROM traces WHERE trace_id = ?'
      ).bind('trace_1').first();

      expect(result).toBeDefined();
    });
  });
});
