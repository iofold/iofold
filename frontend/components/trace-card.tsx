'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { TraceSummary } from '@/types/api'
import { formatRelativeTime, getRatingEmoji, truncate } from '@/lib/utils'

interface TraceCardProps {
  trace: TraceSummary
}

export function TraceCard({ trace }: TraceCardProps) {
  return (
    <Link href={`/traces/${trace.id}`}>
      <Card className="p-4 hover:bg-accent transition-colors cursor-pointer">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-muted-foreground">
                {trace.trace_id.slice(0, 8)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                {trace.source}
              </span>
              {trace.feedback && (
                <span className="text-lg">
                  {getRatingEmoji(trace.feedback.rating)}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatRelativeTime(trace.timestamp)}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">
              {trace.step_count} {trace.step_count === 1 ? 'step' : 'steps'}
            </div>
            {trace.summary.has_errors && (
              <span className="text-xs text-red-600">Has errors</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Input</div>
            <div className="text-sm">
              {truncate(trace.summary.input_preview, 100)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Output</div>
            <div className="text-sm">
              {truncate(trace.summary.output_preview, 100)}
            </div>
          </div>
        </div>

        {trace.feedback?.notes && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-muted-foreground mb-1">Notes</div>
            <div className="text-sm">{truncate(trace.feedback.notes, 100)}</div>
          </div>
        )}
      </Card>
    </Link>
  )
}
