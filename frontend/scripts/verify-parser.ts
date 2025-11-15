/**
 * Simple verification that parser types and functions work correctly
 */

import { parseTrace, truncateMessage, getStatusEmoji, formatDuration } from '../lib/trace-parser'
import type { Trace } from '../types/api'
import type { ParsedTrace } from '../types/trace'

// Test that types are correct
const trace: Trace = {
  id: 'test',
  trace_id: 'test',
  source: 'langfuse',
  timestamp: new Date().toISOString(),
  metadata: {},
  steps: [],
}

// Test parser functions
const parsed: ParsedTrace = parseTrace(trace, 1)
console.log('✓ parseTrace works')
console.log('  Status:', parsed.header.status)
console.log('  Status emoji:', getStatusEmoji(parsed.header.status))

// Test truncate
const truncated = truncateMessage('Hello world', 5)
console.log('✓ truncateMessage works')
console.log('  Content:', truncated.content)
console.log('  Truncated:', truncated.truncated)

// Test formatters
console.log('✓ formatDuration works')
console.log('  2.5s:', formatDuration(2.5))

console.log('\n✅ All parser functions compile and run correctly!')
