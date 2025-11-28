'use client'

import { Suspense, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { TraceCard } from '@/components/trace-card'
import { TraceFeedback } from '@/components/trace-feedback'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { Upload, Inbox } from 'lucide-react'
import { formatRelativeTime, getRatingEmoji, truncate } from '@/lib/utils'
import { ImportTracesModal } from '@/components/import-traces-modal'
import { TraceListSkeleton } from '@/components/skeletons/trace-skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function TracesPageContent() {
  const searchParams = useSearchParams()
  const urlEvalSetId = searchParams?.get('eval_set_id')
  const [selectedEvalSetId, setSelectedEvalSetId] = useState<string | null>(urlEvalSetId || null)
  const [importModalOpen, setImportModalOpen] = useState(false)

  // Fetch eval sets for the selector
  const { data: evalSetsData } = useQuery({
    queryKey: ['eval-sets'],
    queryFn: () => apiClient.listEvalSets(),
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['traces'],
    queryFn: () => apiClient.listTraces({ limit: 50 }),
  })

  // Get the effective eval set ID (from existing feedback or selected)
  const getEffectiveEvalSetId = (trace: any) => {
    return trace.feedback?.eval_set_id || selectedEvalSetId
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Traces</h1>
          <p className="text-muted-foreground">
            Browse and annotate imported traces
          </p>
        </div>
        <Button onClick={() => setImportModalOpen(true)} data-testid="import-traces-button">
          <Upload className="w-4 h-4 mr-2" />
          Import Traces
        </Button>
      </div>

      {/* Eval Set Selector */}
      <div className="mb-6 p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">Eval Set for Feedback:</label>
          <Select
            value={selectedEvalSetId || ''}
            onValueChange={(value) => setSelectedEvalSetId(value || null)}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select an eval set..." />
            </SelectTrigger>
            <SelectContent>
              {evalSetsData?.eval_sets?.map((evalSet) => (
                <SelectItem key={evalSet.id} value={evalSet.id}>
                  {evalSet.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedEvalSetId && (
            <span className="text-sm text-muted-foreground">
              Select an eval set to enable quick feedback
            </span>
          )}
        </div>
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
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No traces yet</h3>
          <p className="text-muted-foreground text-center mb-6 max-w-sm">
            Import traces from your connected integrations to start reviewing and annotating them.
          </p>
          <Button onClick={() => setImportModalOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import Traces
          </Button>
        </div>
      ) : (
        <div className="space-y-4" data-testid="trace-list">
          {data?.traces.map((trace) => (
            <Card key={trace.id} className="p-4" data-testid="trace-row">
              <Link href={`/traces/${trace.id}`} className="block hover:bg-accent/50 transition-colors -m-4 p-4 mb-0">
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
              </Link>

              <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                {getEffectiveEvalSetId(trace) ? (
                  <TraceFeedback
                    traceId={trace.id}
                    evalSetId={getEffectiveEvalSetId(trace)!}
                    currentRating={trace.feedback?.rating}
                    feedbackId={trace.feedback?.id}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Select an eval set above to provide feedback
                  </div>
                )}
              </div>
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

export default function TracesPage() {
  return (
    <Suspense fallback={<div className="container py-8"><TraceListSkeleton count={5} /></div>}>
      <TracesPageContent />
    </Suspense>
  )
}
