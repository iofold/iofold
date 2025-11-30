/**
 * Trace Review Page - Integrated card-swiping interface for providing feedback
 *
 * Features:
 * - Fetches traces without feedback from API
 * - Card-swiping interface with keyboard shortcuts
 * - Progress tracking and completion screen
 * - Toast notifications for feedback
 * - URL parameter support for agent_id filtering
 * - Responsive mobile/desktop layout
 */

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { TableSkeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { Trace } from '@/types/api'

// Dynamic imports for heavy components (Framer Motion)
const AnimatePresence = dynamic(() => import('framer-motion').then(mod => ({ default: mod.AnimatePresence })), {
  ssr: false,
})

const SwipableTraceCard = dynamic(() => import('@/components/swipable-trace-card').then(mod => ({ default: mod.SwipableTraceCard })), {
  loading: () => (
    <div className="flex items-center justify-center min-h-[600px]">
      <div className="animate-pulse bg-white rounded-lg shadow-lg w-full max-w-2xl h-96 flex items-center justify-center">
        <div className="text-gray-400">Loading card...</div>
      </div>
    </div>
  ),
  ssr: false,
})

function ReviewPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const agentId = searchParams.get('agent_id') || undefined

  const [currentIndex, setCurrentIndex] = useState(0)
  const [feedbackCounts, setFeedbackCounts] = useState({
    positive: 0,
    negative: 0,
    neutral: 0,
  })

  // Fetch traces without feedback
  // Note: We don't filter by agent_id here because traces get associated
  // with an agent THROUGH feedback. We fetch all traces without feedback,
  // and the agent_id will be used when submitting feedback.
  const {
    data: tracesData,
    isLoading: isLoadingList,
    error: listError,
    refetch,
  } = useQuery({
    queryKey: ['traces', 'review'],
    queryFn: () =>
      apiClient.listTraces({
        has_feedback: false,
        limit: 50,
      }),
    retry: 2,
  })

  const traceSummaries = tracesData?.traces || []
  const currentTraceSummary = traceSummaries[currentIndex]

  // Fetch full trace details for current trace
  const {
    data: currentTrace,
    isLoading: isLoadingTrace,
    error: traceError,
  } = useQuery({
    queryKey: ['trace', currentTraceSummary?.id],
    queryFn: () => apiClient.getTrace(currentTraceSummary!.id),
    enabled: !!currentTraceSummary,
    retry: 2,
  })

  const isLoading = isLoadingList || isLoadingTrace
  const error = listError || traceError
  const totalTraces = traceSummaries.length
  const reviewedCount = currentIndex
  const remainingCount = totalTraces - currentIndex
  const progress = totalTraces > 0 ? (reviewedCount / totalTraces) * 100 : 0

  // Submit feedback mutation
  const submitFeedbackMutation = useMutation({
    mutationFn: async ({
      trace_id,
      rating,
      agent_id,
    }: {
      trace_id: string
      rating: 'positive' | 'negative' | 'neutral'
      agent_id: string
    }) => {
      return apiClient.submitFeedback({
        trace_id,
        rating,
        agent_id,
      })
    },
    onSuccess: (_, variables) => {
      // Update feedback counts
      setFeedbackCounts((prev) => ({
        ...prev,
        [variables.rating]: prev[variables.rating] + 1,
      }))

      // Show success toast
      const emoji = variables.rating === 'positive' ? '👍' : variables.rating === 'negative' ? '👎' : '😐'
      toast.success(`${emoji} Marked as ${variables.rating}`, {
        duration: 1500,
      })

      // Invalidate traces query to refetch
      queryClient.invalidateQueries({ queryKey: ['traces', 'review', agentId] })

      // Move to next trace after a brief delay
      setTimeout(() => {
        if (currentIndex < totalTraces - 1) {
          setCurrentIndex((prev) => prev + 1)
        }
      }, 300)
    },
    onError: (error) => {
      toast.error('Failed to submit feedback. Please try again.')
      console.error('Feedback submission error:', error)
    },
  })

  const handleFeedback = (rating: 'positive' | 'negative' | 'neutral') => {
    if (!currentTrace) return

    // Need agent_id to submit feedback
    if (!agentId) {
      toast.error('No agent selected. Please select an agent first.')
      return
    }

    submitFeedbackMutation.mutate({
      trace_id: currentTrace.id,
      rating,
      agent_id: agentId,
    })
  }

  const handleSkip = () => {
    toast.info('⏭️ Skipped', { duration: 1000 })
    if (currentIndex < totalTraces - 1) {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }

  const handleNext = () => {
    if (currentIndex < totalTraces - 1) {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  // Prefetch next trace for instant navigation
  useEffect(() => {
    const nextTrace = traceSummaries[currentIndex + 1]
    if (nextTrace) {
      queryClient.prefetchQuery({
        queryKey: ['trace', nextTrace.id],
        queryFn: () => apiClient.getTrace(nextTrace.id),
      })
    }
  }, [currentIndex, traceSummaries, queryClient])

  // Keyboard shortcuts for navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle navigation keys if not typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentIndex > 0) {
          setCurrentIndex((prev) => prev - 1)
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (currentIndex < totalTraces - 1) {
          setCurrentIndex((prev) => prev + 1)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, totalTraces])

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Trace Review</h1>
          <p className="text-muted-foreground">Loading traces...</p>
        </div>
        <TableSkeleton rows={3} />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Trace Review</h1>
        </div>
        <ErrorState
          title="Failed to load traces"
          message="There was an error loading traces for review. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      </div>
    )
  }

  // No agent selected state
  if (!agentId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/agents')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
            Back to Agents
          </Button>
        </div>

        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Agent Selected</h2>
          <p className="text-gray-600 mb-6">
            Please select an agent to start reviewing traces.
          </p>
          <Button onClick={() => router.push('/agents')}>
            View Agents
          </Button>
        </div>
      </div>
    )
  }

  // No traces to review state (completion)
  if (totalTraces === 0 || currentIndex >= totalTraces) {
    const totalReviewed = feedbackCounts.positive + feedbackCounts.negative + feedbackCounts.neutral
    const positivePercent = totalReviewed > 0 ? Math.round((feedbackCounts.positive / totalReviewed) * 100) : 0
    const neutralPercent = totalReviewed > 0 ? Math.round((feedbackCounts.neutral / totalReviewed) * 100) : 0
    const negativePercent = totalReviewed > 0 ? Math.round((feedbackCounts.negative / totalReviewed) * 100) : 0

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/agents')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Back to Agents
            </Button>
          </div>

          <div className="text-center bg-white rounded-lg shadow-lg p-12">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">All Done!</h2>
            <p className="text-gray-600 mb-6">
              {totalReviewed > 0
                ? `You've reviewed all ${totalReviewed} traces`
                : 'No traces to review. All traces have feedback!'}
            </p>

            {totalReviewed > 0 && (
              <>
                {/* Feedback Summary */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-3xl mb-1">👍</div>
                    <div className="text-2xl font-bold text-green-700">
                      {feedbackCounts.positive}
                    </div>
                    <div className="text-xs text-green-600">
                      Positive ({positivePercent}%)
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-3xl mb-1">😐</div>
                    <div className="text-2xl font-bold text-gray-700">
                      {feedbackCounts.neutral}
                    </div>
                    <div className="text-xs text-gray-600">
                      Neutral ({neutralPercent}%)
                    </div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4">
                    <div className="text-3xl mb-1">👎</div>
                    <div className="text-2xl font-bold text-red-700">
                      {feedbackCounts.negative}
                    </div>
                    <div className="text-xs text-red-600">
                      Negative ({negativePercent}%)
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center justify-center gap-4">
              <Button onClick={() => router.push('/agents')}>
                View Agents
              </Button>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                Check for More Traces
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main review interface
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/agents')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
                Back to Agents
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Trace Review</h1>
                <p className="text-gray-600 mt-1">
                  Swipe or use keyboard shortcuts to provide feedback
                </p>
              </div>
            </div>
          </div>

          {/* Progress Section */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">
                Reviewing trace {currentIndex + 1} of {totalTraces}
              </span>
              <span className="text-xs text-gray-500">
                {remainingCount} remaining
              </span>
            </div>
            <Progress value={progress} />
            {/* Screen reader progress announcement */}
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              Reviewing trace {currentIndex + 1} of {totalTraces}. {remainingCount} remaining.
            </div>

            {/* Feedback Summary */}
            <div className="flex items-center justify-center gap-6 mt-4 text-sm">
              <span className="flex items-center gap-1 text-green-700">
                👍 Positive: <strong>{feedbackCounts.positive}</strong>
              </span>
              <span className="flex items-center gap-1 text-gray-700">
                😐 Neutral: <strong>{feedbackCounts.neutral}</strong>
              </span>
              <span className="flex items-center gap-1 text-red-700">
                👎 Negative: <strong>{feedbackCounts.negative}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Card Stack Area */}
        <div className="relative flex items-center justify-center min-h-[600px]">
          {currentTrace && (
            <AnimatePresence mode="wait">
              <SwipableTraceCard
                key={currentTrace.id}
                trace={currentTrace}
                index={currentIndex}
                onFeedback={handleFeedback}
                onSkip={handleSkip}
                isTop={true}
              />
            </AnimatePresence>
          )}
        </div>

        {/* Navigation Buttons (optional, for mouse users) */}
        <div className="mt-6 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={handleSkip}
          >
            Skip
          </Button>
          <Button
            variant="outline"
            onClick={handleNext}
            disabled={currentIndex >= totalTraces - 1}
          >
            Next
          </Button>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">How to Use</h2>
          <div className="grid md:grid-cols-2 gap-6 overflow-x-auto">
            <div>
              <h3 className="font-medium text-gray-700 mb-2">🖱️ Mouse/Touch</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-green-600">→</span>
                  <span>Drag right for positive feedback</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-600">←</span>
                  <span>Drag left for negative feedback</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600">↓</span>
                  <span>Drag down for neutral feedback</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-700 mb-2">⌨️ Keyboard</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <kbd className="px-2 py-1 bg-gray-100 rounded border text-xs">1</kbd>
                  <span>Mark as positive</span>
                </li>
                <li className="flex items-start gap-2">
                  <kbd className="px-2 py-1 bg-gray-100 rounded border text-xs">2</kbd>
                  <span>Mark as neutral</span>
                </li>
                <li className="flex items-start gap-2">
                  <kbd className="px-2 py-1 bg-gray-100 rounded border text-xs">3</kbd>
                  <span>Mark as negative</span>
                </li>
                <li className="flex items-start gap-2">
                  <kbd className="px-2 py-1 bg-gray-100 rounded border text-xs">←/→</kbd>
                  <span>Navigate between traces</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-sm text-blue-800">
              <strong>Pro tip:</strong> Watch for the colored glow as you drag! Green means positive,
              red means negative, and gray means neutral. Release when the threshold is reached to
              submit your feedback.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Trace Review</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <TableSkeleton rows={3} />
      </div>
    }>
      <ReviewPageContent />
    </Suspense>
  )
}
