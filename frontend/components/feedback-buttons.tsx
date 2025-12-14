'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Feedback } from '@/types/api'
import { ThumbsUp, ThumbsDown, Minus, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FeedbackNotesDialog } from '@/components/feedback-notes-dialog'

interface FeedbackButtonsProps {
  traceId: string
  currentFeedback?: Feedback
  onFeedbackSubmit?: () => void
  showNotesButton?: boolean
  size?: 'sm' | 'default' | 'lg'
  showLabels?: boolean
}

export function FeedbackButtons({
  traceId,
  currentFeedback,
  onFeedbackSubmit,
  showNotesButton = true,
  size = 'sm',
  showLabels = false,
}: FeedbackButtonsProps) {
  const [optimisticRating, setOptimisticRating] = useState<string | null>(null)
  const [notesDialogOpen, setNotesDialogOpen] = useState(false)
  const [pendingRating, setPendingRating] = useState<'positive' | 'negative' | 'neutral' | null>(null)
  const queryClient = useQueryClient()

  const submitMutation = useMutation({
    mutationFn: (data: { rating: 'positive' | 'negative' | 'neutral'; notes?: string }) => {
      return apiClient.submitFeedback({
        trace_id: traceId,
        rating: data.rating,
        notes: data.notes,
      })
    },
    onMutate: async (data) => {
      setOptimisticRating(data.rating)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trace', traceId] })
      queryClient.invalidateQueries({ queryKey: ['traces'] })
      queryClient.invalidateQueries({ queryKey: ['feedback'] })
      toast.success('Feedback submitted successfully')
      onFeedbackSubmit?.()
      setPendingRating(null)
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
    mutationFn: (data: { rating: 'positive' | 'negative' | 'neutral'; notes?: string }) => {
      if (!currentFeedback?.id) {
        throw new Error('Feedback ID is required')
      }
      return apiClient.updateFeedback(currentFeedback.id, {
        rating: data.rating,
        notes: data.notes,
      })
    },
    onMutate: async (data) => {
      setOptimisticRating(data.rating)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trace', traceId] })
      queryClient.invalidateQueries({ queryKey: ['traces'] })
      queryClient.invalidateQueries({ queryKey: ['feedback'] })
      toast.success('Feedback updated successfully')
      onFeedbackSubmit?.()
      setPendingRating(null)
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
    // If same rating is clicked again, open notes dialog
    if (currentFeedback?.rating === rating) {
      setPendingRating(rating)
      setNotesDialogOpen(true)
      return
    }

    // Otherwise submit/update immediately
    if (currentFeedback) {
      updateMutation.mutate({ rating })
    } else {
      submitMutation.mutate({ rating })
    }
  }

  const handleNotesSubmit = (notes: string) => {
    const rating = pendingRating || currentFeedback?.rating || 'neutral'

    if (currentFeedback) {
      updateMutation.mutate({ rating, notes })
    } else {
      submitMutation.mutate({ rating, notes })
    }

    setNotesDialogOpen(false)
  }

  const activeRating = optimisticRating || currentFeedback?.rating
  const isLoading = submitMutation.isPending || updateMutation.isPending

  // Feedback can be submitted without an agent - agent_id is optional

  return (
    <>
      <div className="flex gap-2 items-center">
        <Button
          variant="outline"
          size={size}
          onClick={() => handleRating('positive')}
          disabled={isLoading}
          loading={isLoading && optimisticRating === 'positive'}
          className={cn(
            'transition-all duration-200',
            activeRating === 'positive' && 'bg-success/10 border-success text-success hover:bg-success/20'
          )}
          data-testid="feedback-positive"
        >
          <ThumbsUp className={cn('w-4 h-4', activeRating === 'positive' && 'fill-current')} />
          {showLabels && <span className="ml-2">Good</span>}
        </Button>
        <Button
          variant="outline"
          size={size}
          onClick={() => handleRating('neutral')}
          disabled={isLoading}
          loading={isLoading && optimisticRating === 'neutral'}
          className={cn(
            'transition-all duration-200',
            activeRating === 'neutral' && 'bg-muted border-muted-foreground text-muted-foreground hover:bg-muted/80'
          )}
          data-testid="feedback-neutral"
        >
          <Minus className="w-4 h-4" />
          {showLabels && <span className="ml-2">Neutral</span>}
        </Button>
        <Button
          variant="outline"
          size={size}
          onClick={() => handleRating('negative')}
          disabled={isLoading}
          loading={isLoading && optimisticRating === 'negative'}
          className={cn(
            'transition-all duration-200',
            activeRating === 'negative' && 'bg-destructive/10 border-destructive text-destructive hover:bg-destructive/20'
          )}
          data-testid="feedback-negative"
        >
          <ThumbsDown className={cn('w-4 h-4', activeRating === 'negative' && 'fill-current')} />
          {showLabels && <span className="ml-2">Bad</span>}
        </Button>

        {showNotesButton && (
          <Button
            variant="ghost"
            size={size}
            onClick={() => {
              setPendingRating(activeRating as any || null)
              setNotesDialogOpen(true)
            }}
            disabled={isLoading}
            className={cn(
              'transition-all duration-200',
              currentFeedback?.notes && 'text-info'
            )}
            data-testid="feedback-notes"
          >
            <MessageSquare className={cn('w-4 h-4', currentFeedback?.notes && 'fill-current')} />
            {showLabels && <span className="ml-2">Notes</span>}
          </Button>
        )}
      </div>

      <FeedbackNotesDialog
        open={notesDialogOpen}
        onOpenChange={setNotesDialogOpen}
        currentNotes={currentFeedback?.notes || ''}
        onSubmit={handleNotesSubmit}
      />
    </>
  )
}
