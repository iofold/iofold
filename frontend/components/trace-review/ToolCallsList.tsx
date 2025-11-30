/**
 * ToolCallsList Component
 *
 * Displays tool calls with expand/collapse functionality.
 * Shows tool name, module, result, or error in a compact format.
 */

import { useState } from 'react'
import { ParsedToolCall } from '@/types/trace'

interface ToolCallsListProps {
  toolCalls: ParsedToolCall[]
}

export function ToolCallsList({ toolCalls }: ToolCallsListProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  if (!toolCalls || toolCalls.length === 0) {
    return null
  }

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index)
  }

  const formatResult = (result: any): string => {
    if (result === null || result === undefined) {
      return 'null'
    }

    if (typeof result === 'string') {
      return result
    }

    if (typeof result === 'number' || typeof result === 'boolean') {
      return String(result)
    }

    if (Array.isArray(result)) {
      return `[Array with ${result.length} items]`
    }

    if (typeof result === 'object') {
      const keys = Object.keys(result)
      return `{Object with ${keys.length} keys}`
    }

    return JSON.stringify(result)
  }

  return (
    <div className="px-4 pb-4 space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <span role="img" aria-label="Tools" className="text-lg">🔧</span>
        <span className="text-sm font-semibold text-muted-foreground">
          Tool Calls ({toolCalls.length}):
        </span>
      </div>

      {toolCalls.map((toolCall, index) => (
        <div
          key={index}
          className="bg-muted border border-border rounded p-3"
        >
          {/* Tool Name and Module */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <code className="font-mono text-sm font-semibold text-foreground">
                  {toolCall.name}
                </code>
                {toolCall.module && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {toolCall.module}
                  </span>
                )}
              </div>

              {/* Result or Error */}
              {toolCall.error ? (
                <div className="mt-2 text-sm">
                  <div className="flex items-center gap-1 text-destructive">
                    <span role="img" aria-label="Error">❌</span>
                    <span className="font-semibold">Error:</span>
                  </div>
                  <div className="mt-1 text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
                    <code className="text-xs font-mono whitespace-pre-wrap break-words">
                      {toolCall.error}
                    </code>
                  </div>
                </div>
              ) : toolCall.result !== undefined ? (
                <div className="mt-2 text-sm">
                  <div className="flex items-center gap-1 text-success">
                    <span>→</span>
                    <span className="font-semibold">Result:</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {expandedIndex === index ? (
                      <div className="bg-card border border-border rounded p-2">
                        <code className="text-xs font-mono whitespace-pre-wrap break-words">
                          {JSON.stringify(toolCall.result, null, 2)}
                        </code>
                      </div>
                    ) : (
                      <code className="text-xs font-mono text-muted-foreground">
                        {formatResult(toolCall.result)}
                      </code>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Arguments (collapsed by default) */}
              {toolCall.arguments && expandedIndex === index && (
                <div className="mt-2 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="font-semibold">Arguments:</span>
                  </div>
                  <div className="mt-1 bg-card border border-border rounded p-2">
                    <code className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
                      {JSON.stringify(toolCall.arguments, null, 2)}
                    </code>
                  </div>
                </div>
              )}
            </div>

            {/* Expand/Collapse Button */}
            {(toolCall.arguments || (toolCall.result && typeof toolCall.result === 'object')) && (
              <button
                onClick={() => toggleExpand(index)}
                className="text-xs text-muted-foreground hover:text-foreground font-medium shrink-0"
                aria-label={expandedIndex === index ? 'Collapse details' : 'Expand details'}
              >
                {expandedIndex === index ? '▲ Less' : '▼ More'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
