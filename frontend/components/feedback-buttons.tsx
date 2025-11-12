'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Feedback } from '@/types/api'
import { ThumbsUp, ThumbsDown, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface FeedbackButtonsProps {
  traceId: string
  evalSetId?: string
  currentFeedback?: Feedback
  onFeedbackSubmit?: () => void
}

export function FeedbackButtons({
  traceId,
  evalSetId,
  currentFeedback,
  onFeedbackSubmit,
}: FeedbackButtonsProps) {
  const [optimisticRating, setOptimisticRating] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const submitMutation = useMutation({
    mutationFn: (rating: 'positive' | 'negative' | 'neutral') => {
      if (!evalSetId) {
        throw new Error('Eval set ID is required')
      }
      return apiClient.submitFeedback({
        trace_id: traceId,
        eval_set_id: evalSetId,
        rating,
      })
    },
    onMutate: async (rating) => {
      setOptimisticRating(rating)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trace', traceId] })
      queryClient.invalidateQueries({ queryKey: ['traces'] })
      toast.success('Feedback submitted')
      onFeedbackSubmit?.()
    },
    onError: (error) => {
      setOptimisticRating(null)
      toast.error('Failed to submit feedback')
      console.error(error)
    },
    onSettled: () => {
      setOptimisticRating(null)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (rating: 'positive' | 'negative' | 'neutral') => {
      if (!currentFeedback?.id) {
        throw new Error('Feedback ID is required')
      }
      return apiClient.updateFeedback(currentFeedback.id, { rating })
    },
    onMutate: async (rating) => {
      setOptimisticRating(rating)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trace', traceId] })
      queryClient.invalidateQueries({ queryKey: ['traces'] })
      toast.success('Feedback updated')
      onFeedbackSubmit?.()
    },
    onError: (error) => {
      setOptimisticRating(null)
      toast.error('Failed to update feedback')
      console.error(error)
    },
    onSettled: () => {
      setOptimisticRating(null)
    },
  })

  const handleRating = (rating: 'positive' | 'negative' | 'neutral') => {
    if (currentFeedback) {
      updateMutation.mutate(rating)
    } else {
      submitMutation.mutate(rating)
    }
  }

  const activeRating = optimisticRating || currentFeedback?.rating
  const isLoading = submitMutation.isPending || updateMutation.isPending

  if (!evalSetId && !currentFeedback) {
    return (
      <div className="text-sm text-muted-foreground">
        Select an eval set to provide feedback
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleRating('positive')}
        disabled={isLoading}
        className={cn(
          activeRating === 'positive' && 'bg-green-100 border-green-300'
        )}
      >
        <ThumbsUp className="w-4 h-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleRating('neutral')}
        disabled={isLoading}
        className={cn(
          activeRating === 'neutral' && 'bg-gray-100 border-gray-300'
        )}
      >
        <Minus className="w-4 h-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleRating('negative')}
        disabled={isLoading}
        className={cn(
          activeRating === 'negative' && 'bg-red-100 border-red-300'
        )}
      >
        <ThumbsDown className="w-4 h-4" />
      </Button>
    </div>
  )
}
