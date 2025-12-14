'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Plus, FileText } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

interface CreateTasksetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
}

export function CreateTasksetModal({
  open,
  onOpenChange,
  agentId,
}: CreateTasksetModalProps) {
  const [activeTab, setActiveTab] = useState<'empty' | 'from-traces'>('empty')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rating, setRating] = useState<'any' | 'positive' | 'negative'>('any')
  const [limit, setLimit] = useState('100')

  const queryClient = useQueryClient()

  // Reset form when modal closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName('')
      setDescription('')
      setRating('any')
      setLimit('100')
      setActiveTab('empty')
    }
    onOpenChange(open)
  }

  // Create empty taskset mutation
  const createEmptyMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      apiClient.createTaskset(agentId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agent-tasksets', agentId] })
      toast.success(`Taskset "${data.name}" created successfully`)
      handleOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create taskset')
    },
  })

  // Create taskset from traces mutation
  const createFromTracesMutation = useMutation({
    mutationFn: (data: {
      name: string
      description?: string
      filter?: {
        rating?: 'positive' | 'negative' | 'any'
        limit?: number
      }
    }) => apiClient.createTasksetFromTraces(agentId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agent-tasksets', agentId] })
      toast.success(data.message)
      handleOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create taskset from traces')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Name is required')
      return
    }

    if (activeTab === 'empty') {
      createEmptyMutation.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
      })
    } else {
      const limitNum = parseInt(limit, 10)
      if (isNaN(limitNum) || limitNum < 1) {
        toast.error('Limit must be a positive number')
        return
      }

      createFromTracesMutation.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
        filter: {
          rating: rating === 'any' ? undefined : rating,
          limit: limitNum,
        },
      })
    }
  }

  const isLoading = createEmptyMutation.isPending || createFromTracesMutation.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Taskset</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="empty" value={activeTab} onValueChange={(v) => setActiveTab(v as 'empty' | 'from-traces')} className="px-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="empty" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Empty Taskset
            </TabsTrigger>
            <TabsTrigger value="from-traces" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              From Traces
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit}>
            <TabsContent value="empty" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="empty-name">Name</Label>
                <Input
                  id="empty-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Customer Support Tasks"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="empty-description">Description (optional)</Label>
                <Textarea
                  id="empty-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this taskset..."
                  rows={3}
                />
              </div>

              <p className="text-sm text-muted-foreground">
                Create an empty taskset. You can add tasks manually later.
              </p>
            </TabsContent>

            <TabsContent value="from-traces" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="traces-name">Name</Label>
                <Input
                  id="traces-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Positive Examples"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="traces-description">Description (optional)</Label>
                <Textarea
                  id="traces-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this taskset..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rating-filter">Rating Filter</Label>
                  <Select value={rating} onValueChange={(v) => setRating(v as typeof rating)}>
                    <SelectTrigger id="rating-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any Rating</SelectItem>
                      <SelectItem value="positive">Positive Only</SelectItem>
                      <SelectItem value="negative">Negative Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="limit">Limit</Label>
                  <Input
                    id="limit"
                    type="number"
                    min="1"
                    max="500"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Extract tasks from labeled traces. Duplicate tasks will be automatically skipped.
              </p>
            </TabsContent>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    {activeTab === 'empty' ? 'Create Taskset' : 'Create from Traces'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
