'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface CreateEvalSetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateEvalSetModal({ open, onOpenChange }: CreateEvalSetModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const queryClient = useQueryClient()
  const router = useRouter()

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      apiClient.createEvalSet(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['eval-sets'] })
      toast.success('Eval set created')
      onOpenChange(false)
      router.push(`/eval-sets/${data.id}`)
    },
    onError: () => {
      toast.error('Failed to create eval set')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ name, description: description || undefined })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Eval Set</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Eval Set"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this eval set is for..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
