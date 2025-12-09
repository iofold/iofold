'use client'

import { useMemo } from 'react'
import { MessageSquare, User, Bot, Wrench, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { extractLastExchange, extractToolCalls, truncateMessage } from '@/lib/trace-parser'
import type { Trace, ExecutionStep } from '@/types/api'
import type { ParsedToolCall, TruncatedMessage } from '@/types/trace'
import { useState } from 'react'

interface TracePreviewProps {
  trace: Trace
  className?: string
  maxMessageLength?: number
  showToolCalls?: boolean
  collapsible?: boolean
}

/**
 * Displays a preview of a trace showing the last user message,
 * assistant response, and tool calls in a compact format
 */
export function TracePreview({
  trace,
  className,
  maxMessageLength = 300,
  showToolCalls = true,
  collapsible = true,
}: TracePreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const lastExchange = useMemo(() => {
    return extractLastExchange(trace.steps || [], { maxMessageLength, includeMetadata: false })
  }, [trace.steps, maxMessageLength])

  const toolCalls = useMemo(() => {
    return showToolCalls ? extractToolCalls(trace.steps || []) : []
  }, [trace.steps, showToolCalls])

  const hasContent = lastExchange.human || lastExchange.assistant || toolCalls.length > 0

  if (!hasContent) {
    return (
      <div className={cn('text-sm text-muted-foreground italic', className)}>
        No conversation data available
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Last Exchange Section */}
      {(lastExchange.human || lastExchange.assistant) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <MessageSquare className="h-3.5 w-3.5" />
            Last Exchange
          </div>

          {/* Human Message */}
          {lastExchange.human && (
            <MessageBlock
              role="user"
              message={lastExchange.human}
              maxLength={maxMessageLength}
              collapsible={collapsible}
            />
          )}

          {/* Assistant Response */}
          {lastExchange.assistant && (
            <MessageBlock
              role="assistant"
              message={lastExchange.assistant}
              maxLength={maxMessageLength}
              collapsible={collapsible}
            />
          )}
        </div>
      )}

      {/* Tool Calls Section */}
      {toolCalls.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Wrench className="h-3.5 w-3.5" />
              Tool Calls ({toolCalls.length})
            </div>
            {toolCalls.length > 3 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                {isExpanded ? (
                  <>
                    Show less <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    Show all <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {(isExpanded ? toolCalls : toolCalls.slice(0, 3)).map((tool, index) => (
              <ToolCallBlock key={`${tool.name}-${index}`} tool={tool} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface MessageBlockProps {
  role: 'user' | 'assistant'
  message: TruncatedMessage
  maxLength?: number
  collapsible?: boolean
}

function MessageBlock({ role, message, collapsible = true }: MessageBlockProps) {
  const [showFull, setShowFull] = useState(false)

  const Icon = role === 'user' ? User : Bot
  const label = role === 'user' ? 'User' : 'Assistant'
  const bgColor = role === 'user' ? 'bg-blue-500/10' : 'bg-green-500/10'
  const iconColor = role === 'user' ? 'text-blue-500' : 'text-green-500'

  const displayContent = showFull && message.fullContent ? message.fullContent : message.content

  return (
    <div className={cn('rounded-lg border p-3', bgColor)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('p-1 rounded', iconColor, 'bg-background/50')}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">
        {displayContent}
      </p>
      {message.truncated && collapsible && (
        <button
          onClick={() => setShowFull(!showFull)}
          className="text-xs text-primary hover:underline mt-2"
        >
          {showFull ? 'Show less' : 'Show full message'}
        </button>
      )}
    </div>
  )
}

interface ToolCallBlockProps {
  tool: ParsedToolCall
}

function ToolCallBlock({ tool }: ToolCallBlockProps) {
  const [isOpen, setIsOpen] = useState(false)
  const hasError = !!tool.error
  const hasResult = tool.result !== undefined

  return (
    <div
      className={cn(
        'rounded-lg border p-3 text-sm',
        hasError ? 'bg-red-500/5 border-red-500/20' : 'bg-muted/30'
      )}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasError ? (
            <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
          ) : (
            <Wrench className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <span className="font-mono text-xs truncate">
            {tool.module && (
              <span className="text-muted-foreground">{tool.module}.</span>
            )}
            {tool.name}
          </span>
          {hasResult && !hasError && (
            <span className="text-xs text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">
              Success
            </span>
          )}
          {hasError && (
            <span className="text-xs text-red-600 bg-red-500/10 px-1.5 py-0.5 rounded">
              Error
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-2">
          {/* Arguments */}
          {tool.arguments && Object.keys(tool.arguments).length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Arguments:</div>
              <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
                {JSON.stringify(tool.arguments, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {hasResult && !hasError && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Result:</div>
              <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
                {typeof tool.result === 'string'
                  ? tool.result
                  : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {hasError && (
            <div>
              <div className="text-xs text-red-500 mb-1">Error:</div>
              <pre className="text-xs bg-red-500/10 text-red-600 p-2 rounded overflow-x-auto">
                {tool.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Compact version for table cells or list items
 */
export function TracePreviewCompact({
  trace,
  className,
}: {
  trace: Trace
  className?: string
}) {
  const lastExchange = useMemo(() => {
    return extractLastExchange(trace.steps || [], { maxMessageLength: 100, includeMetadata: false })
  }, [trace.steps])

  const toolCalls = extractToolCalls(trace.steps || [])

  return (
    <div className={cn('text-sm space-y-1', className)}>
      {lastExchange.human && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <User className="h-3 w-3 text-blue-500 flex-shrink-0" />
          <span className="truncate">{lastExchange.human.content}</span>
        </div>
      )}
      {lastExchange.assistant && (
        <div className="flex items-center gap-1.5">
          <Bot className="h-3 w-3 text-green-500 flex-shrink-0" />
          <span className="truncate">{lastExchange.assistant.content}</span>
        </div>
      )}
      {toolCalls.length > 0 && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Wrench className="h-3 w-3 flex-shrink-0" />
          <span className="text-xs">{toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  )
}
