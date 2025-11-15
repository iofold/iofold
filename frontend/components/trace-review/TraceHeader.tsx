/**
 * TraceHeader Component
 *
 * Displays trace metadata at the top of the card:
 * - Status emoji (complete/partial/error)
 * - Trace number
 * - Timestamp
 * - Step count and duration
 */

import { TraceHeader as TraceHeaderType } from '@/types/trace'
import {
  getStatusEmoji,
  formatRelativeTime,
  formatDuration,
} from '@/lib/trace-parser'

interface TraceHeaderProps {
  header: TraceHeaderType
}

export function TraceHeader({ header }: TraceHeaderProps) {
  const statusEmoji = getStatusEmoji(header.status)
  const relativeTime = formatRelativeTime(header.timestamp)
  const durationText = formatDuration(header.duration)

  return (
    <div className="bg-gray-50 p-4 rounded-t-lg border-b border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl" role="img" aria-label={`Status: ${header.status}`}>
            {statusEmoji}
          </span>
          <span className="font-bold text-gray-900">
            Trace #{header.traceNumber}
          </span>
          <span className="text-gray-500 text-sm">·</span>
          <span className="text-gray-600 text-sm">
            {relativeTime}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <span role="img" aria-label="Steps">📊</span>
          <span>
            {header.stepCount} {header.stepCount === 1 ? 'step' : 'steps'}
          </span>
        </div>

        {header.duration !== undefined && (
          <>
            <span className="text-gray-400">·</span>
            <div className="flex items-center gap-1">
              <span role="img" aria-label="Duration">⏱️</span>
              <span>{durationText}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
