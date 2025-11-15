// ============================================================================
// Parsed Trace Types for Card-Swiping UI
// ============================================================================

import type { Trace, ExecutionStep, Message, ToolCall } from './api'

/**
 * Parsed trace optimized for card display
 */
export interface ParsedTrace {
  header: TraceHeader
  lastExchange: LastExchange
  toolCalls: ParsedToolCall[]
  previousSteps: PreviousStep[]
  raw: Trace // Keep raw trace for reference
}

/**
 * Header information displayed at the top of the card
 */
export interface TraceHeader {
  status: 'complete' | 'partial' | 'error'
  traceNumber: number // Sequential number in current session
  timestamp: string // ISO 8601
  stepCount: number
  duration?: number // Total duration in seconds if available
}

/**
 * Last human-AI message exchange
 */
export interface LastExchange {
  human?: TruncatedMessage
  assistant?: TruncatedMessage
}

/**
 * Message with truncation info
 */
export interface TruncatedMessage {
  content: string
  truncated: boolean
  fullContent?: string // Store full content if truncated
}

/**
 * Parsed tool call for display
 */
export interface ParsedToolCall {
  name: string
  module?: string // e.g., "math_tools"
  arguments?: Record<string, any>
  result?: any
  error?: string
}

/**
 * Previous conversation step (for expandable section)
 */
export interface PreviousStep {
  role: 'human' | 'assistant'
  content: string
  tools?: ParsedToolCall[]
  timestamp?: string
}

/**
 * Parser configuration
 */
export interface ParserConfig {
  maxMessageLength: number
  includeMetadata: boolean
}
