'use client'

import { useState } from 'react'
import { useRouter } from '@/hooks/use-router-with-progress'
import { useMutation } from '@tanstack/react-query'
import { apiClient, APIError } from '@/lib/api-client'
import type { GenerateEvalRequest } from '@/types/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface GenerateEvalModalProps {
  children: React.ReactNode
  agentId: string
}

export function GenerateEvalModal({ children, agentId }: GenerateEvalModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<GenerateEvalRequest>({
    name: '',
    description: '',
    model: 'anthropic/claude-sonnet-4-5',
    custom_instructions: '',
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: GenerateEvalRequest) => apiClient.generateEval(agentId, data),
    onSuccess: (response) => {
      // Close modal and redirect to job details page
      setOpen(false)
      router.push(`/resources/${response.job_id}`)
    },
    onError: (err: APIError) => {
      setError(err.message || 'Failed to start eval generation')
    },
  })

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      model: 'anthropic/claude-sonnet-4-5',
      custom_instructions: '',
    })
    setError(null)
  }

  const handleClose = () => {
    setOpen(false)
    // Reset after modal closes
    setTimeout(resetForm, 300)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Basic validation
    if (!formData.name.trim()) {
      setError('Eval name is required')
      return
    }

    mutation.mutate(formData)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Generate Eval Function</DialogTitle>
            <DialogDescription>
              Create an automated eval function from your labeled traces using AI
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 px-6">
            {error && (
              <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">
                Eval Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., check_response_accuracy"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={mutation.isPending}
                required
              />
              <p className="text-xs text-muted-foreground">
                Choose a descriptive name for your eval function
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="What does this eval check for?"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={mutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Model (optional)</Label>
              <Select
                value={formData.model}
                onValueChange={(value) => setFormData({ ...formData, model: value })}
                disabled={mutation.isPending}
              >
                <SelectTrigger id="model">
                  <SelectValue placeholder="Select model..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic/claude-sonnet-4-5">Claude Sonnet 4.5</SelectItem>
                  <SelectItem value="anthropic/claude-opus-4-5">Claude Opus 4.5</SelectItem>
                  <SelectItem value="google-vertex-ai/google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Model to use for generating the eval function
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">Custom Instructions (optional)</Label>
              <textarea
                id="instructions"
                className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background"
                placeholder="Additional guidance for the eval generation..."
                value={formData.custom_instructions}
                onChange={(e) => setFormData({ ...formData, custom_instructions: e.target.value })}
                disabled={mutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Provide specific criteria or patterns to focus on
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Starting...' : 'Generate Eval'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
