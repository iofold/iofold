'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { ThumbsUp, ThumbsDown, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface TraceFeedbackProps {
  traceId: string
  agentId: string
  currentRating?: 'positive' | 'negative' | 'neutral' | null
  feedbackId?: string
  onFeedbackChange?: () => void
}

export function TraceFeedback({ traceId, agentId, currentRating, feedbackId, onFeedbackChange }: TraceFeedbackProps) {
  const [rating, setRating] = useState<'positive' | 'negative' | 'neutral' | null>(currentRating || null)
  const queryClient = useQueryClient()

  const submitMutation = useMutation({
    mutationFn: (rating: 'positive' | 'negative' | 'neutral') => {
      // If feedback already exists, update it; otherwise create new
      if (feedbackId) {
        return apiClient.updateFeedback(feedbackId, { rating })
      }
      return apiClient.submitFeedback({
        trace_id: traceId,
        agent_id: agentId,
        rating,
      })
    },
    onSuccess: (_, rating) => {
      setRating(rating)
      queryClient.invalidateQueries({ queryKey: ['traces'] })
      queryClient.invalidateQueries({ queryKey: ['trace', traceId] })
      queryClient.invalidateQueries({ queryKey: ['agents', agentId] })
      toast.success(`Marked as ${rating}`)
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
      if (e.key === '1' || e.key === 'ArrowLeft') {
        e.preventDefault()
        submitMutation.mutate('positive')
      } else if (e.key === '2' || e.key === 'ArrowDown') {
        e.preventDefault()
        submitMutation.mutate('neutral')
      } else if (e.key === '3' || e.key === 'ArrowRight') {
        e.preventDefault()
        submitMutation.mutate('negative')
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [submitMutation])

  return (
    <div className="flex gap-2">
      <Button
        data-testid="feedback-positive"
        size="sm"
        variant={rating === 'positive' ? 'default' : 'outline'}
        onClick={() => submitMutation.mutate('positive')}
        disabled={submitMutation.isPending}
        className={cn(
          rating === 'positive' && 'bg-green-600 hover:bg-green-700 active selected'
        )}
      >
        <ThumbsUp className="w-4 h-4 mr-1" />
        Positive (1)
      </Button>
      <Button
        data-testid="feedback-neutral"
        size="sm"
        variant={rating === 'neutral' ? 'default' : 'outline'}
        onClick={() => submitMutation.mutate('neutral')}
        disabled={submitMutation.isPending}
        className={cn(
          rating === 'neutral' && 'bg-gray-600 hover:bg-gray-700 active selected'
        )}
      >
        <Minus className="w-4 h-4 mr-1" />
        Neutral (2)
      </Button>
      <Button
        data-testid="feedback-negative"
        size="sm"
        variant={rating === 'negative' ? 'default' : 'outline'}
        onClick={() => submitMutation.mutate('negative')}
        disabled={submitMutation.isPending}
        className={cn(
          rating === 'negative' && 'bg-red-600 hover:bg-red-700 active selected'
        )}
      >
        <ThumbsDown className="w-4 h-4 mr-1" />
        Negative (3)
      </Button>
    </div>
  )
}
