/**
 * Trace Parser for Card-Swiping UI
 *
 * Transforms raw API trace data into optimized format for card display.
 * Handles edge cases, truncation, and message extraction.
 */

import type { Trace, ExecutionStep, Message, ToolCall } from '@/types/api'
import type {
  ParsedTrace,
  TraceHeader,
  LastExchange,
  TruncatedMessage,
  ParsedToolCall,
  PreviousStep,
  ParserConfig,
} from '@/types/trace'

const DEFAULT_CONFIG: ParserConfig = {
  maxMessageLength: 200,
  includeMetadata: false,
}

/**
 * Main parser function - converts raw trace to ParsedTrace
 */
export function parseTrace(
  trace: Trace,
  traceNumber: number = 0,
  config: Partial<ParserConfig> = {}
): ParsedTrace {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  return {
    header: buildHeader(trace, traceNumber),
    lastExchange: extractLastExchange(trace.steps || [], finalConfig),
    toolCalls: extractToolCalls(trace.steps || []),
    previousSteps: extractPreviousSteps(trace.steps || [], finalConfig),
    raw: trace,
  }
}

/**
 * Build header information from trace
 */
function buildHeader(trace: Trace, traceNumber: number): TraceHeader {
  const steps = trace.steps || []

  // Determine status
  let status: 'complete' | 'partial' | 'error' = 'complete'

  // Check for errors in any step
  const hasError = steps.some(step => step.error)
  if (hasError) {
    status = 'error'
  } else if (steps.length === 0) {
    status = 'partial'
  }

  // Calculate duration if possible
  let duration: number | undefined
  if (steps.length > 0) {
    const firstStep = steps[0]
    const lastStep = steps[steps.length - 1]

    if (firstStep.timestamp && lastStep.timestamp) {
      const start = new Date(firstStep.timestamp).getTime()
      const end = new Date(lastStep.timestamp).getTime()
      duration = (end - start) / 1000 // Convert to seconds
    }
  }

  return {
    status,
    traceNumber,
    timestamp: trace.timestamp,
    stepCount: steps.length,
    duration,
  }
}

/**
 * Extract the last human-AI message exchange from steps
 */
export function extractLastExchange(
  steps: ExecutionStep[],
  config: ParserConfig = DEFAULT_CONFIG
): LastExchange {
  if (!steps || steps.length === 0) {
    return {}
  }

  // Iterate backwards to find last human and assistant messages
  let lastHuman: Message | undefined
  let lastAssistant: Message | undefined

  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    const messages = step.messages_added || []

    for (let j = messages.length - 1; j >= 0; j--) {
      const message = messages[j]

      // Normalize role (handle variations)
      const role = normalizeRole(message.role)

      if (!lastHuman && role === 'user') {
        lastHuman = message
      }

      if (!lastAssistant && role === 'assistant') {
        lastAssistant = message
      }

      // Stop if we found both
      if (lastHuman && lastAssistant) {
        break
      }
    }

    if (lastHuman && lastAssistant) {
      break
    }
  }

  const exchange: LastExchange = {}

  if (lastHuman) {
    exchange.human = truncateMessage(lastHuman.content, config.maxMessageLength)
  }

  if (lastAssistant) {
    exchange.assistant = truncateMessage(lastAssistant.content, config.maxMessageLength)
  }

  return exchange
}

/**
 * Extract all tool calls from steps
 */
export function extractToolCalls(steps: ExecutionStep[]): ParsedToolCall[] {
  if (!steps || steps.length === 0) {
    return []
  }

  const toolCalls: ParsedToolCall[] = []

  for (const step of steps) {
    const stepToolCalls = step.tool_calls || []

    for (const toolCall of stepToolCalls) {
      toolCalls.push(parseToolCall(toolCall))
    }
  }

  return toolCalls
}

/**
 * Parse a single tool call
 */
