/**
 * Tests for trace parser
 */

import { describe, it, expect } from '@jest/globals'
import {
  parseTrace,
  extractLastExchange,
  extractToolCalls,
  truncateMessage,
  formatRelativeTime,
  formatDuration,
  getStatusEmoji,
  validateTrace,
  parseTraces,
} from '../trace-parser'
import type { Trace, ExecutionStep } from '@/types/api'

describe('trace-parser', () => {
  describe('truncateMessage', () => {
    it('should not truncate short messages', () => {
      const result = truncateMessage('Hello world', 200)
      expect(result.content).toBe('Hello world')
      expect(result.truncated).toBe(false)
    })

    it('should truncate long messages at word boundary', () => {
      const longText = 'This is a very long message that needs to be truncated because it exceeds the maximum length allowed for display in the card interface. We want to make sure it cuts at a word boundary and adds ellipsis.'
      const result = truncateMessage(longText, 50)
      expect(result.content).toContain('...')
      expect(result.content.length).toBeLessThan(longText.length)
      expect(result.truncated).toBe(true)
      expect(result.fullContent).toBe(longText)
    })

    it('should handle null/undefined text', () => {
      const result1 = truncateMessage(null, 200)
      expect(result1.content).toBe('')
      expect(result1.truncated).toBe(false)

      const result2 = truncateMessage(undefined, 200)
      expect(result2.content).toBe('')
      expect(result2.truncated).toBe(false)
    })

    it('should handle non-string content', () => {
      const obj = { foo: 'bar' }
      const result = truncateMessage(obj as any, 200)
      expect(result.content).toContain('foo')
    })
  })

  describe('extractLastExchange', () => {
    it('should extract last human and assistant messages', () => {
      const steps: ExecutionStep[] = [
        {
          step_id: '1',
          timestamp: '2025-11-13T12:00:00Z',
          messages_added: [
            { role: 'user', content: 'First question' },
            { role: 'assistant', content: 'First answer' },
          ],
          tool_calls: [],
          input: null,
          output: null,
          metadata: {},
        },
        {
          step_id: '2',
          timestamp: '2025-11-13T12:00:01Z',
          messages_added: [
            { role: 'user', content: 'Second question' },
            { role: 'assistant', content: 'Second answer' },
          ],
          tool_calls: [],
          input: null,
          output: null,
          metadata: {},
        },
      ]

      const result = extractLastExchange(steps)
      expect(result.human?.content).toBe('Second question')
      expect(result.assistant?.content).toBe('Second answer')
    })

    it('should handle empty steps', () => {
      const result = extractLastExchange([])
      expect(result).toEqual({})
    })

    it('should handle steps with no messages', () => {
      const steps: ExecutionStep[] = [
        {
          step_id: '1',
          timestamp: '2025-11-13T12:00:00Z',
          messages_added: [],
          tool_calls: [],
          input: null,
          output: null,
          metadata: {},
        },
      ]

      const result = extractLastExchange(steps)
      expect(result).toEqual({})
    })
  })

  describe('extractToolCalls', () => {
    it('should extract tool calls from steps', () => {
      const steps: ExecutionStep[] = [
        {
          step_id: '1',
          timestamp: '2025-11-13T12:00:00Z',
          messages_added: [],
          tool_calls: [
            {
              tool_name: 'calculate',
              arguments: { x: 10, y: 20 },
              result: 30,
            },
          ],
          input: null,
          output: null,
          metadata: {},
        },
      ]

      const result = extractToolCalls(steps)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('calculate')
      expect(result[0].result).toBe(30)
    })

    it('should parse module from tool name', () => {
      const steps: ExecutionStep[] = [
        {
          step_id: '1',
          timestamp: '2025-11-13T12:00:00Z',
          messages_added: [],
          tool_calls: [
            {
              tool_name: 'math_tools.calculate',
              arguments: {},
            },
          ],
          input: null,
          output: null,
          metadata: {},
        },
      ]

      const result = extractToolCalls(steps)
      expect(result[0].name).toBe('calculate')
      expect(result[0].module).toBe('math_tools')
    })

    it('should handle empty tool calls', () => {
      const result = extractToolCalls([])
      expect(result).toEqual([])
    })
  })

  describe('parseTrace', () => {
    it('should parse complete trace', () => {
      const trace: Trace = {
        id: 'trc_123',
        trace_id: 'abc123',
        source: 'langfuse',
        timestamp: '2025-11-13T12:00:00Z',
        metadata: {},
        steps: [
          {
            step_id: '1',
            timestamp: '2025-11-13T12:00:00Z',
            messages_added: [
              { role: 'user', content: 'Hello' },
              { role: 'assistant', content: 'Hi there!' },
            ],
            tool_calls: [],
            input: null,
            output: null,
            metadata: {},
          },
        ],
      }

      const result = parseTrace(trace, 1)
      expect(result.header.traceNumber).toBe(1)
      expect(result.header.status).toBe('complete')
      expect(result.header.stepCount).toBe(1)
      expect(result.lastExchange.human?.content).toBe('Hello')
      expect(result.lastExchange.assistant?.content).toBe('Hi there!')
      expect(result.raw).toBe(trace)
    })

    it('should detect error status', () => {
      const trace: Trace = {
        id: 'trc_123',
        trace_id: 'abc123',
        source: 'langfuse',
        timestamp: '2025-11-13T12:00:00Z',
        metadata: {},
        steps: [
          {
            step_id: '1',
            timestamp: '2025-11-13T12:00:00Z',
            messages_added: [],
            tool_calls: [],
            input: null,
            output: null,
            error: 'Something went wrong',
            metadata: {},
          },
        ],
      }

      const result = parseTrace(trace, 1)
      expect(result.header.status).toBe('error')
    })

    it('should calculate duration', () => {
      const trace: Trace = {
        id: 'trc_123',
        trace_id: 'abc123',
        source: 'langfuse',
        timestamp: '2025-11-13T12:00:00Z',
        metadata: {},
        steps: [
          {
            step_id: '1',
            timestamp: '2025-11-13T12:00:00.000Z',
            messages_added: [],
            tool_calls: [],
            input: null,
            output: null,
            metadata: {},
          },
          {
            step_id: '2',
            timestamp: '2025-11-13T12:00:02.500Z',
            messages_added: [],
            tool_calls: [],
            input: null,
            output: null,
            metadata: {},
          },
        ],
      }

      const result = parseTrace(trace, 1)
      expect(result.header.duration).toBe(2.5)
    })
  })

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(0.123)).toBe('123ms')
    })

    it('should format seconds', () => {
      expect(formatDuration(2.345)).toBe('2.3s')
    })

    it('should format minutes', () => {
      expect(formatDuration(125)).toBe('2m 5s')
    })

    it('should handle undefined', () => {
      expect(formatDuration(undefined)).toBe('N/A')
    })
  })

  describe('getStatusEmoji', () => {
    it('should return correct emoji for status', () => {
      expect(getStatusEmoji('complete')).toBe('🟢')
      expect(getStatusEmoji('partial')).toBe('🟡')
      expect(getStatusEmoji('error')).toBe('🔴')
    })
  })

  describe('validateTrace', () => {
    it('should validate correct trace', () => {
      const trace = {
        id: 'trc_123',
        trace_id: 'abc123',
        source: 'langfuse',
        timestamp: '2025-11-13T12:00:00Z',
        metadata: {},
        steps: [],
      }

      expect(validateTrace(trace)).toBe(true)
    })

    it('should reject invalid traces', () => {
      expect(validateTrace(null)).toBe(false)
      expect(validateTrace({})).toBe(false)
      expect(validateTrace({ id: 'trc_123' })).toBe(false)
      expect(validateTrace({ id: 'trc_123', trace_id: 'abc', steps: 'not-array' })).toBe(false)
    })
  })

  describe('parseTraces', () => {
    it('should batch parse traces', () => {
      const traces: Trace[] = [
        {
          id: 'trc_1',
          trace_id: 'abc1',
          source: 'langfuse',
          timestamp: '2025-11-13T12:00:00Z',
          metadata: {},
          steps: [],
        },
        {
          id: 'trc_2',
          trace_id: 'abc2',
          source: 'langfuse',
          timestamp: '2025-11-13T12:00:01Z',
          metadata: {},
          steps: [],
        },
      ]

      const results = parseTraces(traces)
      expect(results).toHaveLength(2)
      expect(results[0].header.traceNumber).toBe(1)
      expect(results[1].header.traceNumber).toBe(2)
    })

    it('should filter out invalid traces', () => {
      const traces: any[] = [
        {
          id: 'trc_1',
          trace_id: 'abc1',
          source: 'langfuse',
          timestamp: '2025-11-13T12:00:00Z',
          metadata: {},
          steps: [],
        },
        { invalid: true },
        null,
      ]

      const results = parseTraces(traces)
      expect(results).toHaveLength(1)
    })
  })
})
