'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { TraceCard } from '@/components/trace-card'
import { TraceFeedback } from '@/components/trace-feedback'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { Upload } from 'lucide-react'
import { formatRelativeTime, getRatingEmoji, truncate } from '@/lib/utils'
import { ImportTracesModal } from '@/components/import-traces-modal'
import { TraceListSkeleton } from '@/components/skeletons/trace-skeleton'

export default function TracesPage() {
  const searchParams = useSearchParams()
  const evalSetId = searchParams?.get('eval_set_id') || 'default'
  const [importModalOpen, setImportModalOpen] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['traces'],
    queryFn: () => apiClient.listTraces({ limit: 50 }),
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Traces</h1>
          <p className="text-muted-foreground">
            Browse and annotate imported traces
          </p>
        </div>
        <Button onClick={() => setImportModalOpen(true)}>
          <Upload className="w-4 h-4 mr-2" />
          Import Traces
        </Button>
      </div>

      {isLoading ? (
        <TraceListSkeleton count={5} />
      ) : error ? (
        <ErrorState
          title="Failed to load traces"
          message="There was an error loading traces. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      ) : data?.traces.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No traces found. Import traces from your integrations to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {data?.traces.map((trace) => (
            <Card key={trace.id} className="p-4">
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

              <div className="space-y-2 mb-4">
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
                <div className="mb-4 pb-4 border-b">
                  <div className="text-xs text-muted-foreground mb-1">Notes</div>
                  <div className="text-sm">{truncate(trace.feedback.notes, 100)}</div>
                </div>
              )}

              <TraceFeedback
                traceId={trace.id}
                evalSetId={evalSetId}
                currentRating={trace.feedback?.rating}
              />
            </Card>
          ))}
        </div>
      )}

      <ImportTracesModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
      />
    </div>
  )
}
