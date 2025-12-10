'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, APIError } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, Sparkles, CheckCircle2, XCircle, AlertCircle, TrendingUp } from 'lucide-react'
import { formatPercentage } from '@/lib/utils'
import { toast } from 'sonner'

interface GEPAOptimizationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
}

interface GEPARunStatus {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: {
    metric_calls: number
    max_metric_calls: number
    best_score?: number
    total_candidates: number
  }
  result?: {
    best_prompt: string
    best_score: number
  }
  error?: string
  created_at: string
  started_at?: string
  completed_at?: string
}

export function GEPAOptimizationModal({ open, onOpenChange, agentId }: GEPAOptimizationModalProps) {
  const [runId, setRunId] = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<GEPARunStatus | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const queryClient = useQueryClient()

  // Fetch active eval
  const { data: activeEval, isLoading: loadingEval } = useQuery({
    queryKey: ['agent-active-eval', agentId],
    queryFn: () => apiClient.getActiveEval(agentId),
    enabled: open,
  })

  // Start optimization mutation
  const startOptimizationMutation = useMutation({
    mutationFn: async () => {
      if (!activeEval?.id) {
        throw new Error('No active eval found for this agent')
      }

      return apiClient.startGEPAOptimization(agentId, {
        eval_id: activeEval.id,
        max_metric_calls: 50,
        parallelism: 5,
      })
    },
    onSuccess: (data) => {
      setRunId(data.run_id)
      setIsStreaming(true)
      setError(null)

      // Set initial status
      setRunStatus({
        id: data.run_id,
        status: 'pending',
        progress: {
          metric_calls: 0,
          max_metric_calls: 50,
          total_candidates: 0,
        },
        created_at: new Date().toISOString(),
      })

      // Connect to SSE stream
      connectToStream(data.run_id)

      toast.success('GEPA optimization started')
    },
    onError: (err: APIError) => {
      setError(err.message || 'Failed to start GEPA optimization')
      toast.error(err.message || 'Failed to start optimization')
    },
  })

  // Connect to SSE stream for progress updates
  const connectToStream = (runId: string) => {
    try {
      const eventSource = apiClient.streamGEPARun(agentId, runId)
      eventSourceRef.current = eventSource

      eventSource.addEventListener('progress', (event) => {
        const data = JSON.parse(event.data)
        setRunStatus((prev) => {
          if (!prev) return null
          return {
            ...prev,
            status: 'running',
            progress: {
              metric_calls: data.metric_calls,
              max_metric_calls: data.max_metric_calls,
              best_score: data.best_score,
              total_candidates: data.total_candidates,
            },
          }
        })
      })

      eventSource.addEventListener('complete', (event) => {
        const data = JSON.parse(event.data)
        setRunStatus((prev) => {
          if (!prev) return null
          return {
            ...prev,
            status: 'completed',
            result: {
              best_prompt: data.best_prompt,
              best_score: data.best_score,
            },
            progress: {
              ...prev.progress,
              total_candidates: data.total_candidates,
            },
          }
        })
        setIsStreaming(false)
        eventSource.close()

        // Invalidate agent data to refresh versions
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] })

        toast.success('Optimization completed successfully!')
      })

      eventSource.addEventListener('error', (event: MessageEvent) => {
        const data = JSON.parse(event.data)
        setRunStatus((prev) => (prev ? { ...prev, status: 'failed', error: data.error } : null))
        setIsStreaming(false)
        setError(data.error)
        eventSource.close()

        toast.error('Optimization failed')
      })

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          setIsStreaming(false)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to stream')
      setIsStreaming(false)
    }
  }

  // Cleanup on unmount or modal close
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setRunId(null)
      setRunStatus(null)
      setIsStreaming(false)
      setError(null)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [open])

  const handleClose = () => {
    if (isStreaming) {
      const confirmed = window.confirm(
        'Optimization is still running. Closing this window will not cancel the optimization. Continue?'
      )
      if (!confirmed) return
    }
    onOpenChange(false)
  }

  const progress = runStatus
    ? (runStatus.progress.metric_calls / runStatus.progress.max_metric_calls) * 100
    : 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Optimize Prompt with GEPA
          </DialogTitle>
          <DialogDescription>
            GEPA will automatically improve your agent's prompt by testing variations and selecting the best performer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pre-flight checks */}
          {!runId && !isStreaming && (
            <div className="space-y-4">
              {loadingEval ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !activeEval ? (
                <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg">
                  <div className="flex gap-2">
                    <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-warning">No Active Eval</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        You need to generate and activate an eval before running GEPA optimization.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm font-medium mb-2">Active Eval</div>
                    <div className="text-sm text-muted-foreground">{activeEval.name}</div>
                    {activeEval.accuracy !== null && (
                      <div className="text-sm text-muted-foreground mt-1">
                        Current Accuracy: {formatPercentage(activeEval.accuracy)}
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm font-medium mb-2">Optimization Settings</div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>Max iterations: 50</div>
                      <div>Parallelism: 5 concurrent tasks</div>
                      <div>Estimated time: 10-15 minutes</div>
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <div className="flex gap-2">
                        <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-destructive">Error</div>
                          <div className="text-sm text-muted-foreground mt-1">{error}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Progress view */}
          {runId && runStatus && (
            <div className="space-y-4">
              {/* Status indicator */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {runStatus.status === 'pending' && (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      <span className="text-sm font-medium">Starting optimization...</span>
                    </>
                  )}
                  {runStatus.status === 'running' && (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span className="text-sm font-medium">Optimizing prompt...</span>
                    </>
                  )}
                  {runStatus.status === 'completed' && (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-success" />
                      <span className="text-sm font-medium text-success">Optimization complete!</span>
                    </>
                  )}
                  {runStatus.status === 'failed' && (
                    <>
                      <XCircle className="w-5 h-5 text-destructive" />
                      <span className="text-sm font-medium text-destructive">Optimization failed</span>
                    </>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {runStatus.progress.metric_calls} / {runStatus.progress.max_metric_calls}
                </span>
              </div>

              {/* Progress bar */}
              <Progress value={progress} />

              {/* Results (when completed) */}
              {runStatus.status === 'completed' && runStatus.result && (
                <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
                  <div className="flex gap-2">
                    <TrendingUp className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-success mb-2">Optimization Results</div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-muted-foreground">Best Score</div>
                          <div className="font-bold text-lg">{formatPercentage(runStatus.result.best_score)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Candidates Tested</div>
                          <div className="font-bold text-lg">{runStatus.progress.total_candidates}</div>
                        </div>
                      </div>
                      <div className="mt-3 text-sm text-muted-foreground">
                        A new agent version has been created with the optimized prompt.
                        You can review and promote it from the agent versions list.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error display */}
              {runStatus.status === 'failed' && runStatus.error && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="flex gap-2">
                    <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-destructive">Error</div>
                      <div className="text-sm text-muted-foreground mt-1">{runStatus.error}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!runId && !isStreaming && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => startOptimizationMutation.mutate()}
                disabled={!activeEval || startOptimizationMutation.isPending}
              >
                {startOptimizationMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Start Optimization
                  </>
                )}
              </Button>
            </>
          )}
          {runId && (
            <Button
              onClick={handleClose}
              disabled={isStreaming && runStatus?.status === 'running'}
            >
              {runStatus?.status === 'completed' ? 'Done' : 'Close'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
