/**
 * Manual test script for trace parser
 * Run with: npx tsx frontend/scripts/test-trace-parser.ts
 */

import { parseTrace, parseTraces } from '../lib/trace-parser'
import type { Trace } from '../types/api'

// Sample trace data from API
const sampleTrace: Trace = {
  id: 'trc_ed227efc-4055-4f47-8020-93a0dbd77507',
  trace_id: '2fab1265fd9be34a3410bc6650c1ed25',
  source: 'langfuse',
  timestamp: '2025-11-13T12:57:41.696Z',
  metadata: {
    resourceAttributes: {
      'telemetry.sdk.language': 'python',
      'telemetry.sdk.name': 'opentelemetry',
      'telemetry.sdk.version': '1.37.0',
      'service.name': 'unknown_service',
    },
    scope: {
      name: 'langfuse-sdk',
      version: '3.5.0',
      attributes: {
        public_key: 'pk-lf-78e60694-d9e2-493d-bbad-17cbc2374c28',
      },
    },
  },
  steps: [
    {
      step_id: '1',
      timestamp: '2025-11-13T12:57:41.000Z',
      messages_added: [],
      tool_calls: [],
      input: null,
      output: null,
      metadata: {},
    },
    {
      step_id: '2',
      timestamp: '2025-11-13T12:57:43.500Z',
      messages_added: [],
      tool_calls: [],
      input: null,
      output: null,
      metadata: {},
    },
  ],
}

// Sample trace with messages
const traceWithMessages: Trace = {
  id: 'trc_123',
  trace_id: 'trace_123',
  source: 'langfuse',
  timestamp: '2025-11-13T12:00:00Z',
  metadata: {},
  steps: [
    {
      step_id: '1',
      trace_id: 'trace_123',
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
      step_id: '2',
      trace_id: 'trace_123',
      timestamp: '2025-11-13T12:00:01.500Z',
      messages_added: [
        {
          role: 'assistant',
          content:
            'The compound interest would be $6,288.95. Final amount: $16,288.95',
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

// Sample trace with error
const traceWithError: Trace = {
  id: 'trc_error',
  trace_id: 'trace_error',
  source: 'langfuse',
  timestamp: '2025-11-13T12:00:00Z',
  metadata: {},
  steps: [
    {
      step_id: '1',
      trace_id: 'trace_error',
      timestamp: '2025-11-13T12:00:00.000Z',
      messages_added: [
        {
          role: 'user',
          content: 'Do something',
        },
      ],
      tool_calls: [],
      input: null,
      output: null,
      metadata: {},
    },
    {
      step_id: '2',
      trace_id: 'trace_error',
      timestamp: '2025-11-13T12:00:01.000Z',
      messages_added: [],
      tool_calls: [],
      input: null,
      output: null,
      error: 'Tool execution failed: timeout',
      metadata: {},
    },
  ],
}

// Sample trace with long message
const traceWithLongMessage: Trace = {
  id: 'trc_long',
  trace_id: 'trace_long',
  source: 'langfuse',
  timestamp: '2025-11-13T12:00:00Z',
  metadata: {},
  steps: [
    {
      step_id: '1',
      trace_id: 'trace_long',
      timestamp: '2025-11-13T12:00:00.000Z',
      messages_added: [
        {
          role: 'user',
          content:
            'This is a very long user message that will definitely need to be truncated because it exceeds the maximum length of 200 characters that we allow for display in the card interface. We want to make sure that the truncation happens at a word boundary and that we add ellipsis to indicate that there is more content available.',
        },
        {
          role: 'assistant',
          content:
            'This is also a very long assistant response that needs truncation. It contains multiple sentences and goes into great detail about various aspects of the topic at hand. The user should be able to expand this to see the full content, but for the card view we only show a preview. This helps keep the interface clean and scannable.',
        },
      ],
      tool_calls: [],
      input: null,
      output: null,
      metadata: {},
    },
  ],
}

console.log('='.repeat(80))
console.log('TRACE PARSER TEST')
console.log('='.repeat(80))

// Test 1: Empty trace
console.log('\n1. Parsing empty trace (real API data):')
console.log('-'.repeat(80))
const parsed1 = parseTrace(sampleTrace, 1)
console.log('Header:', JSON.stringify(parsed1.header, null, 2))
console.log('Last Exchange:', JSON.stringify(parsed1.lastExchange, null, 2))
console.log('Tool Calls:', JSON.stringify(parsed1.toolCalls, null, 2))

// Test 2: Trace with messages and tools
console.log('\n2. Parsing trace with messages and tools:')
console.log('-'.repeat(80))
const parsed2 = parseTrace(traceWithMessages, 2)
console.log('Header:', JSON.stringify(parsed2.header, null, 2))
console.log('Last Exchange:', JSON.stringify(parsed2.lastExchange, null, 2))
console.log('Tool Calls:', JSON.stringify(parsed2.toolCalls, null, 2))

// Test 3: Trace with error
console.log('\n3. Parsing trace with error:')
console.log('-'.repeat(80))
const parsed3 = parseTrace(traceWithError, 3)
console.log('Header:', JSON.stringify(parsed3.header, null, 2))
console.log('Last Exchange:', JSON.stringify(parsed3.lastExchange, null, 2))

// Test 4: Trace with long messages
console.log('\n4. Parsing trace with long messages:')
console.log('-'.repeat(80))
const parsed4 = parseTrace(traceWithLongMessage, 4)
console.log('Header:', JSON.stringify(parsed4.header, null, 2))
console.log('Last Exchange:')
console.log('  Human (truncated):', parsed4.lastExchange.human?.content)
console.log('  Human (full):', parsed4.lastExchange.human?.fullContent?.substring(0, 100) + '...')
console.log('  Assistant (truncated):', parsed4.lastExchange.assistant?.content)

// Test 5: Batch parsing
console.log('\n5. Batch parsing multiple traces:')
console.log('-'.repeat(80))
const allTraces = [sampleTrace, traceWithMessages, traceWithError, traceWithLongMessage]
const parsedAll = parseTraces(allTraces)
console.log(`Parsed ${parsedAll.length} traces`)
parsedAll.forEach((parsed, i) => {
  console.log(`  Trace ${i + 1}: ${parsed.header.status} - ${parsed.header.stepCount} steps`)
})

console.log('\n' + '='.repeat(80))
console.log('TEST COMPLETE')
console.log('='.repeat(80))
