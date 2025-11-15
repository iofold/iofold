/**
 * Integration tests for trace parser
 * These tests simulate real-world usage scenarios
 */

import { describe, it, expect } from '@jest/globals'
import { parseTrace, parseTraces, getStatusEmoji, formatDuration, formatRelativeTime } from '../trace-parser'
import type { Trace } from '@/types/api'

describe('trace-parser integration', () => {
  describe('card component scenario', () => {
    it('should provide all data needed for card display', () => {
      const trace: Trace = {
        id: 'trc_123',
        trace_id: 'abc123',
        source: 'langfuse',
        timestamp: '2025-11-13T12:00:00Z',
        metadata: {},
        steps: [
          {
            trace_id: 'abc123',
            timestamp: '2025-11-13T12:00:00.000Z',
            messages_added: [
              {
                role: 'user',
                content: 'Calculate compound interest for $10,000 at 5% over 10 years',
              },
            ],
            tool_calls: [],
            input: null,
            output: null,
            metadata: {},
          },
          {
            trace_id: 'abc123',
            timestamp: '2025-11-13T12:00:01.500Z',
            messages_added: [
              {
                role: 'assistant',
                content: 'The compound interest would be $6,288.95. Final amount: $16,288.95',
              },
            ],
            tool_calls: [
              {
                tool_name: 'math_tools.calculate',
                arguments: {
                  principal: 10000,
                  rate: 0.05,
                  years: 10,
                },
                result: 16288.95,
              },
            ],
            input: null,
            output: null,
            metadata: {},
          },
        ],
      }

      const parsed = parseTrace(trace, 12)

      // Card header
      expect(getStatusEmoji(parsed.header.status)).toBe('🟢')
      expect(parsed.header.traceNumber).toBe(12)
      expect(formatDuration(parsed.header.duration)).toBe('1.5s')
      expect(parsed.header.stepCount).toBe(2)

      // Last exchange
      expect(parsed.lastExchange.human?.content).toContain('Calculate compound interest')
      expect(parsed.lastExchange.assistant?.content).toContain('$6,288.95')

      // Tool calls
      expect(parsed.toolCalls).toHaveLength(1)
      expect(parsed.toolCalls[0].name).toBe('calculate')
      expect(parsed.toolCalls[0].module).toBe('math_tools')
      expect(parsed.toolCalls[0].result).toBe(16288.95)
    })

    it('should handle trace with no messages gracefully', () => {
      const trace: Trace = {
        id: 'trc_empty',
        trace_id: 'empty',
        source: 'langfuse',
        timestamp: '2025-11-13T12:00:00Z',
        metadata: {},
        steps: [
          {
            trace_id: 'empty',
            messages_added: [],
            tool_calls: [],
            input: null,
            output: null,
            metadata: {},
          },
        ],
      }

      const parsed = parseTrace(trace, 1)

      // Should still provide header
      expect(parsed.header.status).toBe('complete')
      expect(parsed.header.traceNumber).toBe(1)
      expect(parsed.header.stepCount).toBe(1)

      // But no messages
      expect(parsed.lastExchange.human).toBeUndefined()
      expect(parsed.lastExchange.assistant).toBeUndefined()
      expect(parsed.toolCalls).toHaveLength(0)
    })

    it('should handle API response format (no step_id or timestamp)', () => {
      // This matches actual API response structure
      const trace: Trace = {
        id: 'trc_ed227efc-4055-4f47-8020-93a0dbd77507',
        trace_id: '2fab1265fd9be34a3410bc6650c1ed25',
        source: 'langfuse',
        timestamp: '2025-11-13T12:57:41.696Z',
        metadata: {
          resourceAttributes: {
            'telemetry.sdk.language': 'python',
          },
        },
        steps: [
          {
            trace_id: '2fab1265fd9be34a3410bc6650c1ed25',
            messages_added: [],
            tool_calls: [],
            metadata: {},
          },
        ],
      }

      const parsed = parseTrace(trace, 1)

      // Should work even without step_id and timestamp
      expect(parsed.header.traceNumber).toBe(1)
      expect(parsed.header.stepCount).toBe(1)
      expect(parsed.header.duration).toBeUndefined() // No timestamp to calculate
      expect(parsed.header.status).toBe('complete')
    })
  })

  describe('list view scenario', () => {
    it('should batch parse traces for list display', () => {
      const traces: Trace[] = [
        {
          id: 'trc_1',
          trace_id: 'trace1',
          source: 'langfuse',
          timestamp: '2025-11-13T12:00:00Z',
          metadata: {},
          steps: [
            {
              trace_id: 'trace1',
              messages_added: [
                { role: 'user', content: 'Question 1' },
                { role: 'assistant', content: 'Answer 1' },
              ],
              tool_calls: [],
              metadata: {},
            },
          ],
        },
        {
          id: 'trc_2',
          trace_id: 'trace2',
          source: 'langfuse',
          timestamp: '2025-11-13T12:01:00Z',
          metadata: {},
          steps: [
            {
              trace_id: 'trace2',
              messages_added: [
                { role: 'user', content: 'Question 2' },
                { role: 'assistant', content: 'Answer 2' },
              ],
              tool_calls: [],
              metadata: {},
            },
          ],
        },
        {
          id: 'trc_3',
          trace_id: 'trace3',
          source: 'langfuse',
          timestamp: '2025-11-13T12:02:00Z',
          metadata: {},
          steps: [
            {
              trace_id: 'trace3',
              messages_added: [
                { role: 'user', content: 'Question 3' },
              ],
              tool_calls: [],
              error: 'Timeout error',
              metadata: {},
            },
          ],
        },
      ]

      const parsed = parseTraces(traces)

      expect(parsed).toHaveLength(3)

      // Check sequential numbering
      expect(parsed[0].header.traceNumber).toBe(1)
      expect(parsed[1].header.traceNumber).toBe(2)
      expect(parsed[2].header.traceNumber).toBe(3)

      // Check all have correct data
      expect(parsed[0].lastExchange.human?.content).toBe('Question 1')
      expect(parsed[1].lastExchange.human?.content).toBe('Question 2')
      expect(parsed[2].lastExchange.human?.content).toBe('Question 3')

      // Check error status
      expect(parsed[2].header.status).toBe('error')
    })

    it('should filter by status in parsed results', () => {
      const traces: Trace[] = [
        {
          id: 'trc_ok',
          trace_id: 'ok',
          source: 'langfuse',
          timestamp: '2025-11-13T12:00:00Z',
          metadata: {},
          steps: [{ trace_id: 'ok', messages_added: [], tool_calls: [], metadata: {} }],
        },
        {
          id: 'trc_error',
          trace_id: 'error',
          source: 'langfuse',
          timestamp: '2025-11-13T12:00:00Z',
          metadata: {},
          steps: [{ trace_id: 'error', messages_added: [], tool_calls: [], error: 'Failed', metadata: {} }],
        },
      ]

      const parsed = parseTraces(traces)
      const errors = parsed.filter(p => p.header.status === 'error')

      expect(errors).toHaveLength(1)
      expect(errors[0].raw.id).toBe('trc_error')
    })
  })

  describe('expandable details scenario', () => {
    it('should provide previous steps for expansion', () => {
      const trace: Trace = {
        id: 'trc_multi',
        trace_id: 'multi',
        source: 'langfuse',
        timestamp: '2025-11-13T12:00:00Z',
        metadata: {},
        steps: [
          {
            trace_id: 'multi',
            messages_added: [
              { role: 'user', content: 'First question' },
              { role: 'assistant', content: 'First answer' },
            ],
            tool_calls: [],
            metadata: {},
          },
          {
            trace_id: 'multi',
            messages_added: [
              { role: 'user', content: 'Follow-up question' },
              { role: 'assistant', content: 'Follow-up answer' },
            ],
            tool_calls: [
              {
                tool_name: 'search',
                arguments: { query: 'test' },
                result: 'results',
              },
            ],
            metadata: {},
          },
        ],
      }

      const parsed = parseTrace(trace, 1)

      // Last exchange shows most recent
      expect(parsed.lastExchange.human?.content).toBe('Follow-up question')
      expect(parsed.lastExchange.assistant?.content).toBe('Follow-up answer')

      // Previous steps show all conversation
      expect(parsed.previousSteps).toHaveLength(4)
      expect(parsed.previousSteps[0].role).toBe('human')
      expect(parsed.previousSteps[0].content).toBe('First question')
      expect(parsed.previousSteps[1].role).toBe('assistant')
      expect(parsed.previousSteps[1].content).toBe('First answer')
      expect(parsed.previousSteps[3].tools).toHaveLength(1)
      expect(parsed.previousSteps[3].tools?.[0].name).toBe('search')
    })
  })

  describe('error handling scenario', () => {
    it('should handle various error conditions', () => {
      const errorTrace: Trace = {
        id: 'trc_error',
        trace_id: 'error',
        source: 'langfuse',
        timestamp: '2025-11-13T12:00:00Z',
        metadata: {},
        steps: [
          {
            trace_id: 'error',
            messages_added: [{ role: 'user', content: 'Do something' }],
            tool_calls: [],
            metadata: {},
          },
          {
            trace_id: 'error',
            messages_added: [],
            tool_calls: [
              {
                tool_name: 'failing_tool',
                arguments: {},
                error: 'Connection timeout',
              },
            ],
            error: 'Step failed',
            metadata: {},
          },
        ],
      }

      const parsed = parseTrace(errorTrace, 1)

      // Status should be error
      expect(parsed.header.status).toBe('error')
      expect(getStatusEmoji(parsed.header.status)).toBe('🔴')

      // Tool error should be captured
      expect(parsed.toolCalls[0].error).toBe('Connection timeout')

      // User message should still be available
      expect(parsed.lastExchange.human?.content).toBe('Do something')
    })
  })
})
