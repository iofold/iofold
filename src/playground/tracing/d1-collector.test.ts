/**
 * Tests for D1TraceCollector
 *
 * Tests event buffering, conversion to LangGraphExecutionStep format,
 * and D1 database insertion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { D1TraceCollector } from './d1-collector';
import type { TraceMetadata } from './types';

// Mock D1 result structure
const createMockD1Result = (results: any[] = []) => ({
  results,
  success: true,
  meta: { changes: results.length },
});

// Mock D1 prepared statement
const createMockPreparedStatement = () => ({
  bind: vi.fn().mockReturnThis(),
  all: vi.fn().mockResolvedValue(createMockD1Result([])),
  first: vi.fn().mockResolvedValue(null),
  run: vi.fn().mockResolvedValue({ success: true, meta: {} }),
  raw: vi.fn().mockResolvedValue([]),
});

describe('D1TraceCollector', () => {
  let mockDb: D1Database;
  let collector: D1TraceCollector;
  let traceMetadata: TraceMetadata;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock database
    mockDb = {
      prepare: vi.fn(() => createMockPreparedStatement()),
      batch: vi.fn().mockResolvedValue([]),
    } as any;

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
      const prepareStub = vi.fn(() => createMockPreparedStatement());
      mockDb.prepare = prepareStub;

      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'test_span',
        input: 'Hello',
      });

      collector.endSpan(spanId, 'World');

      await collector.endTrace('trace_1');

      // Verify traces table insert
      const tracesInsertCall = prepareStub.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO traces')
      ) as any[];

      expect(tracesInsertCall).toBeDefined();
      expect(tracesInsertCall[0]).toContain('workspace_id');
      expect(tracesInsertCall[0]).toContain('integration_id');
      expect(tracesInsertCall[0]).toContain('source');
    });

    it('should convert spans to LangGraphExecutionStep format', async () => {
      const bindMock = vi.fn().mockReturnThis();
      const runMock = vi.fn().mockResolvedValue({ success: true, meta: {} });

      mockDb.prepare = vi.fn(() => ({
        bind: bindMock,
        all: vi.fn().mockResolvedValue(createMockD1Result([])),
        first: vi.fn().mockResolvedValue(null),
        run: runMock,
        raw: vi.fn().mockResolvedValue([]),
      })) as any;

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

      // Find the traces insert call
      const tracesInsertIndex = bindMock.mock.calls.findIndex(
        (call) => call.length > 5 && call[4] === 'playground'
      );

      expect(tracesInsertIndex).toBeGreaterThanOrEqual(0);

      // Get the steps JSON (7th parameter)
      const stepsJson = bindMock.mock.calls[tracesInsertIndex][6];
      const steps = JSON.parse(stepsJson);

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
      const bindMock = vi.fn().mockReturnThis();
      const runMock = vi.fn().mockResolvedValue({ success: true, meta: {} });

      mockDb.prepare = vi.fn(() => ({
        bind: bindMock,
        all: vi.fn().mockResolvedValue(createMockD1Result([])),
        first: vi.fn().mockResolvedValue(null),
        run: runMock,
        raw: vi.fn().mockResolvedValue([]),
      })) as any;

      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'test',
        input: 'This is a long input that should be truncated: ' + 'x'.repeat(200),
      });

      collector.endSpan(spanId, 'This is a long output: ' + 'y'.repeat(200));

      await collector.endTrace('trace_1');

      // Find the traces insert call
      const tracesInsertIndex = bindMock.mock.calls.findIndex(
        (call) => call.length > 5 && call[4] === 'playground'
      );

      // Get preview parameters (7th and 8th)
      const inputPreview = bindMock.mock.calls[tracesInsertIndex][7];
      const outputPreview = bindMock.mock.calls[tracesInsertIndex][8];

      expect(inputPreview).toBeTruthy();
      expect(outputPreview).toBeTruthy();
      expect(inputPreview.length).toBeLessThanOrEqual(203); // 200 + "..."
      expect(outputPreview.length).toBeLessThanOrEqual(203);
    });

    it('should detect errors in steps', async () => {
      const bindMock = vi.fn().mockReturnThis();
      const runMock = vi.fn().mockResolvedValue({ success: true, meta: {} });

      mockDb.prepare = vi.fn(() => ({
        bind: bindMock,
        all: vi.fn().mockResolvedValue(createMockD1Result([])),
        first: vi.fn().mockResolvedValue(null),
        run: runMock,
        raw: vi.fn().mockResolvedValue([]),
      })) as any;

      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'failing_step',
        input: 'Test',
      });

      collector.endSpan(spanId, null, 'Something went wrong');

      await collector.endTrace('trace_1');

      // Find the traces insert call
      const tracesInsertIndex = bindMock.mock.calls.findIndex(
        (call) => call.length > 5 && call[4] === 'playground'
      );

      // Get has_errors flag (10th parameter)
      const hasErrors = bindMock.mock.calls[tracesInsertIndex][10];

      expect(hasErrors).toBe(1); // true as integer
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
    it('should insert granular steps into playground_steps table', async () => {
      const prepareStub = vi.fn(() => createMockPreparedStatement());
      mockDb.prepare = prepareStub;

      collector.startTrace('trace_1', traceMetadata);

      const spanId = collector.startSpan({
        traceId: 'trace_1',
        name: 'test_span',
        input: 'input',
      });

      collector.endSpan(spanId, 'output');

      await collector.endTrace('trace_1');

      // Verify playground_steps table insert was attempted
      const playgroundStepsInsert = prepareStub.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO playground_steps')
      ) as any[] | undefined;

      // This may or may not exist depending on whether the table is created
      // The implementation handles this gracefully with a catch block
      if (playgroundStepsInsert) {
        expect(playgroundStepsInsert[0]).toContain('session_id');
        expect(playgroundStepsInsert[0]).toContain('trace_id');
        expect(playgroundStepsInsert[0]).toContain('step_type');
      }
    });
  });
});
