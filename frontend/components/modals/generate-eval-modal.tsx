'use client'

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@/hooks/use-router-with-progress'
import { apiClient } from '@/lib/api-client'
import { SSEClient } from '@/lib/sse-client'
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
import { Progress } from '@/components/ui/progress'
import { getStatusColor } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import type { JobResponse, Job } from '@/types/api'

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
  const [jobData, setJobData] = useState<Job | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [generatedEvalId, setGeneratedEvalId] = useState<string | null>(null)
  const sseClientRef = useRef<SSEClient | null>(null)

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
      setIsStreaming(true)

      // Set initial job state
      setJobData({
        id: data.job_id,
        type: 'generate',
        status: 'queued',
        progress: 0,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
      })

      // Connect to SSE stream
      connectToJobStream(data.job_id)
    },
    onError: (error: any) => {
      console.error('Generate eval failed:', error)
    },
  })

  // Connect to SSE stream for job updates
  const connectToJobStream = (jobId: string) => {
    try {
      const eventSource = apiClient.streamJob(jobId)

      const client = new SSEClient(eventSource, {
        jobId,
        apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/v1',
        onProgress: (update) => {
          setJobData((prev) => prev ? { ...prev, ...update } : null)
        },
        onCompleted: (result) => {
          setJobData((prev) => prev ? { ...prev, status: 'completed', result } : null)
          setIsStreaming(false)

          // Extract eval_id from result
          if (result?.eval_id) {
            setGeneratedEvalId(result.eval_id)
          }

          // Refetch agent to show the new eval
          queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
          queryClient.invalidateQueries({ queryKey: ['evals'] })
        },
        onFailed: (error, details) => {
          setJobData((prev) => prev ? { ...prev, status: 'failed', error } : null)
          setIsStreaming(false)
        },
        onError: (error) => {
          console.error('SSE connection error:', error)
          // Don't set isStreaming to false here - let the polling fallback handle it
        },
        onOpen: () => {
          console.log('SSE connection established for job:', jobId)
        }
      })

      sseClientRef.current = client
    } catch (error) {
      console.error('Failed to connect to SSE stream:', error)
      setIsStreaming(false)
    }
  }

  // Clean up SSE connection when component unmounts or modal closes
  useEffect(() => {
    return () => {
      if (sseClientRef.current) {
        sseClientRef.current.close()
        sseClientRef.current = null
      }
    }
  }, [])

  // Close SSE connection when modal closes
  useEffect(() => {
    if (!open && sseClientRef.current) {
      sseClientRef.current.close()
      sseClientRef.current = null
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      return
    }
    generateMutation.mutate()
  }

  const handleClose = () => {
    // Close SSE connection if open
    if (sseClientRef.current) {
      sseClientRef.current.close()
      sseClientRef.current = null
    }

    // Reset state when closing
    if (!generateMutation.isPending && !isStreaming) {
      setName('')
      setDescription('')
      setModel('claude-3-5-sonnet-20241022')
      setCustomInstructions('')
      setJobId(null)
      setJobData(null)
      setIsStreaming(false)
      setGeneratedEvalId(null)
      generateMutation.reset()
      onOpenChange(false)
    }
  }

  const handleViewEval = () => {
    if (generatedEvalId) {
      router.push(`/evals/${generatedEvalId}`)
      handleClose()
    }
  }

  const canSubmit = !generateMutation.isPending && !isStreaming && !!name.trim()
  const isProcessing = generateMutation.isPending || isStreaming

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

        {/* Show job status if generation started */}
        {jobId && (
          <div className="my-4 p-4 rounded-lg border bg-muted/50">
            <div className="flex items-center gap-2 mb-2">
              {jobData?.status === 'completed' && (
                <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
              )}
              {jobData?.status === 'failed' && (
                <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
              )}
              {(jobData?.status === 'running' || jobData?.status === 'queued') && (
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              )}
              <span className="font-medium">Generation Status</span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Job ID:</span>
                  <span className="font-mono text-xs">{jobId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={getStatusColor(jobData?.status || 'queued')}>
                    {jobData?.status || 'queued'}
                  </span>
                </div>
              </div>

              {jobData?.progress !== undefined && jobData.status !== 'completed' && (
                <Progress
                  value={jobData.progress}
                  showLabel={true}
                  label="Generation Progress"
                />
              )}

              {jobData?.error && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-destructive text-sm">
                  <p className="font-medium mb-1">Generation Failed</p>
                  <p>{jobData.error}</p>
                </div>
              )}

              {jobData?.status === 'completed' && jobData?.result && (
                <div className="p-3 bg-success/10 border border-success/30 rounded text-success text-sm">
                  <p className="font-medium mb-1">Eval Generated Successfully!</p>
                  <div className="space-y-1">
                    {jobData.result.eval_name && (
                      <div className="flex justify-between">
                        <span>Name:</span>
                        <span className="font-medium">{jobData.result.eval_name}</span>
                      </div>
                    )}
                    {jobData.result.accuracy !== undefined && (
                      <div className="flex justify-between">
                        <span>Accuracy:</span>
                        <span className="font-medium">{Math.round(jobData.result.accuracy * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
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
                disabled={isProcessing}
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
        {jobId && ['completed', 'failed', 'cancelled'].includes(jobData?.status || '') && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
            {jobData?.status === 'completed' && generatedEvalId && (
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
