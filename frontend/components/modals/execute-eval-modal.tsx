'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, APIError } from '@/lib/api-client'
import { SSEClient } from '@/lib/sse-client'
import type { ExecuteEvalRequest, Job } from '@/types/api'
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
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

interface ExecuteEvalModalProps {
  children: React.ReactNode
  evalId: string
  evalSetId: string
}

export function ExecuteEvalModal({ children, evalId, evalSetId }: ExecuteEvalModalProps) {
  const [open, setOpen] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobData, setJobData] = useState<Job | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [selectedTraces, setSelectedTraces] = useState<string[]>([])
  const [useAllTraces, setUseAllTraces] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const sseClientRef = useRef<SSEClient | null>(null)

  const queryClient = useQueryClient()

  // Fetch traces for selection (only when modal is open and not using all traces)
  const { data: tracesData, isLoading: loadingTraces } = useQuery({
    queryKey: ['traces', evalSetId],
    queryFn: () => apiClient.listTraces({ eval_set_id: evalSetId, limit: 100 }),
    enabled: open && !useAllTraces,
  })

  // Execute mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      const payload: ExecuteEvalRequest = {
        trace_ids: useAllTraces ? undefined : selectedTraces,
        force: false,
      }

      return apiClient.executeEval(evalId, payload)
    },
    onSuccess: (data) => {
      setJobId(data.job_id)
      setIsStreaming(true)
      setError(null)

      // Set initial job state
      setJobData({
        id: data.job_id,
        type: 'execute',
        status: 'queued',
        progress: 0,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
      })

      // Connect to SSE stream
      connectToJobStream(data.job_id)
    },
    onError: (err: APIError) => {
      setError(err.message || 'Failed to start eval execution')
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
          setJobData((prev) => (prev ? { ...prev, ...update } : null))
        },
        onCompleted: (result) => {
          setJobData((prev) => (prev ? { ...prev, status: 'completed', result } : null))
          setIsStreaming(false)

          // Refetch eval details to update execution count and contradictions
          queryClient.invalidateQueries({ queryKey: ['eval', evalId] })
        },
        onFailed: (error, details) => {
          setJobData((prev) => (prev ? { ...prev, status: 'failed', error } : null))
          setIsStreaming(false)
        },
        onError: (error) => {
          console.error('SSE connection error:', error)
        },
        onOpen: () => {
          console.log('SSE connection established for job:', jobId)
        },
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

  useEffect(() => {
    if (!open && sseClientRef.current) {
      sseClientRef.current.close()
      sseClientRef.current = null
    }
  }, [open])

  const resetForm = () => {
    setSelectedTraces([])
    setUseAllTraces(true)
    setError(null)
    setJobId(null)
    setJobData(null)
    setIsStreaming(false)
  }

  const handleClose = () => {
    // Close SSE connection if open
    if (sseClientRef.current) {
      sseClientRef.current.close()
      sseClientRef.current = null
    }

    // If job completed successfully, invalidate queries
    if (jobData?.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['eval', evalId] })
      queryClient.invalidateQueries({ queryKey: ['eval-executions', evalId] })
    }

    setOpen(false)
    // Reset after modal closes
    setTimeout(resetForm, 300)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!useAllTraces && selectedTraces.length === 0) {
      setError('Please select at least one trace to execute')
      return
    }

    executeMutation.mutate()
  }

  const handleTraceToggle = (traceId: string) => {
    setSelectedTraces((prev) =>
      prev.includes(traceId)
        ? prev.filter((id) => id !== traceId)
        : [...prev, traceId]
    )
  }

  // Determine current status
  const isExecuting = !!jobId && jobData?.status === 'running'
  const isCompleted = jobData?.status === 'completed'
  const isFailed = jobData?.status === 'failed'
  const isQueued = jobData?.status === 'queued'
  const isProcessing = executeMutation.isPending || isStreaming

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {!jobId ? (
          // Form to submit execution request
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Execute Eval Function</DialogTitle>
              <DialogDescription>
                Run this eval on traces to generate predictions and check for contradictions
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 px-6">
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <Label>Trace Selection</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={useAllTraces}
                      onChange={() => setUseAllTraces(true)}
                      disabled={isProcessing}
                    />
                    <span className="text-sm">
                      Execute on all traces in eval set
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!useAllTraces}
                      onChange={() => setUseAllTraces(false)}
                      disabled={isProcessing}
                    />
                    <span className="text-sm">
                      Select specific traces
                    </span>
                  </label>
                </div>
              </div>

              {!useAllTraces && (
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-3">
                  {loadingTraces ? (
                    <div className="text-sm text-muted-foreground">Loading traces...</div>
                  ) : tracesData?.traces.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No traces found in this eval set
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tracesData?.traces.map((trace) => (
                        <label
                          key={trace.id}
                          className="flex items-center gap-2 cursor-pointer p-2 hover:bg-accent rounded"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTraces.includes(trace.id)}
                            onChange={() => handleTraceToggle(trace.id)}
                            disabled={isProcessing}
                          />
                          <div className="flex-1 text-sm">
                            <div className="font-medium truncate">
                              {trace.trace_id}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {trace.summary.input_preview}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isProcessing}>
                {executeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                    Starting...
                  </>
                ) : (
                  'Execute Eval'
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          // Show execution status
          <div>
            <DialogHeader>
              <DialogTitle>Eval Execution</DialogTitle>
              <DialogDescription>
                {isCompleted && 'Execution completed successfully!'}
                {isFailed && 'Execution failed'}
                {isExecuting && 'Executing eval function on traces...'}
                {isQueued && 'Execution queued...'}
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 px-6">
              {/* Status indicator */}
              <div className="flex items-center gap-3 mb-6">
                {isExecuting || isQueued ? (
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" aria-hidden="true" />
                ) : isCompleted ? (
                  <CheckCircle2 className="w-6 h-6 text-green-600" aria-hidden="true" />
                ) : isFailed ? (
                  <XCircle className="w-6 h-6 text-red-600" aria-hidden="true" />
                ) : null}

                <div className="flex-1">
                  <div className="font-medium">
                    {isQueued && 'Queued for processing...'}
                    {isExecuting && 'Executing eval function...'}
                    {isCompleted && 'Execution Complete'}
                    {isFailed && 'Execution Failed'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Job ID: {jobId}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {(isExecuting || isQueued) && (
                <div className="mb-6">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${jobData?.progress || 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Progress: {jobData?.progress || 0}%
                  </p>
                </div>
              )}

              {/* Error message */}
              {isFailed && jobData?.error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
                  <p className="font-medium mb-1">Error</p>
                  <p className="text-sm">{jobData.error}</p>
                </div>
              )}

              {/* Success info */}
              {isCompleted && jobData?.result && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md">
                    <p className="font-medium mb-1">Execution Completed</p>
                    <p className="text-sm">
                      Your eval has been executed on the selected traces.
                    </p>
                  </div>

                  {jobData.result && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Results:</p>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        {jobData.result.executed_count !== undefined && (
                          <li>Traces Executed: {jobData.result.executed_count}</li>
                        )}
                        {jobData.result.success_count !== undefined && (
                          <li>Successful: {jobData.result.success_count}</li>
                        )}
                        {jobData.result.error_count !== undefined && (
                          <li>Errors: {jobData.result.error_count}</li>
                        )}
                        {jobData.result.contradiction_count !== undefined && (
                          <li className="text-red-600 font-medium">
                            Contradictions: {jobData.result.contradiction_count}
                          </li>
                        )}
                      </ul>
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
