'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { GEPAOptimizationModal } from '@/components/modals/gepa-optimization-modal'
import {
  ArrowLeft,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Play,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Activity,
  ListChecks,
} from 'lucide-react'
import { formatRelativeTime, formatPercentage } from '@/lib/utils'

type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
type BatchStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed'

function getRunStatusIcon(status: RunStatus) {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4 text-muted-foreground" />
    case 'running':
      return <Loader2 className="w-4 h-4 text-primary animate-spin" />
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-success" />
    case 'failed':
      return <XCircle className="w-4 h-4 text-destructive" />
    case 'cancelled':
      return <XCircle className="w-4 h-4 text-muted-foreground" />
  }
}

function getRunStatusBadge(status: RunStatus) {
  const colors: Record<RunStatus, string> = {
    pending: 'bg-muted text-muted-foreground',
    running: 'bg-primary/10 text-primary',
    completed: 'bg-success/10 text-success',
    failed: 'bg-destructive/10 text-destructive',
    cancelled: 'bg-muted text-muted-foreground',
  }
  return (
    <Badge variant="secondary" className={colors[status]}>
      {status}
    </Badge>
  )
}

function getBatchStatusBadge(status: BatchStatus) {
  const colors: Record<BatchStatus, string> = {
    queued: 'bg-muted text-muted-foreground',
    running: 'bg-primary/10 text-primary',
    completed: 'bg-success/10 text-success',
    partial: 'bg-warning/10 text-warning',
    failed: 'bg-destructive/10 text-destructive',
  }
  return (
    <Badge variant="secondary" className={colors[status]}>
      {status}
    </Badge>
  )
}