function parseToolCall(toolCall: ToolCall): ParsedToolCall {
  // Extract module from tool name if present (e.g., "math_tools.calculate" -> moduleName: "math_tools", name: "calculate")
  let name = toolCall.tool_name
  let moduleName: string | undefined

  if (name.includes('.')) {
    const parts = name.split('.')
    moduleName = parts.slice(0, -1).join('.')
    name = parts[parts.length - 1]
  }

  return {
    name,
    module: moduleName,
    arguments: toolCall.arguments,
    result: toolCall.result,
    error: toolCall.error,
  }
}

/**
 * Extract previous conversation steps (for expandable section)
 */
function extractPreviousSteps(
  steps: ExecutionStep[],
  config: ParserConfig
): PreviousStep[] {
  if (!steps || steps.length === 0) {
    return []
  }

  const previousSteps: PreviousStep[] = []

  for (const step of steps) {
    const messages = step.messages_added || []

    for (const message of messages) {
      const role = normalizeRole(message.role)

      if (role === 'user' || role === 'assistant') {
        previousSteps.push({
          role: role === 'user' ? 'human' : 'assistant',
          content: message.content,
          timestamp: step.timestamp,
        })
      }
    }

    // Add tool calls for this step if any
    const toolCalls = step.tool_calls || []
    if (toolCalls.length > 0 && previousSteps.length > 0) {
      const lastStep = previousSteps[previousSteps.length - 1]
      lastStep.tools = toolCalls.map(parseToolCall)
    }
  }

  return previousSteps
}

/**
 * Truncate message content if it exceeds max length
 */
export function truncateMessage(
  text: string | null | undefined,
  maxLength: number = 200
): TruncatedMessage {
  if (!text) {
    return {
      content: '',
      truncated: false,
    }
  }

  // Handle non-string content
  const stringContent = typeof text === 'string' ? text : JSON.stringify(text)

  if (stringContent.length <= maxLength) {
    return {
      content: stringContent,
      truncated: false,
    }
  }

  // Truncate at last word boundary before maxLength
  const truncated = stringContent.substring(0, maxLength)
  const lastSpaceIndex = truncated.lastIndexOf(' ')

  const finalContent = lastSpaceIndex > 0
    ? truncated.substring(0, lastSpaceIndex) + '...'
    : truncated + '...'

  return {
    content: finalContent,
    truncated: true,
    fullContent: stringContent,
  }
}

/**
 * Normalize role variations (user/human, assistant/ai, etc.)
 */
function normalizeRole(role: string): 'user' | 'assistant' | 'system' {
  const normalized = role.toLowerCase().trim()

  if (normalized === 'user' || normalized === 'human') {
    return 'user'
  }

  if (normalized === 'assistant' || normalized === 'ai') {
    return 'assistant'
  }

  return 'system'
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(timestamp: string): string {
  const now = new Date()
  const date = new Date(timestamp)
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) {
    return 'just now'
  } else if (diffMins < 60) {
    return `${diffMins}m ago`
  } else if (diffHours < 24) {
    return `${diffHours}h ago`
  } else if (diffDays < 7) {
    return `${diffDays}d ago`
  } else {
    // Format as date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  }
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null) {
    return 'N/A'
  }

  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`
  } else if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  } else {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}m ${secs}s`
  }
}

/**
 * Get status emoji based on trace status
 */
export function getStatusEmoji(status: 'complete' | 'partial' | 'error'): string {
  switch (status) {
    case 'complete':
      return '🟢'
    case 'partial':
      return '🟡'
    case 'error':
      return '🔴'
    default:
      return '⚪'
  }
}

/**
 * Validate trace data before parsing
 */
export function validateTrace(trace: any): trace is Trace {
  if (!trace || typeof trace !== 'object') {
    return false
  }

  // Required fields
  if (!trace.id || !trace.trace_id || !trace.source) {
    return false
  }

  // Steps should be an array (can be empty)
  if (trace.steps && !Array.isArray(trace.steps)) {
    return false
  }

  return true
}

/**
 * Batch parse multiple traces
 */
export function parseTraces(
  traces: Trace[],
  config: Partial<ParserConfig> = {}
): ParsedTrace[] {
  return traces
    .filter(validateTrace)
    .map((trace, index) => parseTrace(trace, index + 1, config))
}
