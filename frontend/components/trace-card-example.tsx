/**
 * Example usage of trace parser in a React component
 * This demonstrates how the parser integrates with the card-swiping UI
 */

'use client'

import { parseTrace, getStatusEmoji, formatRelativeTime, formatDuration } from '@/lib/trace-parser'
import type { Trace } from '@/types/api'
import type { ParsedTrace } from '@/types/trace'

interface TraceCardProps {
  trace: Trace
  index: number
  onSwipe?: (direction: 'left' | 'right' | 'down') => void
}

export function TraceCard({ trace, index, onSwipe }: TraceCardProps) {
  const parsed: ParsedTrace = parseTrace(trace, index + 1, {
    maxMessageLength: 200,
    includeMetadata: false,
  })

  const { header, lastExchange, toolCalls } = parsed

  return (
    <div className="trace-card">
      {/* Header */}
      <div className="card-header">
        <span className="status-emoji">{getStatusEmoji(header.status)}</span>
        <span className="trace-number">Trace #{header.traceNumber}</span>
        <span className="timestamp">{formatRelativeTime(header.timestamp)}</span>
        <span className="stats">
          {header.stepCount} steps
          {header.duration && ` · ${formatDuration(header.duration)}`}
        </span>
      </div>

      {/* Main Content */}
      <div className="card-content">
        {/* Last Exchange */}
        {lastExchange.human && (
          <div className="message human-message">
            <span className="role-icon">👤</span>
            <span className="role-label">Human:</span>
            <p className="message-content">{lastExchange.human.content}</p>
            {lastExchange.human.truncated && (
              <button className="show-more" title={lastExchange.human.fullContent}>
                Show more...
              </button>
            )}
          </div>
        )}

        {lastExchange.assistant && (
          <div className="message assistant-message">
            <span className="role-icon">🤖</span>
            <span className="role-label">Assistant:</span>
            <p className="message-content">{lastExchange.assistant.content}</p>
            {lastExchange.assistant.truncated && (
              <button className="show-more" title={lastExchange.assistant.fullContent}>
                Show more...
              </button>
            )}
          </div>
        )}

        {/* Tool Calls */}
        {toolCalls.length > 0 && (
          <div className="tool-calls">
            {toolCalls.map((tool, i) => (
              <div key={i} className="tool-call">
                <span className="tool-icon">🔧</span>
                <span className="tool-name">
                  Used tool: {tool.module ? `${tool.module}.` : ''}
                  {tool.name}
                </span>
                {tool.result !== undefined && (
                  <div className="tool-result">
                    → Result: {JSON.stringify(tool.result)}
                  </div>
                )}
                {tool.error && (
                  <div className="tool-error">
                    ⚠️ Error: {tool.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!lastExchange.human && !lastExchange.assistant && toolCalls.length === 0 && (
          <div className="empty-state">
            <p>No messages or tool calls in this trace</p>
            <p className="hint">This trace may be incomplete or still processing</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="card-actions">
        <button
          className="action-btn negative"
          onClick={() => onSwipe?.('left')}
        >
          👎 Negative
        </button>
        <button
          className="action-btn neutral"
          onClick={() => onSwipe?.('down')}
        >
          😐 Neutral
        </button>
        <button
          className="action-btn positive"
          onClick={() => onSwipe?.('right')}
        >
          👍 Positive
        </button>
      </div>

      {/* Swipe hints */}
      <div className="swipe-hints">
        <span>👈 Swipe left for 👎</span>
        <span>👉 Swipe right for 👍</span>
        <span>↓ Swipe down for 😐</span>
      </div>

      {/* Keyboard hints */}
      <div className="keyboard-hints">
        <span>Press: [1] Positive</span>
        <span>[2] Neutral</span>
        <span>[3] Negative</span>
      </div>
    </div>
  )
}

/**
 * Example usage in a page component
 */
export function TraceReviewPage() {
  // This would come from API
  const traces: Trace[] = []

  const handleSwipe = (trace: Trace, direction: 'left' | 'right' | 'down') => {
    const rating = direction === 'right' ? 'positive' : direction === 'left' ? 'negative' : 'neutral'
    console.log(`Rated trace ${trace.id} as ${rating}`)
    // Submit feedback to API
  }

  return (
    <div className="trace-review-container">
      <div className="header">
        <h1>Trace Review</h1>
        <p>{traces.length} traces remaining</p>
      </div>

      <div className="cards-stack">
        {traces.map((trace, index) => (
          <TraceCard
            key={trace.id}
            trace={trace}
            index={index}
            onSwipe={(direction) => handleSwipe(trace, direction)}
          />
        ))}
      </div>

      {traces.length === 0 && (
        <div className="empty-state">
          <h2>No traces to review</h2>
          <p>Import traces from your observability platform to get started</p>
        </div>
      )}
    </div>
  )
}