export default function GEPADashboardPage() {
  const params = useParams()
  const agentId = params.id as string
  const [gepaModalOpen, setGepaModalOpen] = useState(false)
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set())
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())

  // Fetch agent details
  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => apiClient.getAgent(agentId),
  })

  // Fetch GEPA runs
  const { data: gepaData, isLoading: runsLoading, error: runsError, refetch: refetchRuns } = useQuery({
    queryKey: ['gepa-runs', agentId],
    queryFn: () => apiClient.listGEPARuns(agentId),
    refetchInterval: 5000, // Poll every 5 seconds for running runs
  })

  // Fetch rollout batches
  const { data: batchesData, isLoading: batchesLoading, error: batchesError, refetch: refetchBatches } = useQuery({
    queryKey: ['rollout-batches', agentId],
    queryFn: () => apiClient.listRolloutBatches(agentId),
    refetchInterval: 5000,
  })

  const toggleRunExpanded = (runId: string) => {
    setExpandedRuns((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(runId)) {
        newSet.delete(runId)
      } else {
        newSet.add(runId)
      }
      return newSet
    })
  }

  const toggleBatchExpanded = (batchId: string) => {
    setExpandedBatches((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(batchId)) {
        newSet.delete(batchId)
      } else {
        newSet.add(batchId)
      }
      return newSet
    })
  }

  const runs = gepaData?.runs || []
  const batches = batchesData?.batches || []

  const runningRuns = runs.filter((r) => r.status === 'running' || r.status === 'pending')
  const completedRuns = runs.filter((r) => r.status === 'completed')
  const failedRuns = runs.filter((r) => r.status === 'failed')

  if (agentLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/agents/${agentId}`} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to {agent?.name || 'Agent'}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="w-6 h-6 text-primary" />
              GEPA Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Prompt optimization runs and rollout batches for {agent?.name}
            </p>
          </div>
          <Button onClick={() => setGepaModalOpen(true)}>
            <Play className="w-4 h-4 mr-2" />
            Start New Optimization
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{runningRuns.length}</div>
                <div className="text-sm text-muted-foreground">Running</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-success" />
              </div>
              <div>
                <div className="text-2xl font-bold">{completedRuns.length}</div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <div className="text-2xl font-bold">{failedRuns.length}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <ListChecks className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-2xl font-bold">{batches.length}</div>
                <div className="text-sm text-muted-foreground">Rollout Batches</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Runs and Batches */}
      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            Optimization Runs ({runs.length})
          </TabsTrigger>
          <TabsTrigger value="batches" className="gap-2">
            <ListChecks className="w-4 h-4" />
            Rollout Batches ({batches.length})
          </TabsTrigger>
        </TabsList>

        {/* GEPA Runs Tab */}
        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle>Optimization Runs</CardTitle>
              <CardDescription>
                History of GEPA prompt optimization runs for this agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              {runsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : runsError ? (
                <ErrorState
                  title="Failed to load runs"
                  message="Could not fetch optimization runs"
                  onRetry={refetchRuns}
                />
              ) : runs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No optimization runs yet</p>
                  <p className="text-sm mt-1">Start a new GEPA optimization to improve your agent&apos;s prompt</p>
                  <Button className="mt-4" onClick={() => setGepaModalOpen(true)}>
                    <Play className="w-4 h-4 mr-2" />
                    Start Optimization
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {runs.map((run) => (
                    <div
                      key={run.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => toggleRunExpanded(run.id)}
                      >
                        <div className="flex items-center gap-3">
                          {getRunStatusIcon(run.status)}
                          <div>
                            <div className="font-medium font-mono text-sm">{run.id}</div>
                            <div className="text-sm text-muted-foreground">
                              {formatRelativeTime(run.created_at)}
                              {run.test_case_count && ` - ${run.test_case_count} test cases`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {run.progress.best_score !== null && (
                            <div className="text-right">
                              <div className="text-sm font-medium">
                                Best: {formatPercentage(run.progress.best_score)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {run.progress.total_candidates} candidates
                              </div>
                            </div>
                          )}
                          {getRunStatusBadge(run.status)}
                          {expandedRuns.has(run.id) ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Progress bar for running/pending */}
                      {(run.status === 'running' || run.status === 'pending') && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Progress</span>
                            <span>
                              {run.progress.metric_calls} / {run.progress.max_metric_calls}
                            </span>
                          </div>
                          <Progress
                            value={(run.progress.metric_calls / run.progress.max_metric_calls) * 100}
                          />
                        </div>
                      )}

                      {/* Expanded details */}
                      {expandedRuns.has(run.id) && (
                        <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-muted-foreground">Status:</span>{' '}
                              <span className="font-medium">{run.status}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Metric Calls:</span>{' '}
                              <span className="font-medium">
                                {run.progress.metric_calls} / {run.progress.max_metric_calls}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Candidates Tested:</span>{' '}
                              <span className="font-medium">{run.progress.total_candidates}</span>
                            </div>
                            {run.progress.best_score !== null && (
                              <div>
                                <span className="text-muted-foreground">Best Score:</span>{' '}
                                <span className="font-medium text-success">
                                  {formatPercentage(run.progress.best_score)}
                                </span>
                              </div>
                            )}
                            {run.started_at && (
                              <div>
                                <span className="text-muted-foreground">Started:</span>{' '}
                                <span className="font-medium">{formatRelativeTime(run.started_at)}</span>
                              </div>
                            )}
                            {run.completed_at && (
                              <div>
                                <span className="text-muted-foreground">Completed:</span>{' '}
                                <span className="font-medium">{formatRelativeTime(run.completed_at)}</span>
                              </div>
                            )}
                          </div>
                          {run.error && (
                            <div className="mt-2 p-2 bg-destructive/10 rounded text-destructive text-sm">
                              Error: {run.error}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rollout Batches Tab */}
        <TabsContent value="batches">
          <Card>
            <CardHeader>
              <CardTitle>Rollout Batches</CardTitle>
              <CardDescription>
                Agent execution batches created during GEPA optimization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {batchesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : batchesError ? (
                <ErrorState
                  title="Failed to load batches"
                  message="Could not fetch rollout batches"
                  onRetry={refetchBatches}
                />
              ) : batches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ListChecks className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No rollout batches yet</p>
                  <p className="text-sm mt-1">Batches are created during GEPA optimization runs</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {batches.map((batch) => (
                    <div
                      key={batch.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => toggleBatchExpanded(batch.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="font-medium font-mono text-sm">{batch.id}</div>
                            <div className="text-sm text-muted-foreground">
                              {formatRelativeTime(batch.created_at)}
                              {batch.agent_name && ` - ${batch.agent_name}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-sm">
                              {batch.progress.completed} / {batch.progress.total}
                              {batch.progress.failed > 0 && (
                                <span className="text-destructive ml-1">
                                  ({batch.progress.failed} failed)
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">tasks</div>
                          </div>
                          {getBatchStatusBadge(batch.status)}
                          {expandedBatches.has(batch.id) ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      {batch.status === 'running' || batch.status === 'queued' ? (
                        <div className="mt-3">
                          <Progress
                            value={(batch.progress.completed / batch.progress.total) * 100}
                          />
                        </div>
                      ) : null}

                      {/* Expanded details */}
                      {expandedBatches.has(batch.id) && (
                        <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-muted-foreground">Status:</span>{' '}
                              <span className="font-medium">{batch.status}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Total Tasks:</span>{' '}
                              <span className="font-medium">{batch.task_count}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Completed:</span>{' '}
                              <span className="font-medium text-success">
                                {batch.progress.completed}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Failed:</span>{' '}
                              <span className="font-medium text-destructive">
                                {batch.progress.failed}
                              </span>
                            </div>
                            {batch.completed_at && (
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Completed:</span>{' '}
                                <span className="font-medium">{formatRelativeTime(batch.completed_at)}</span>
                              </div>
                            )}
                          </div>
                          {batch.system_prompt && (
                            <div className="mt-2">
                              <span className="text-muted-foreground">System Prompt:</span>
                              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                                {batch.system_prompt}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* GEPA Optimization Modal */}
      <GEPAOptimizationModal
        open={gepaModalOpen}
        onOpenChange={setGepaModalOpen}
        agentId={agentId}
      />
    </div>
  )
}
