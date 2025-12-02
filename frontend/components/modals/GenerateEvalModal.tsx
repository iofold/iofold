'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, APIError } from '@/lib/api-client'
import { useJobMonitor } from '@/hooks/use-job-monitor'
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
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

interface GenerateEvalModalProps {
  children: React.ReactNode
  agentId: string
}

export function GenerateEvalModal({ children, agentId }: GenerateEvalModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [formData, setFormData] = useState<GenerateEvalRequest>({
    name: '',
    description: '',
    model: 'claude-3-5-sonnet-20241022',
    custom_instructions: '',
  })
  const [error, setError] = useState<string | null>(null)

  const queryClient = useQueryClient()

  // Use job monitor hook for SSE + polling fallback
  const { job: jobStatus, isStreaming, isPolling, isSSEActive, stop: stopMonitoring } = useJobMonitor(jobId, {
    autoStart: true,
    onProgress: (update) => {
      console.log('[GenerateEvalModal] Job progress:', update)
    },
    onCompleted: (result) => {
      console.log('[GenerateEvalModal] Generation completed:', result)
      // Invalidate queries to refresh eval list
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
      queryClient.invalidateQueries({ queryKey: ['evals'] })
    },
    onFailed: (errorMsg, details) => {
      console.error('[GenerateEvalModal] Generation failed:', errorMsg, details)
    },
    onOpen: () => {
      console.log('[GenerateEvalModal] SSE connection established')
    },
  })

  // Clean up monitoring when modal closes
  useEffect(() => {
    if (!open) {
      stopMonitoring()
    }
  }, [open, stopMonitoring])

  const mutation = useMutation({
    mutationFn: (data: GenerateEvalRequest) => apiClient.generateEval(agentId, data),
    onSuccess: (response) => {
      // Set job ID to trigger monitoring
      setJobId(response.job_id)
      setError(null)
    },
    onError: (err: APIError) => {
      setError(err.message || 'Failed to start eval generation')
    },
  })

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      model: 'claude-3-5-sonnet-20241022',
      custom_instructions: '',
    })
    setError(null)
    setJobId(null)
  }

  const handleClose = () => {
    // Stop monitoring
    stopMonitoring()
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

  // Determine current status
  const isGenerating = !!jobId && jobStatus?.status === 'running'
  const isCompleted = jobStatus?.status === 'completed'
  const isFailed = jobStatus?.status === 'failed'
  const isQueued = jobStatus?.status === 'queued'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {!jobId ? (
          // Form to submit generation request
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
                    <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                    <SelectItem value="gpt-4">GPT-4</SelectItem>
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
                {mutation.isPending ? 'Generating...' : 'Generate Eval'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          // Show generation status
          <div>
            <DialogHeader>
              <DialogTitle>Eval Generation</DialogTitle>
              <DialogDescription>
                {isCompleted && 'Generation completed successfully!'}
                {isFailed && 'Generation failed'}
                {isGenerating && 'Generating your eval function...'}
                {isQueued && 'Generation queued...'}
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 px-6">
              {/* Status indicator */}
              <div className="flex items-center gap-3 mb-6">
                {isGenerating || isQueued ? (
                  <Loader2 className="w-6 h-6 animate-spin text-info" aria-hidden="true" />
                ) : isCompleted ? (
                  <CheckCircle2 className="w-6 h-6 text-success" aria-hidden="true" />
                ) : isFailed ? (
                  <XCircle className="w-6 h-6 text-destructive" aria-hidden="true" />
                ) : null}

                <div className="flex-1">
                  <div className="font-medium">
                    {isQueued && 'Queued for processing...'}
                    {isGenerating && 'Generating eval function...'}
                    {isCompleted && 'Generation Complete'}
                    {isFailed && 'Generation Failed'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Job ID: {jobId}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {(isGenerating || isQueued) && (
                <div className="mb-6">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-info transition-all duration-500"
                      style={{ width: `${jobStatus?.progress || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-xs text-muted-foreground">
                      Progress: {jobStatus?.progress || 0}%
                    </p>
                    {isStreaming && (
                      <p className="text-xs">
                        {isSSEActive && <span className="text-success">Real-time (SSE)</span>}
                        {isPolling && <span className="text-warning">Polling fallback</span>}
                        {!isSSEActive && !isPolling && <span className="text-muted-foreground">Connecting...</span>}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Error message */}
              {isFailed && jobStatus?.error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-md mb-6">
                  <p className="font-medium mb-1">Error</p>
                  <p className="text-sm">{jobStatus.error}</p>
                </div>
              )}

              {/* Success info */}
              {isCompleted && jobStatus?.result && (
                <div className="space-y-4">
                  <div className="bg-success/10 border border-success/30 text-success px-4 py-3 rounded-md">
                    <p className="font-medium mb-1">Eval Generated Successfully</p>
                    <p className="text-sm">
                      Your eval function has been created and tested.
                    </p>
                  </div>

                  {jobStatus.result.eval_id && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Results:</p>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>Eval ID: {jobStatus.result.eval_id}</li>
                        {jobStatus.result.accuracy !== undefined && (
                          <li>Accuracy: {Math.round(jobStatus.result.accuracy * 100)}%</li>
                        )}
                        {jobStatus.result.test_results && (
                          <li>
                            Tests: {jobStatus.result.test_results.correct}/{jobStatus.result.test_results.total} passed
                          </li>
                        )}
                      </ul>
                      <Button
                        onClick={() => {
                          handleClose()
                          router.push(`/evals/${jobStatus.result.eval_id}`)
                        }}
                        className="w-full mt-4"
                      >
                        View Eval Details
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>
                {isCompleted ? 'Done' : 'Close'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
