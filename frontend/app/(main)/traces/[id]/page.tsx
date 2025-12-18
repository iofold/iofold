'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@/hooks/use-router-with-progress'
import { useParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import {
  ArrowLeft,
  Layers,
  AlertCircle,
  Calendar,
  Code2,
  Timer,
} from 'lucide-react'
import { formatDate, formatDuration, cn } from '@/lib/utils'
import { TraceFeedback } from '@/components/trace-feedback'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TraceExplorer } from '@/components/review/TraceExplorer'
import { ConversationThread } from '@/components/review/ConversationThread'
// Skeleton component
function TraceDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-muted rounded w-1/4"></div>
      <div className="h-64 bg-muted rounded"></div>
      <div className="h-96 bg-muted rounded"></div>
    </div>
  )
}

// Main Page Component
export default function TraceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const traceId = params.id as string
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)

  // Fetch trace data
  const { data: trace, isLoading, error } = useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => apiClient.getTrace(traceId),
  })

  // Calculate total duration
  const totalDuration = useMemo(() => {
    if (!trace?.timestamp) return 0

    const start = new Date(trace.timestamp).getTime()
    let end = start

    // Check spans first (new format)
    if (trace.spans && trace.spans.length > 0) {
      trace.spans.forEach((span: any) => {
        if (span.end_time) {
          const spanEnd = new Date(span.end_time).getTime()
          if (spanEnd > end) end = spanEnd
        }
      })
    }
    // Check raw_data.observations
    else if (trace.raw_data?.observations) {
      trace.raw_data.observations.forEach((obs: any) => {
        if (obs.endTime || obs.completedAt) {
          const obsEnd = new Date(obs.endTime || obs.completedAt).getTime()
          if (obsEnd > end) end = obsEnd
        }
      })
    }
    // Fallback: sum latency from steps metadata
    else if (trace.steps && trace.steps.length > 0) {
      return trace.steps.reduce((total: number, step: any) => {
        const stepLatency = step.metadata?.latency_ms || 0
        return total + stepLatency
      }, 0)
    }

    return end - start
  }, [trace])

  // Handle cross-pane selection
  const handleSelect = (id: string) => {
    setSelectedId(id)
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-[1800px]">
        <TraceDetailSkeleton />
      </div>
    )
  }

  if (error || !trace) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-[1800px]">
        <ErrorState
          title="Failed to load trace"
          message="The trace could not be found or there was an error loading it."
          error={error as Error}
          onRetry={() => router.back()}
        />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto px-4 py-8 max-w-[1800px]">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push('/traces')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Traces
          </Button>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">Trace Details</h1>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 max-w-xs">
                      <Code2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <code className="font-mono text-xs bg-muted px-2 py-1 rounded truncate">
                        {trace.trace_id}
                      </code>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="font-mono text-xs max-w-md break-all">
                    {trace.trace_id}
                  </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{formatDate(trace.timestamp)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs">
                    {trace.source}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{formatDuration(totalDuration)}</span>
                </div>
                {trace.summary?.has_errors && (
                  <div className="flex items-center gap-2 text-error">
                    <AlertCircle className="h-4 w-4" />
                    <span>Has Errors</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Main Content - Split Pane Layout (same as Quick Review) */}
        <Card className="h-[700px] mb-6">
          <CardContent className="h-full p-4 overflow-hidden">
            <div className="grid grid-cols-12 gap-4 h-full">
              {/* Left Pane - Conversation Thread */}
              <div className="col-span-6 overflow-hidden flex flex-col">
                <h2 className="text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Conversation</h2>
                {trace.spans && trace.spans.length > 0 ? (
                  <ConversationThread
                    spans={trace.spans}
                    selectedId={selectedId}
                    onMessageClick={handleSelect}
                    onToolCallClick={handleSelect}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <p className="text-sm text-muted-foreground text-center">
                      No conversation data available for this trace
                    </p>
                  </div>
                )}
              </div>

              {/* Right Pane - Trace Explorer */}
              <div className="col-span-6 overflow-hidden">
                <TraceExplorer
                  trace={trace}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feedback Section */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {trace.feedback ? 'Update Feedback' : 'Add Feedback'}
          </h2>

          {trace.feedback && (
            <div className="mb-6 p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-lg">
                  {trace.feedback.rating === 'positive' ? '👍' : trace.feedback.rating === 'negative' ? '👎' : '😐'}
                </span>
                <span className="font-medium capitalize">{trace.feedback.rating}</span>
              </div>
              {trace.feedback.notes && (
                <div className="text-sm text-muted-foreground mb-2">{trace.feedback.notes}</div>
              )}
            </div>
          )}

          {/* Feedback Buttons - agent_id is optional, feedback is directly on traces */}
          <TraceFeedback
            traceId={trace.id}
            currentRating={trace.feedback?.rating}
            feedbackId={trace.feedback?.id}
          />
        </Card>
      </div>
    </TooltipProvider>
  )
}
