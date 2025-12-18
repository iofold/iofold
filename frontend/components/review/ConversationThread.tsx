/**
 * ConversationThread Component
 *
 * Displays conversation as a clean vertical thread with compact tool call summary.
 * Shows: User → [N tool calls] → Assistant response
 *
 * Tool calls are shown as a compact button that expands/highlights the trace pane.
 */

'use client'

import { useEffect, useRef, useMemo } from 'react'
import { Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OpenInferenceSpan } from '@/types/openinference'

/**
 * Conversation item types
 */
type ConversationItemType = 'user' | 'assistant' | 'system' | 'tool_calls_group'

interface ToolCallInfo {
  id: string
  name: string
  args?: Record<string, any>
  result?: any
  error?: string
  spanId?: string // OpenInference span ID for cross-pane selection
  parentSpanId?: string // Parent LLM span ID for fallback selection
}

interface ConversationItem {
  id: string
  type: ConversationItemType
  content?: string
  // For tool calls group
  toolCalls?: ToolCallInfo[]
}

interface LegacyMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    arguments?: Record<string, any>
    result?: any
    error?: string
  }>
}

interface ConversationThreadProps {
  messages?: LegacyMessage[]
  spans?: OpenInferenceSpan[]
  selectedId?: string
  onMessageClick?: (messageId: string) => void
  onToolCallClick?: (toolCallId: string) => void
}

/**
 * Extract conversation items with grouped tool calls
 *
 * IMPORTANT: Each LLM span contains the FULL conversation history in input_messages.
 * We need to deduplicate by only adding NEW messages from each span.
 */
function extractConversationItems(spans: OpenInferenceSpan[]): ConversationItem[] {
  if (!spans || spans.length === 0) return []

  const items: ConversationItem[] = []

  // Track seen messages by their content to deduplicate
  const seenMessages = new Set<string>()

  // Helper to create a fingerprint for a message
  const getMessageFingerprint = (role: string, content: string) => {
    return `${role}:${content.slice(0, 500)}` // Use first 500 chars for fingerprint
  }

  // Build tool results map (includes span_id for cross-pane selection)
  const toolResultsMap = new Map<string, { result: any; error?: string; name: string; spanId: string }>()
  const toolSpansByName = new Map<string, OpenInferenceSpan[]>()

  spans.forEach((span) => {
    if (span.span_kind === 'TOOL' && span.tool) {
      const toolCallId = span.attributes?.tool_call_id as string
      if (toolCallId) {
        toolResultsMap.set(toolCallId, {
          result: span.tool.output,
          error: span.status === 'ERROR' ? span.status_message : undefined,
          name: span.tool.name,
          spanId: span.span_id,
        })
      }
      const existing = toolSpansByName.get(span.tool.name) || []
      existing.push(span)
      toolSpansByName.set(span.tool.name, existing)
    }
  })

  // Sort LLM spans by start_time to process in order
  const llmSpans = spans
    .filter(s => s.span_kind === 'LLM' && s.llm)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  // Process LLM spans in chronological order
  llmSpans.forEach((span) => {
    // Add input messages (user/system) - but only if not seen before
    span.llm!.input_messages?.forEach((msg, idx) => {
      if (msg.role === 'tool') return

      const fingerprint = getMessageFingerprint(msg.role, msg.content)
      if (seenMessages.has(fingerprint)) return // Skip duplicates

      seenMessages.add(fingerprint)
      items.push({
        id: `${span.span_id}_input_${idx}`,
        type: msg.role as ConversationItemType,
        content: msg.content,
      })
    })

    // Process output messages
    span.llm!.output_messages?.forEach((msg, msgIdx) => {
      const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0
      const cleanContent = parseAssistantContent(msg.content)
      // Check both original content and cleaned content - skip if clean content is empty or just whitespace
      const hasValidContent = cleanContent && cleanContent.trim().length > 0

      // Check if this assistant message was already seen
      const assistantFingerprint = hasValidContent
        ? getMessageFingerprint('assistant', cleanContent.trim())
        : null
      const alreadySeen = assistantFingerprint && seenMessages.has(assistantFingerprint)

      // Show assistant content BEFORE tool calls (if any)
      // This is the assistant's preamble/request text that accompanies tool calls
      if (hasValidContent && !alreadySeen) {
        seenMessages.add(assistantFingerprint!)
        items.push({
          id: `${span.span_id}_output_${msgIdx}_text`,
          type: 'assistant',
          content: cleanContent.trim(),
        })
      }

      // Group all tool calls into one item (shown AFTER assistant message)
      if (hasToolCalls) {
        // Deduplicate tool calls by ID first
        const seenToolCallIds = new Set<string>()
        const uniqueToolCalls = msg.tool_calls!.filter((tc) => {
          const id = tc.id || `${tc.function.name}:${tc.function.arguments}`
          if (seenToolCallIds.has(id)) return false
          seenToolCallIds.add(id)
          return true
        })

        // Create a fingerprint for the tool call group
        const toolCallFingerprint = uniqueToolCalls
          .map(tc => `${tc.function.name}:${tc.function.arguments}`)
          .join('|')

        if (!seenMessages.has(`tools:${toolCallFingerprint}`)) {
          seenMessages.add(`tools:${toolCallFingerprint}`)

          const usedToolSpans = new Map<string, number>()
          const toolCallsInfo: ToolCallInfo[] = uniqueToolCalls.map((tc) => {
            let parsedArgs: Record<string, any> | undefined
            try {
              parsedArgs = JSON.parse(tc.function.arguments)
            } catch {
              parsedArgs = undefined
            }

            let toolResult = toolResultsMap.get(tc.id)
            if (!toolResult) {
              const spansByName = toolSpansByName.get(tc.function.name)
              if (spansByName) {
                const usedCount = usedToolSpans.get(tc.function.name) || 0
                if (usedCount < spansByName.length) {
                  const toolSpan = spansByName[usedCount]
                  toolResult = {
                    result: toolSpan.tool?.output,
                    error: toolSpan.status === 'ERROR' ? toolSpan.status_message : undefined,
                    name: toolSpan.tool?.name || tc.function.name,
                    spanId: toolSpan.span_id,
                  }
                  usedToolSpans.set(tc.function.name, usedCount + 1)
                }
              }
            }

            return {
              id: tc.id || `${span.span_id}_tc_${uniqueToolCalls.indexOf(tc)}`,
              name: tc.function.name,
              args: parsedArgs,
              result: toolResult?.result,
              error: toolResult?.error,
              spanId: toolResult?.spanId,
              parentSpanId: span.span_id, // LLM span that initiated this tool call
            }
          })

          items.push({
            id: `${span.span_id}_tools_${msgIdx}`,
            type: 'tool_calls_group',
            toolCalls: toolCallsInfo,
          })
        }
      }
    })
  })

  return items
}

