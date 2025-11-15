'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { TraceDetail } from '@/components/trace-detail'
import { FeedbackButtons } from '@/components/feedback-buttons'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function TraceDetailPage({ params }: { params: { id: string } }) {
  const { data: trace, isLoading, error, refetch } = useQuery({
    queryKey: ['trace', params.id],
    queryFn: () => apiClient.getTrace(params.id),
  })

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">Loading trace...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/traces">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Traces
            </Button>
          </Link>
        </div>
        <ErrorState
          title="Failed to load trace"
          message="There was an error loading this trace. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
          showHomeButton={true}
        />
      </div>
    )
  }

  if (!trace) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12 text-muted-foreground">
          Trace not found
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/traces">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Traces
          </Button>
        </Link>
      </div>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">Trace Details</h1>
          <p className="text-sm text-muted-foreground">ID: {trace.trace_id}</p>
        </div>
        <FeedbackButtons traceId={trace.id} currentFeedback={trace.feedback} />
      </div>

      <TraceDetail trace={trace} />
    </div>
  )
}
