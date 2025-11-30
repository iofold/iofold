/**
 * Trace Review Page - Enhanced card-swiping interface for providing feedback
 *
 * Features:
 * - Fetches traces without feedback from API
 * - Card-swiping interface with keyboard shortcuts
 * - Progress tracking and completion screen
 * - Toast notifications for feedback
 * - URL parameter support for agent_id filtering
 * - Responsive mobile/desktop layout
 * - Auto-advance mode with configurable delay (0.8s/1.5s/2.5s)
 * - Undo functionality with Ctrl+Z support
 * - Break reminders after 20 minutes
 * - Streak tracking for positive reviews
 * - Enhanced keyboard shortcuts (Space, A, Ctrl+Z)
 */

'use client'

import { useState, useEffect, Suspense, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { TableSkeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import { ArrowLeft, RefreshCw, Play, Pause, RotateCcw, Coffee, Award, Clock } from 'lucide-react'
import { toast } from 'sonner'
import type { Trace } from '@/types/api'

// ============================================================================
// Dynamic imports
// ============================================================================

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

// ============================================================================
// Types
// ============================================================================

interface UndoState {
  index: number
  feedback: {
    positive: number
    negative: number
    neutral: number
    streak: number
  }
  feedbackHistory: Record<string, { rating: 'positive' | 'negative' | 'neutral'; timestamp: string }>
}

// ============================================================================
// Component
// ============================================================================

function ReviewPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const agentId = searchParams.get('agent_id') || undefined

  // Core state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [feedbackCounts, setFeedbackCounts] = useState({
    positive: 0,
    negative: 0,
    neutral: 0,
    streak: 0,
  })

  // New features state
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false)
  const [autoAdvanceDelay, setAutoAdvanceDelay] = useState(1500) // milliseconds
  const [undoStack, setUndoStack] = useState<UndoState[]>([])
  const [showBreakReminder, setShowBreakReminder] = useState(false)
  const [feedbackHistory, setFeedbackHistory] = useState<Record<string, { rating: 'positive' | 'negative' | 'neutral'; timestamp: string }>>({})
  const sessionStartTimeRef = useRef(new Date())
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch traces without feedback
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
      notes,
    }: {
      trace_id: string
      rating: 'positive' | 'negative' | 'neutral'
      agent_id: string
      notes?: string
    }) => {
      return apiClient.submitFeedback({
        trace_id,
        rating,
        agent_id,
        notes,
      })
    },
    onSuccess: (_, variables) => {
      // Save current state for undo before updating
      const currentTrace = currentTraceSummary
      if (currentTrace) {
        setUndoStack((prev) => [
          ...prev,
          {
            index: currentIndex,
            feedback: { ...feedbackCounts },
            feedbackHistory: { ...feedbackHistory },
          },
        ])
      }

      // Update feedback history
      setFeedbackHistory((prev) => ({
        ...prev,
        [variables.trace_id]: {
          rating: variables.rating,
          timestamp: new Date().toISOString(),
        },
      }))

      // Update feedback counts and streak
      setFeedbackCounts((prev) => {
        const newCounts = {
          ...prev,
          [variables.rating]: prev[variables.rating] + 1,
        }

        // Update streak
        if (variables.rating === 'positive') {
          newCounts.streak = prev.streak + 1
        } else {
          newCounts.streak = 0
        }

        return newCounts
      })

      // Show success toast
      const emoji = variables.rating === 'positive' ? '👍' : variables.rating === 'negative' ? '👎' : '😐'
      toast.success(`${emoji} Marked as ${variables.rating}`, {
        duration: 1500,
      })

      // Invalidate traces query to refetch
      queryClient.invalidateQueries({ queryKey: ['traces', 'review', agentId] })

      // Auto-advance if enabled
      if (isAutoAdvancing) {
        autoAdvanceTimerRef.current = setTimeout(() => {
          if (currentIndex < totalTraces - 1) {
            setCurrentIndex((prev) => prev + 1)
          }
        }, autoAdvanceDelay)
      } else {
        // Move to next trace after a brief delay
        setTimeout(() => {
          if (currentIndex < totalTraces - 1) {
            setCurrentIndex((prev) => prev + 1)
          }
        }, 300)
      }
    },
    onError: (error) => {
      toast.error('Failed to submit feedback. Please try again.')
      console.error('Feedback submission error:', error)
    },
  })

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleFeedback = useCallback((rating: 'positive' | 'negative' | 'neutral', notes?: string) => {
    if (!currentTrace) return

    // Need agent_id to submit feedback
    if (!agentId) {
      toast.error('No agent selected. Please select an agent first.')
      return
    }

    // Clear any pending auto-advance timer
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }

    submitFeedbackMutation.mutate({
      trace_id: currentTrace.id,
      rating,
      agent_id: agentId,
      notes,
    })
  }, [currentTrace, agentId, submitFeedbackMutation])

  const handleSkip = useCallback(() => {
    toast.info('⏭️ Skipped', { duration: 1000 })
    if (currentIndex < totalTraces - 1) {
      setCurrentIndex((prev) => prev + 1)
    }
  }, [currentIndex, totalTraces])

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }, [currentIndex])

  const handleNext = useCallback(() => {
    if (currentIndex < totalTraces - 1) {
      setCurrentIndex((prev) => prev + 1)
    }
  }, [currentIndex, totalTraces])

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) {
      toast.error('Nothing to undo')
      return
    }

    const lastState = undoStack[undoStack.length - 1]
    setCurrentIndex(lastState.index)
    setFeedbackCounts(lastState.feedback)
    setFeedbackHistory(lastState.feedbackHistory)
    setUndoStack((prev) => prev.slice(0, -1))

    toast.success('↩️ Undone', { duration: 1000 })
  }, [undoStack])

  const toggleAutoAdvance = useCallback(() => {
    setIsAutoAdvancing((prev) => {
      const newValue = !prev
      toast.success(newValue ? '▶️ Auto-advance enabled' : '⏸️ Auto-advance paused', {
        duration: 1500,
      })
      return newValue
    })
  }, [])

  // ============================================================================
  // Effects
  // ============================================================================

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

  // Break reminder (every 20 minutes)
  useEffect(() => {
    const breakTimer = setTimeout(() => {
      setShowBreakReminder(true)
    }, 20 * 60 * 1000) // 20 minutes

    return () => clearTimeout(breakTimer)
  }, [])

  // Cleanup auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current)
      }
    }
  }, [])

  // Enhanced keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts if not typing in an input or select
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

      // Handle shortcuts
      if (e.key === ' ') {
        // Space: Skip
        e.preventDefault()
        handleSkip()
      } else if (e.key === 'a' || e.key === 'A') {
        // A: Toggle auto-advance
        e.preventDefault()
        toggleAutoAdvance()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        // Ctrl+Z / Cmd+Z: Undo
        e.preventDefault()
        handleUndo()
      } else if (e.key === 'ArrowLeft') {
        // Arrow Left: Previous
        e.preventDefault()
        handlePrevious()
      } else if (e.key === 'ArrowRight') {
        // Arrow Right: Next
        e.preventDefault()
        handleNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, totalTraces, handleSkip, handleUndo, handlePrevious, handleNext, toggleAutoAdvance])

  // ============================================================================
  // Render States
  // ============================================================================

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
    const sessionDuration = Math.round((new Date().getTime() - sessionStartTimeRef.current.getTime()) / 1000)
    const averageTimePerTrace = totalReviewed > 0 ? Math.round(sessionDuration / totalReviewed) : 0

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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Review Complete!</h2>
            <p className="text-gray-600 mb-6">
              {totalReviewed > 0
                ? `Great job! You've reviewed all ${totalReviewed} traces${sessionDuration > 0 ? ` in ${Math.round(sessionDuration / 60)} minutes` : ''}`
                : 'No traces to review. All traces have feedback!'}
            </p>

            {totalReviewed > 0 && (
              <>
                {/* Feedback Summary */}
                <div className="grid grid-cols-4 gap-4 mb-8">
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
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-3xl mb-1">⏱️</div>
                    <div className="text-2xl font-bold text-blue-700">
                      {averageTimePerTrace}s
                    </div>
                    <div className="text-xs text-blue-600">
                      Avg/Trace
                    </div>
                  </div>
                </div>

                {/* Achievement Badges */}
                {feedbackCounts.streak >= 3 && (
                  <div className="bg-purple-50 p-4 rounded-lg mb-6">
                    <Award className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                    <p className="text-purple-700 font-semibold">
                      Consistency Streak: {feedbackCounts.streak} positive reviews!
                    </p>
                  </div>
                )}
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

  // ============================================================================
  // Main review interface
  // ============================================================================

  const completedCount = Object.keys(feedbackHistory).length
  const estimatedTimeRemaining = remainingCount * 15 // 15 seconds average per trace

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
                <h1 className="text-3xl font-bold text-gray-900">Daily Quick Review</h1>
                <p className="text-gray-600 mt-1">
                  Rapid trace evaluation - Optimized for speed
                </p>
              </div>
            </div>

            {/* Auto-advance and time estimate */}
            <div className="flex items-center gap-3">
              <Button
                variant={isAutoAdvancing ? "default" : "outline"}
                size="sm"
                onClick={toggleAutoAdvance}
              >
                {isAutoAdvancing ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" aria-hidden="true" />
                    Auto
                  </>
                )}
              </Button>

              <div className="text-right bg-white px-3 py-2 rounded-lg border">
                <div className="text-xs text-gray-500">Remaining</div>
                <div className="font-semibold text-gray-700 text-sm">
                  ~{Math.ceil(estimatedTimeRemaining / 60)}m
                </div>
              </div>
            </div>
          </div>

          {/* Progress Section */}
          <div className="bg-white rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">
                Progress: {completedCount}/{totalTraces} traces
              </span>
              <span className="text-sm text-gray-600">
                {Math.round(progress)}% complete
              </span>
            </div>
            <Progress value={progress} className="mb-4" />
            {/* Screen reader progress announcement */}
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              Reviewing trace {currentIndex + 1} of {totalTraces}. {remainingCount} remaining.
            </div>

            {/* Feedback Summary */}
            <div className="flex items-center justify-center gap-4 text-sm">
              <div className="text-center px-3 py-1.5 bg-green-50 rounded-lg">
                <div className="text-lg font-bold text-green-600">{feedbackCounts.positive}</div>
                <div className="text-xs text-gray-500">Good</div>
              </div>
              <div className="text-center px-3 py-1.5 bg-yellow-50 rounded-lg">
                <div className="text-lg font-bold text-yellow-600">{feedbackCounts.neutral}</div>
                <div className="text-xs text-gray-500">Okay</div>
              </div>
              <div className="text-center px-3 py-1.5 bg-red-50 rounded-lg">
                <div className="text-lg font-bold text-red-600">{feedbackCounts.negative}</div>
                <div className="text-xs text-gray-500">Bad</div>
              </div>
              {feedbackCounts.streak > 0 && (
                <div className="text-center px-3 py-1.5 bg-purple-50 rounded-lg">
                  <div className="text-lg font-bold text-purple-600">{feedbackCounts.streak}</div>
                  <div className="text-xs text-gray-500">Streak</div>
                </div>
              )}
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

        {/* Navigation Buttons */}
        <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                size="sm"
              >
                Previous
              </Button>

              {undoStack.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleUndo}
                  size="sm"
                >
                  <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
                  Undo
                </Button>
              )}
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Trace {currentIndex + 1} of {totalTraces}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleSkip}
                size="sm"
              >
                Skip
              </Button>

              <Button
                onClick={handleNext}
                disabled={currentIndex === totalTraces - 1}
                size="sm"
              >
                Next
              </Button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 text-center space-x-4">
              <span>1: 👍 Positive</span>
              <span>2: 😐 Neutral</span>
              <span>3: 👎 Negative</span>
              <span>Space: Skip</span>
              <span>Ctrl+Z: Undo</span>
              <span>A: Toggle Auto</span>
            </div>
          </div>
        </div>

        {/* Auto-advance settings */}
        {isAutoAdvancing && (
          <div className="mt-4 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Auto-advance active
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-600">Delay:</span>
                <select
                  value={autoAdvanceDelay}
                  onChange={(e) => setAutoAdvanceDelay(Number(e.target.value))}
                  className="text-sm border border-blue-300 rounded px-2 py-1 bg-white"
                >
                  <option value={800}>0.8s (Fast)</option>
                  <option value={1500}>1.5s (Normal)</option>
                  <option value={2500}>2.5s (Slow)</option>
                </select>
              </div>
            </div>
          </div>
        )}

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
                  <kbd className="px-2 py-1 bg-gray-100 rounded border text-xs">Space</kbd>
                  <span>Skip current trace</span>
                </li>
                <li className="flex items-start gap-2">
                  <kbd className="px-2 py-1 bg-gray-100 rounded border text-xs">A</kbd>
                  <span>Toggle auto-advance</span>
                </li>
                <li className="flex items-start gap-2">
                  <kbd className="px-2 py-1 bg-gray-100 rounded border text-xs">Ctrl+Z</kbd>
                  <span>Undo last feedback</span>
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
              submit your feedback. Use auto-advance mode for rapid reviewing!
            </p>
          </div>
        </div>
      </div>

      {/* Break Reminder Modal */}
      {showBreakReminder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md text-center shadow-2xl">
            <Coffee className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Time for a break?</h3>
            <p className="text-gray-600 mb-6">
              You&apos;ve been reviewing for 20 minutes. Taking short breaks helps maintain focus and accuracy.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowBreakReminder(false)}
                className="flex-1"
              >
                Continue
              </Button>
              <Button
                onClick={() => router.push('/agents')}
                className="flex-1"
              >
                Take Break
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Export
// ============================================================================

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