/**
 * Parse assistant content - extract clean text
 */
function parseAssistantContent(content: string): string {
  if (!content) return ''

  try {
    const parsed = JSON.parse(content)
    if (parsed.output && typeof parsed.output === 'string') {
      return parsed.output
    }
    if (parsed.content && typeof parsed.content === 'string') {
      return parsed.content
    }
    return ''
  } catch {
    // Not JSON
  }

  const outputMatch = content.match(/^\{"output":"(.*)","usage":/s)
  if (outputMatch) {
    try {
      return JSON.parse(`"${outputMatch[1]}"`)
    } catch {
      return outputMatch[1]
    }
  }

  return content
}

/**
 * Convert legacy messages
 */
function convertLegacyMessages(messages: LegacyMessage[]): ConversationItem[] {
  const items: ConversationItem[] = []

  messages.forEach((msg) => {
    items.push({
      id: msg.id,
      type: msg.role,
      content: msg.content,
    })

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      items.push({
        id: `${msg.id}_tools`,
        type: 'tool_calls_group',
        toolCalls: msg.toolCalls.map((tc, idx) => ({
          id: tc.id || `${msg.id}_tc_${idx}`,
          name: tc.name,
          args: tc.arguments,
          result: tc.result,
          error: tc.error,
        })),
      })
    }
  })

  return items
}

