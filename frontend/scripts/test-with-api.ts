/**
 * Test trace parser with real API data
 * Run with: npx tsx frontend/scripts/test-with-api.ts
 */

import { parseTrace } from '../lib/trace-parser'
import type { Trace } from '../types/api'

async function testWithAPI() {
  const API_URL = 'http://localhost:8787/v1'
  const WORKSPACE_ID = 'workspace_default'

  console.log('='.repeat(80))
  console.log('TESTING WITH REAL API DATA')
  console.log('='.repeat(80))

  try {
    // Fetch a trace from the API
    console.log('\nFetching traces from API...')
    const listResponse = await fetch(`${API_URL}/api/traces?limit=1`, {
      headers: {
        'X-Workspace-Id': WORKSPACE_ID,
      },
    })

    if (!listResponse.ok) {
      throw new Error(`Failed to fetch traces: ${listResponse.statusText}`)
    }

    const listData = await listResponse.json()
    console.log(`Found ${listData.traces.length} trace(s)`)

    if (listData.traces.length === 0) {
      console.log('No traces available in the database')
      return
    }

    const traceSummary = listData.traces[0]
    console.log(`\nFetching full trace: ${traceSummary.id}`)

    // Fetch full trace details
    const traceResponse = await fetch(`${API_URL}/api/traces/${traceSummary.id}`, {
      headers: {
        'X-Workspace-Id': WORKSPACE_ID,
      },
    })

    if (!traceResponse.ok) {
      throw new Error(`Failed to fetch trace: ${traceResponse.statusText}`)
    }

    const trace: Trace = await traceResponse.json()
    console.log(`Trace ${trace.id} loaded:`)
    console.log(`  - Source: ${trace.source}`)
    console.log(`  - Timestamp: ${trace.timestamp}`)
    console.log(`  - Steps: ${trace.steps?.length || 0}`)

    // Parse the trace
    console.log('\nParsing trace...')
    const parsed = parseTrace(trace, 1)

    console.log('\n' + '-'.repeat(80))
    console.log('PARSED RESULT:')
    console.log('-'.repeat(80))

    console.log('\nHeader:')
    console.log(JSON.stringify(parsed.header, null, 2))

    console.log('\nLast Exchange:')
    if (parsed.lastExchange.human) {
      console.log('  Human:', parsed.lastExchange.human.content)
      if (parsed.lastExchange.human.truncated) {
        console.log('  (truncated from:', parsed.lastExchange.human.fullContent?.length, 'chars)')
      }
    } else {
      console.log('  Human: (none)')
    }

    if (parsed.lastExchange.assistant) {
      console.log('  Assistant:', parsed.lastExchange.assistant.content)
      if (parsed.lastExchange.assistant.truncated) {
        console.log('  (truncated from:', parsed.lastExchange.assistant.fullContent?.length, 'chars)')
      }
    } else {
      console.log('  Assistant: (none)')
    }

    console.log('\nTool Calls:')
    if (parsed.toolCalls.length > 0) {
      parsed.toolCalls.forEach((tool, i) => {
        console.log(`  ${i + 1}. ${tool.module ? tool.module + '.' : ''}${tool.name}`)
        if (tool.result !== undefined) {
          console.log(`     Result: ${JSON.stringify(tool.result)}`)
        }
        if (tool.error) {
          console.log(`     Error: ${tool.error}`)
        }
      })
    } else {
      console.log('  (none)')
    }

    console.log('\nPrevious Steps:')
    console.log(`  Total: ${parsed.previousSteps.length} steps`)
    parsed.previousSteps.forEach((step, i) => {
      console.log(`  ${i + 1}. [${step.role}]: ${step.content.substring(0, 80)}${step.content.length > 80 ? '...' : ''}`)
      if (step.tools && step.tools.length > 0) {
        console.log(`     Tools: ${step.tools.map(t => t.name).join(', ')}`)
      }
    })

    console.log('\n' + '='.repeat(80))
    console.log('TEST COMPLETE - Parser working correctly with API data!')
    console.log('='.repeat(80))
  } catch (error) {
    console.error('\nERROR:', error)
    console.log('\nMake sure the API is running at http://localhost:8787')
    console.log('You can start it with: npm run dev')
  }
}

testWithAPI()
