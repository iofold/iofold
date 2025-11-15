'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { Select } from '@/components/ui/select'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

interface GenerateEvalModalProps {
  children: React.ReactNode
  evalSetId: string
}

export function GenerateEvalModal({ children, evalSetId }: GenerateEvalModalProps) {
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

  // Poll for job status
  const { data: jobStatus } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => apiClient.getJob(jobId!),
    enabled: !!jobId && open,
    refetchInterval: (query) => {
      // Stop polling when job is complete or failed
      const data = query.state.data
      if (data?.status === 'completed' || data?.status === 'failed' || data?.status === 'cancelled') {
        return false
      }
      return 2000 // Poll every 2 seconds
    },
  })

  const mutation = useMutation({
    mutationFn: (data: GenerateEvalRequest) => apiClient.generateEval(evalSetId, data),
    onSuccess: (response) => {
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
    // If job completed successfully, invalidate queries
    if (jobStatus?.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['eval-set', evalSetId] })
      queryClient.invalidateQueries({ queryKey: ['evals'] })
    }
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
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">
                  Eval Name <span className="text-red-500">*</span>
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
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  disabled={mutation.isPending}
                >
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                  <option value="gpt-4">GPT-4</option>
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
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" aria-hidden="true" />
                ) : isCompleted ? (
                  <CheckCircle2 className="w-6 h-6 text-green-600" aria-hidden="true" />
                ) : isFailed ? (
                  <XCircle className="w-6 h-6 text-red-600" aria-hidden="true" />
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
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${jobStatus?.progress || 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Progress: {jobStatus?.progress || 0}%
                  </p>
                </div>
              )}

              {/* Error message */}
              {isFailed && jobStatus?.error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
                  <p className="font-medium mb-1">Error</p>
                  <p className="text-sm">{jobStatus.error}</p>
                </div>
              )}

              {/* Success info */}
              {isCompleted && jobStatus?.result && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md">
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
                        onClick={() => window.location.href = `/evals/${jobStatus.result.eval_id}`}
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