export function ConversationThread({
  messages: legacyMessages,
  spans,
  selectedId,
  onMessageClick,
  onToolCallClick,
}: ConversationThreadProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const items = useMemo(() => {
    return spans && spans.length > 0
      ? extractConversationItems(spans)
      : legacyMessages
        ? convertLegacyMessages(legacyMessages)
        : []
  }, [spans, legacyMessages])

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [items])

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-sm text-muted-foreground">No messages in this conversation</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto p-3 space-y-2"
    >
      {items.map((item) => (
        <ConversationItemView
          key={item.id}
          item={item}
          isSelected={selectedId === item.id}
          onMessageClick={onMessageClick}
          onToolCallClick={onToolCallClick}
        />
      ))}
    </div>
  )
}

interface ConversationItemViewProps {
  item: ConversationItem
  isSelected: boolean
  onMessageClick?: (messageId: string) => void
  onToolCallClick?: (toolCallId: string) => void
}

function ConversationItemView({
  item,
  isSelected,
  onMessageClick,
  onToolCallClick,
}: ConversationItemViewProps) {
  if (item.type === 'tool_calls_group') {
    return (
      <ToolCallsButton
        toolCalls={item.toolCalls || []}
        isSelected={isSelected}
        onClick={onToolCallClick}
      />
    )
  }

  return (
    <MessageView
      item={item}
      isSelected={isSelected}
      onClick={onMessageClick}
    />
  )
}

interface MessageViewProps {
  item: ConversationItem
  isSelected: boolean
  onClick?: (id: string) => void
}

function MessageView({ item, isSelected, onClick }: MessageViewProps) {
  const roleConfig = {
    user: {
      label: 'User',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      labelColor: 'text-gray-500 dark:text-gray-400',
      textColor: 'text-gray-900 dark:text-gray-100',
    },
    assistant: {
      label: 'Assistant',
      bgColor: 'bg-amber-50 dark:bg-amber-900/40',
      labelColor: 'text-amber-700 dark:text-amber-400',
      textColor: 'text-gray-900 dark:text-amber-50',
    },
    system: {
      label: 'System',
      bgColor: 'bg-gray-50 dark:bg-gray-900',
      labelColor: 'text-gray-400 dark:text-gray-500',
      textColor: 'text-gray-600 dark:text-gray-400',
    },
  }

  const config = roleConfig[item.type as 'user' | 'assistant' | 'system'] || roleConfig.system

  return (
    <div
      onClick={() => onClick?.(item.id)}
      className={cn(
        'px-3 py-2 rounded-lg transition-all',
        config.bgColor,
        onClick && 'cursor-pointer hover:ring-1 hover:ring-slate-300 dark:hover:ring-slate-600',
        isSelected && 'ring-2 ring-primary'
      )}
    >
      <div className={cn('text-[10px] font-medium mb-0.5 uppercase tracking-wider', config.labelColor)}>
        {config.label}
      </div>
      <div className={cn('text-sm leading-relaxed', config.textColor)}>
        {item.content || <span className="text-muted-foreground italic">No content</span>}
      </div>
    </div>
  )
}

interface ToolCallsButtonProps {
  toolCalls: ToolCallInfo[]
  isSelected: boolean
  onClick?: (toolCallId: string) => void
}

function ToolCallsButton({ toolCalls, isSelected, onClick }: ToolCallsButtonProps) {
  const count = toolCalls.length
  const hasErrors = toolCalls.some(tc => tc.error)
  // Use spanId for TraceExplorer selection, fallback to tool call ID
  const firstSpanId = toolCalls[0]?.spanId || toolCalls[0]?.id

  // Get unique tool names for display
  const toolNames = [...new Set(toolCalls.map(tc => tc.name))]
  const displayNames = toolNames.length <= 2
    ? toolNames.join(', ')
    : `${toolNames.slice(0, 2).join(', ')} +${toolNames.length - 2}`

  return (
    <button
      onClick={() => firstSpanId && onClick?.(firstSpanId)}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-all',
        'border border-gray-300 dark:border-gray-600',
        'bg-gray-50 dark:bg-gray-800',
        'hover:bg-gray-100 dark:hover:bg-gray-700',
        hasErrors && 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30',
        isSelected && 'ring-2 ring-primary border-primary'
      )}
    >
      <Wrench className={cn(
        'h-3.5 w-3.5 flex-shrink-0',
        hasErrors ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'
      )} />
      <span className={cn(
        'text-xs font-medium',
        hasErrors ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'
      )}>
        {count} tool call{count !== 1 ? 's' : ''}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
        {displayNames}
      </span>
    </button>
  )
}
