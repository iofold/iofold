'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { ArrowLeft } from 'lucide-react'
import { formatRelativeTime, getRatingEmoji } from '@/lib/utils'
import { TraceFeedback } from '@/components/trace-feedback'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function TraceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const traceId = params.id as string

  // Get eval_set_id from URL or existing feedback
  const urlEvalSetId = searchParams?.get('eval_set_id')
  const [selectedEvalSetId, setSelectedEvalSetId] = useState<string | null>(urlEvalSetId || null)

  const { data: trace, isLoading, error } = useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => apiClient.getTrace(traceId),
  })

  // Fetch eval sets for the dropdown
  const { data: evalSetsData } = useQuery({
    queryKey: ['eval-sets'],
    queryFn: () => apiClient.listEvalSets(),
  })

  // Auto-select first eval set if none is selected and no feedback exists
  const effectiveEvalSetId = selectedEvalSetId || trace?.feedback?.eval_set_id || evalSetsData?.eval_sets?.[0]?.id

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (error || !trace) {
    return (
      <div className="container mx-auto px-4 py-8">
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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Traces
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Trace Details</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground" data-testid="trace-metadata">
              <span className="font-mono">{trace.trace_id}</span>
              <span>•</span>
              <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                {trace.source}
              </span>
              <span>•</span>
              <span>{formatRelativeTime(trace.timestamp)}</span>
              {trace.feedback && (
                <>
                  <span>•</span>
                  <span className="text-lg">{getRatingEmoji(trace.feedback.rating)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Card className="p-6 mb-6" data-testid="trace-content">
        <h2 className="text-xl font-semibold mb-4">
          Steps ({trace.steps?.length || 0})
        </h2>
        <div className="space-y-4">
          {trace.steps && trace.steps.length > 0 ? (
            trace.steps.map((step: any, index: number) => (
              <Card key={index} className="p-4 bg-muted/50">
                <div className="flex justify-between items-start mb-3">
                  <div className="font-semibold">Step {index + 1}</div>
                  {step.timestamp && (
                    <div className="text-sm text-muted-foreground">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>

                {step.messages_added && step.messages_added.length > 0 && (
                  <div className="mb-3">
                    <div className="text-sm font-medium mb-2">Messages:</div>
                    {step.messages_added.map((msg: any, msgIdx: number) => (
                      <div key={msgIdx} className="mb-2 pl-4 border-l-2 border-primary">
                        <div className="text-xs text-muted-foreground capitalize">
                          {msg.role || 'unknown'}
                        </div>
                        <div className="text-sm">{msg.content || 'No content'}</div>
                      </div>
                    ))}
                  </div>
                )}

                {step.tool_calls && step.tool_calls.length > 0 && (
                  <div className="mb-3">
                    <div className="text-sm font-medium mb-2">Tool Calls:</div>
                    <div className="space-y-2">
                      {step.tool_calls.map((tool: any, toolIdx: number) => (
                        <div key={toolIdx} className="text-sm bg-background p-3 rounded">
                          <div className="font-mono text-primary">{tool.tool_name || tool.name}</div>
                          {tool.arguments && (
                            <pre className="text-xs mt-2 overflow-auto">
                              {JSON.stringify(tool.arguments, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {step.input && (
                  <div className="mb-3">
                    <div className="text-sm font-medium mb-2">Input:</div>
                    <pre className="text-xs bg-background p-3 rounded overflow-auto">
                      {typeof step.input === 'string' ? step.input : JSON.stringify(step.input, null, 2)}
                    </pre>
                  </div>
                )}

                {step.output && (
                  <div className="mb-3">
                    <div className="text-sm font-medium mb-2">Output:</div>
                    <pre className="text-xs bg-background p-3 rounded overflow-auto">
                      {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                    </pre>
                  </div>
                )}

                {step.error && (
                  <div className="mb-3 text-red-600">
                    <div className="text-sm font-medium mb-2">Error:</div>
                    <div className="text-sm">{step.error}</div>
                  </div>
                )}
              </Card>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No steps data available
            </div>
          )}
        </div>
      </Card>

      {trace.feedback && (
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Feedback</h2>
          <div className="space-y-3">
            <div>
              <span className="text-sm text-muted-foreground">Rating: </span>
              <span className="text-lg">{getRatingEmoji(trace.feedback.rating)}</span>
              <span className="ml-2 capitalize">{trace.feedback.rating}</span>
            </div>
            {trace.feedback.notes && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Notes:</div>
                <div>{trace.feedback.notes}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">
          {trace.feedback ? 'Update Feedback' : 'Add Feedback'}
        </h2>

        {/* Eval Set Selector - only show if no existing feedback */}
        {!trace.feedback && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Select Eval Set
            </label>
            <Select
              value={selectedEvalSetId || ''}
              onValueChange={(value) => setSelectedEvalSetId(value)}
            >
              <SelectTrigger className="w-full max-w-xs">
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
              <p className="text-sm text-muted-foreground mt-2">
                Please select an eval set before providing feedback.
              </p>
            )}
          </div>
        )}

        {/* Show feedback buttons only if eval set is available */}
        {effectiveEvalSetId ? (
          <TraceFeedback
            traceId={trace.id}
            evalSetId={effectiveEvalSetId}
            currentRating={trace.feedback?.rating}
            feedbackId={trace.feedback?.id}
          />
        ) : (
          <div className="text-sm text-muted-foreground">
            {evalSetsData?.eval_sets?.length === 0
              ? 'Create an eval set first to enable feedback.'
              : 'Select an eval set above to enable feedback buttons.'}
          </div>
        )}
      </Card>
    </div>
  )
}
