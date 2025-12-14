'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@/hooks/use-router-with-progress'
import { apiClient } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'
import { LiveJobMonitor } from '@/components/jobs/live-job-monitor'
import type { JobResponse } from '@/types/api'

interface GenerateEvalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
}

export function GenerateEvalModal({ open, onOpenChange, agentId }: GenerateEvalModalProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState('claude-3-5-sonnet-20241022')
  const [customInstructions, setCustomInstructions] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<'running' | 'completed' | 'failed' | null>(null)
  const [generatedEvalId, setGeneratedEvalId] = useState<string | null>(null)

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error('Name is required')
      }

      const result: JobResponse = await apiClient.generateEval(agentId, {
        name: name.trim(),
        description: description.trim() || undefined,
        model: model || undefined,
        custom_instructions: customInstructions.trim() || undefined,
      })

      return result
    },
    onSuccess: (data) => {
      setJobId(data.job_id)
      setJobStatus('running')
    },
    onError: (error: any) => {
      console.error('Generate eval failed:', error)
    },
  })

  // Listen for job completion via polling (LiveJobMonitor handles SSE)
  useEffect(() => {
    if (!jobId || jobStatus !== 'running') return

    // Poll job status to detect completion and extract eval_id
    const pollInterval = setInterval(async () => {
      try {
        const job = await apiClient.getJob(jobId)

        if (job.status === 'completed') {
          setJobStatus('completed')

          // Extract eval_id from result
          if (job.result?.eval_id) {
            setGeneratedEvalId(job.result.eval_id)
          }

          // Refetch agent to show the new eval
          queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
          queryClient.invalidateQueries({ queryKey: ['evals'] })

          clearInterval(pollInterval)
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          setJobStatus('failed')
          clearInterval(pollInterval)
        }
      } catch (error) {
        console.error('Failed to poll job status:', error)
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [jobId, jobStatus, agentId, queryClient])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      return
    }
    generateMutation.mutate()
  }

  const handleClose = () => {
    if (jobStatus === 'running') {
      const confirmed = window.confirm(
        'Eval generation is still running. Closing this window will not cancel the generation. Continue?'
      )
      if (!confirmed) return
    }

    // Reset state when closing
    setName('')
    setDescription('')
    setModel('claude-3-5-sonnet-20241022')
    setCustomInstructions('')
    setJobId(null)
    setJobStatus(null)
    setGeneratedEvalId(null)
    generateMutation.reset()
    onOpenChange(false)
  }

  const handleViewEval = () => {
    if (generatedEvalId) {
      router.push(`/evals/${generatedEvalId}`)
      handleClose()
    }
  }

  const canSubmit = !generateMutation.isPending && jobStatus !== 'running' && !!name.trim()

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Generate Eval
          </DialogTitle>
          <DialogDescription>
            Generate an eval function from your labeled traces using AI
          </DialogDescription>
        </DialogHeader>

        {/* Show LiveJobMonitor if generation started */}
        {jobId && jobStatus === 'running' && (
          <div className="my-4">
            <LiveJobMonitor jobId={jobId} jobType="generate" />
          </div>
        )}

        {/* Show success message when completed */}
        {jobId && jobStatus === 'completed' && (
          <div className="my-4 p-4 rounded-lg border bg-success/10 border-success/30">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <span className="font-medium text-success">Eval Generated Successfully!</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Your eval has been created and is ready to use. You can view and manage it from the evals page.
            </p>
          </div>
        )}

        {/* Show error message when failed */}
        {jobId && jobStatus === 'failed' && (
          <div className="my-4 p-4 rounded-lg border bg-destructive/10 border-destructive/30">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="font-medium text-destructive">Generation Failed</span>
            </div>
            <p className="text-sm text-muted-foreground">
              The eval generation failed. Please check the logs above for details and try again.
            </p>
          </div>
        )}

        {/* Generation form - hide if job is running/completed */}
        {!jobId && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., check_compliance"
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                A descriptive name for your eval function
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this eval check?"
              />
              <p className="text-xs text-muted-foreground">
                Optional description of what this eval tests
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background"
              >
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Recommended)</option>
                <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </select>
              <p className="text-xs text-muted-foreground">
                LLM model to use for generating the eval function
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customInstructions">Custom Instructions (Optional)</Label>
              <textarea
                id="customInstructions"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Any specific instructions or constraints for the eval..."
                className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background"
              />
              <p className="text-xs text-muted-foreground">
                Additional context or requirements for the eval generation
              </p>
            </div>

            {generateMutation.isError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">Generation failed</p>
                  <p className="text-xs mt-1">
                    {generateMutation.error instanceof Error
                      ? generateMutation.error.message
                      : 'An error occurred during eval generation'}
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit} loading={generateMutation.isPending}>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                {generateMutation.isPending ? 'Generating...' : 'Generate Eval'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Action buttons when job is done */}
        {jobId && (jobStatus === 'completed' || jobStatus === 'failed') && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
            {jobStatus === 'completed' && generatedEvalId && (
              <Button onClick={handleViewEval}>
                View Eval
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
