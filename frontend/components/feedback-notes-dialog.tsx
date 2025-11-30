'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface FeedbackNotesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentNotes: string
  onSubmit: (notes: string) => void
}

export function FeedbackNotesDialog({
  open,
  onOpenChange,
  currentNotes,
  onSubmit,
}: FeedbackNotesDialogProps) {
  const [notes, setNotes] = useState(currentNotes)

  // Update local state when currentNotes changes
  useEffect(() => {
    setNotes(currentNotes)
  }, [currentNotes, open])

  const handleSubmit = () => {
    onSubmit(notes)
  }

  const handleCancel = () => {
    setNotes(currentNotes)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Feedback Notes</DialogTitle>
          <DialogDescription>
            Add detailed notes about this trace to help improve the agent.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you observe? What could be improved?"
            className="min-h-[120px] resize-y"
            autoFocus
          />
          <div className="text-xs text-muted-foreground mt-2">
            {notes.length} characters
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Save Notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
