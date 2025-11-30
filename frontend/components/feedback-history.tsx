'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Feedback } from '@/types/api'
import { ThumbsUp, ThumbsDown, Minus, Trash2, Edit, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import { FeedbackNotesDialog } from '@/components/feedback-notes-dialog'

interface FeedbackHistoryProps {
  traceId: string
  currentUserId?: string // For showing edit/delete on own feedback
}

export function FeedbackHistory({ traceId, currentUserId }: FeedbackHistoryProps) {
  const [editingFeedback, setEditingFeedback] = useState<Feedback | null>(null)
  const [notesDialogOpen, setNotesDialogOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: feedbackList, isLoading } = useQuery({
    queryKey: ['feedback', traceId],
    queryFn: () => apiClient.listFeedback({ trace_id: traceId }),
  })

  const deleteMutation = useMutation({
    mutationFn: (feedbackId: string) => apiClient.deleteFeedback(feedbackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback', traceId] })
      queryClient.invalidateQueries({ queryKey: ['trace', traceId] })
      toast.success('Feedback deleted')
    },
    onError: () => {
      toast.error('Failed to delete feedback')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; notes: string }) =>
      apiClient.updateFeedback(data.id, { notes: data.notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback', traceId] })
      queryClient.invalidateQueries({ queryKey: ['trace', traceId] })
      toast.success('Notes updated')
      setEditingFeedback(null)
      setNotesDialogOpen(false)
    },
    onError: () => {
      toast.error('Failed to update notes')
    },
  })

  const handleDelete = (feedbackId: string) => {
    if (confirm('Are you sure you want to delete this feedback?')) {
      deleteMutation.mutate(feedbackId)
    }
  }

  const handleEditNotes = (feedback: Feedback) => {
    setEditingFeedback(feedback)
    setNotesDialogOpen(true)
  }

  const handleNotesSubmit = (notes: string) => {
    if (editingFeedback) {
      updateMutation.mutate({ id: editingFeedback.id, notes })
    }
  }

  const getRatingIcon = (rating: string) => {
    switch (rating) {
      case 'positive':
        return <ThumbsUp className="w-4 h-4 text-green-600 fill-current" />
      case 'negative':
        return <ThumbsDown className="w-4 h-4 text-red-600 fill-current" />
      case 'neutral':
        return <Minus className="w-4 h-4 text-gray-600" />
      default:
        return null
    }
  }

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'positive':
        return 'border-l-green-500 bg-green-50'
      case 'negative':
        return 'border-l-red-500 bg-red-50'
      case 'neutral':
        return 'border-l-gray-500 bg-gray-50'
      default:
        return 'border-l-gray-300'
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Feedback History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-20 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const feedbacks = feedbackList?.feedback || []

  if (feedbacks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Feedback History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No feedback yet for this trace
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Feedback History ({feedbacks.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {feedbacks.map((feedback) => {
              const isOwnFeedback = currentUserId && feedback.user_id === currentUserId

              return (
                <div
                  key={feedback.id}
                  className={cn(
                    'border-l-4 p-4 rounded-r transition-all duration-200',
                    getRatingColor(feedback.rating)
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {getRatingIcon(feedback.rating)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium capitalize">
                            {feedback.rating}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(feedback.created_at)}
                          </span>
                        </div>
                        {feedback.agent_name && (
                          <div className="text-xs text-muted-foreground mb-2">
                            Agent: {feedback.agent_name}
                          </div>
                        )}
                        {feedback.notes && (
                          <div className="text-sm mt-2 p-2 bg-white rounded border">
                            {feedback.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    {isOwnFeedback && (
                      <div className="flex gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditNotes(feedback)}
                          disabled={updateMutation.isPending}
                          title="Edit notes"
                        >
                          <MessageSquare className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(feedback.id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Delete feedback"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {editingFeedback && (
        <FeedbackNotesDialog
          open={notesDialogOpen}
          onOpenChange={setNotesDialogOpen}
          currentNotes={editingFeedback.notes || ''}
          onSubmit={handleNotesSubmit}
        />
      )}
    </>
  )
}
