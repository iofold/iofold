'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { ThumbsUp, ThumbsDown, Minus, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FeedbackButtons } from '@/components/feedback-buttons'
import { FeedbackHistory } from '@/components/feedback-history'
import { QuickFeedbackBar } from '@/components/quick-feedback-bar'
import { Feedback } from '@/types/api'

interface TraceFeedbackProps {
  traceId: string
  currentRating?: 'positive' | 'negative' | 'neutral' | null
  feedbackId?: string
  onFeedbackChange?: () => void
  showHistory?: boolean
  showQuickBar?: boolean
}

export function TraceFeedback({
  traceId,
  currentRating,
  feedbackId,
  onFeedbackChange,
  showHistory = false,
  showQuickBar = false,
}: TraceFeedbackProps) {
  const [rating, setRating] = useState<'positive' | 'negative' | 'neutral' | null>(currentRating || null)
  const queryClient = useQueryClient()

  // Fetch current feedback for the trace
  const { data: trace } = useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => apiClient.getTrace(traceId),
  })

  const currentFeedback: Feedback | undefined = trace?.feedback

  const submitMutation = useMutation({
    mutationFn: (data: { rating: 'positive' | 'negative' | 'neutral'; notes?: string }) => {
      // If feedback already exists, update it; otherwise create new
      if (feedbackId) {
        return apiClient.updateFeedback(feedbackId, { rating: data.rating, notes: data.notes })
      }
      return apiClient.submitFeedback({
        trace_id: traceId,
        rating: data.rating,
        notes: data.notes,
      })
    },
    onSuccess: (_, data) => {
      setRating(data.rating)
      queryClient.invalidateQueries({ queryKey: ['traces'] })
      queryClient.invalidateQueries({ queryKey: ['trace', traceId] })
      queryClient.invalidateQueries({ queryKey: ['feedback'] })
      toast.success(`Marked as ${data.rating}`)
      onFeedbackChange?.()
    },
    onError: (error: any) => {
      const message = error?.message || 'Unknown error'
      toast.error(`Failed to submit feedback: ${message}`)
    },
  })

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      if (e.key === '1') {
        e.preventDefault()
        submitMutation.mutate({ rating: 'positive' })
      } else if (e.key === '2') {
        e.preventDefault()
        submitMutation.mutate({ rating: 'neutral' })
      } else if (e.key === '3') {
        e.preventDefault()
        submitMutation.mutate({ rating: 'negative' })
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [submitMutation])

  return (
    <div className="space-y-6">
      {/* Main feedback buttons */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <FeedbackButtons
            traceId={traceId}
            currentFeedback={currentFeedback}
            onFeedbackSubmit={onFeedbackChange}
            showNotesButton={true}
            size="default"
            showLabels={true}
          />
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="text-xs text-muted-foreground">
          Keyboard shortcuts: <kbd className="px-1.5 py-0.5 bg-muted rounded">1</kbd> Good •{' '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded">2</kbd> Neutral •{' '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded">3</kbd> Bad
        </div>
      </div>

      {/* Feedback history */}
      {showHistory && (
        <FeedbackHistory traceId={traceId} />
      )}

      {/* Quick feedback bar (sticky) */}
      {showQuickBar && (
        <QuickFeedbackBar
          traceId={traceId}
          currentFeedback={currentFeedback}
          onFeedbackSubmit={onFeedbackChange}
        />
      )}
    </div>
  )
}
