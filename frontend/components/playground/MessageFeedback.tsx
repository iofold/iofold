'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ThumbsUp, ThumbsDown, Minus, MessageSquare, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FeedbackRating = 'positive' | 'negative' | 'neutral'

interface MessageFeedbackProps {
  messageId: string
  currentRating?: FeedbackRating
  disabled?: boolean
  onSubmit: (messageId: string, rating: FeedbackRating, notes?: string) => Promise<void>
}

export function MessageFeedback({
  messageId,
  currentRating,
  disabled,
  onSubmit,
}: MessageFeedbackProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedRating, setSelectedRating] = useState<FeedbackRating | undefined>(currentRating)

  const handleRatingClick = async (rating: FeedbackRating) => {
    if (disabled || isSubmitting) return

    // If same rating is clicked, just toggle selection
    if (selectedRating === rating && !isExpanded) {
      setIsExpanded(true)
      return
    }

    // If no notes input, submit immediately
    if (!isExpanded) {
      setSelectedRating(rating)
      setIsSubmitting(true)
      try {
        await onSubmit(messageId, rating)
      } finally {
        setIsSubmitting(false)
      }
    } else {
      setSelectedRating(rating)
    }
  }

  const handleSubmitWithNotes = async () => {
    if (!selectedRating || isSubmitting) return

    setIsSubmitting(true)
    try {
      await onSubmit(messageId, selectedRating, notes.trim() || undefined)
      setIsExpanded(false)
      setNotes('')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setIsExpanded(false)
    setNotes('')
    if (!currentRating) {
      setSelectedRating(undefined)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 w-7 p-0 hover:bg-green-100 hover:text-green-600',
            selectedRating === 'positive' && 'bg-green-100 text-green-600'
          )}
          onClick={() => handleRatingClick('positive')}
          disabled={disabled || isSubmitting}
          title="Good response"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 w-7 p-0 hover:bg-gray-100 hover:text-gray-600',
            selectedRating === 'neutral' && 'bg-gray-200 text-gray-600'
          )}
          onClick={() => handleRatingClick('neutral')}
          disabled={disabled || isSubmitting}
          title="Neutral"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 w-7 p-0 hover:bg-red-100 hover:text-red-600',
            selectedRating === 'negative' && 'bg-red-100 text-red-600'
          )}
          onClick={() => handleRatingClick('negative')}
          disabled={disabled || isSubmitting}
          title="Bad response"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </Button>

        {!isExpanded && selectedRating && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 ml-1"
            onClick={() => setIsExpanded(true)}
            disabled={disabled || isSubmitting}
            title="Add notes"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </Button>
        )}

        {isSubmitting && (
          <Loader2 className="h-3.5 w-3.5 animate-spin ml-1 text-muted-foreground" />
        )}
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-2 p-2 bg-background/80 border rounded-lg">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add optional feedback notes..."
            className="w-full text-xs p-2 border rounded resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={2}
            disabled={isSubmitting}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSubmitWithNotes}
              disabled={!selectedRating || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
