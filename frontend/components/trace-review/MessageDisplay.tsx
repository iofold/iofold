/**
 * MessageDisplay Component
 *
 * Displays the last human and AI messages in the conversation.
 * Shows truncated content with option to view full message.
 */

import { useState } from 'react'
import { LastExchange } from '@/types/trace'

interface MessageDisplayProps {
  lastExchange: LastExchange
  onExpand?: () => void
}

export function MessageDisplay({ lastExchange, onExpand }: MessageDisplayProps) {
  const [showFullHuman, setShowFullHuman] = useState(false)
  const [showFullAssistant, setShowFullAssistant] = useState(false)

  const { human, assistant } = lastExchange

  // If no messages, show empty state
  if (!human && !assistant) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p className="text-sm">No messages in this trace</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start gap-2 mb-2">
        <span className="text-lg font-semibold text-muted-foreground">💬</span>
        <span className="text-sm font-semibold text-muted-foreground">Last Messages:</span>
      </div>

      {/* Human Message */}
      {human && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span role="img" aria-label="Human" className="text-lg">👤</span>
            <span className="text-sm font-semibold text-info">Human:</span>
          </div>
          <div className="ml-7 bg-info/10 border-l-4 border-info p-3 rounded-r">
            <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
              {showFullHuman && human.fullContent ? human.fullContent : human.content}
            </p>
            {human.truncated && !showFullHuman && (
              <button
                onClick={() => setShowFullHuman(true)}
                className="mt-2 text-xs text-info hover:text-info/80 font-medium"
                aria-label="Show full human message"
              >
                Show more →
              </button>
            )}
            {human.truncated && showFullHuman && (
              <button
                onClick={() => setShowFullHuman(false)}
                className="mt-2 text-xs text-info hover:text-info/80 font-medium"
                aria-label="Show less"
              >
                Show less ←
              </button>
            )}
          </div>
        </div>
      )}

      {/* Assistant Message */}
      {assistant && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span role="img" aria-label="Assistant" className="text-lg">🤖</span>
            <span className="text-sm font-semibold text-purple-700">Assistant:</span>
          </div>
          <div className="ml-7 bg-purple-50 border-l-4 border-purple-500 p-3 rounded-r">
            <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
              {showFullAssistant && assistant.fullContent ? assistant.fullContent : assistant.content}
            </p>
            {assistant.truncated && !showFullAssistant && (
              <button
                onClick={() => setShowFullAssistant(true)}
                className="mt-2 text-xs text-purple-600 hover:text-purple-700 font-medium"
                aria-label="Show full assistant message"
              >
                Show more →
              </button>
            )}
            {assistant.truncated && showFullAssistant && (
              <button
                onClick={() => setShowFullAssistant(false)}
                className="mt-2 text-xs text-purple-600 hover:text-purple-700 font-medium"
                aria-label="Show less"
              >
                Show less ←
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty state for missing messages */}
      {!human && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span role="img" aria-label="Human" className="text-lg">👤</span>
            <span className="text-sm font-semibold text-muted-foreground">Human:</span>
          </div>
          <div className="ml-7 text-sm text-muted-foreground italic">
            No human message
          </div>
        </div>
      )}

      {!assistant && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span role="img" aria-label="Assistant" className="text-lg">🤖</span>
            <span className="text-sm font-semibold text-muted-foreground">Assistant:</span>
          </div>
          <div className="ml-7 text-sm text-muted-foreground italic">
            No assistant response
          </div>
        </div>
      )}
    </div>
  )
}
