'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@/hooks/use-router-with-progress'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Eye,
  TrendingUp
} from 'lucide-react'
import { toast } from 'sonner'
import { formatRelativeTime, formatPercentage } from '@/lib/utils'
import { LiveJobMonitor } from '@/components/jobs/live-job-monitor'
import type { TasksetRun } from '@/types/taskset'

type RunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'

function getRunStatusIcon(status: RunStatus) {
  switch (status) {
    case 'queued':
      return <Clock className="w-4 h-4 text-muted-foreground" />
    case 'running':
      return <Loader2 className="w-4 h-4 text-primary animate-spin" />
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-success" />
    case 'partial':
      return <AlertCircle className="w-4 h-4 text-warning" />
    case 'failed':
      return <XCircle className="w-4 h-4 text-destructive" />
    case 'cancelled':
      return <XCircle className="w-4 h-4 text-muted-foreground" />
  }
}

function getRunStatusBadge(status: RunStatus) {
  const colors: Record<RunStatus, string> = {
    queued: 'bg-muted text-muted-foreground',
    running: 'bg-primary/10 text-primary',
    completed: 'bg-success/10 text-success',
    partial: 'bg-warning/10 text-warning',
    failed: 'bg-destructive/10 text-destructive',
    cancelled: 'bg-muted text-muted-foreground',
  }
  return (
    <Badge variant="secondary" className={colors[status]}>
      {getRunStatusIcon(status)}
      <span className="ml-1.5">{status}</span>
    </Badge>
  )
}

export default function TasksetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const agentId = params.id as string
  const tasksetId = params.tasksetId as string
  const [runModalOpen, setRunModalOpen] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  // Fetch agent
  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => apiClient.getAgent(agentId),
  })

  // Fetch taskset with tasks
  const { data: taskset, isLoading: tasksetLoading, error: tasksetError } = useQuery({
    queryKey: ['taskset', agentId, tasksetId],
    queryFn: () => apiClient.getTaskset(agentId, tasksetId),
  })

  // Fetch runs - LiveJobMonitor handles SSE when active, fallback to polling otherwise
  const { data: runsData, isLoading: runsLoading, refetch: refetchRuns } = useQuery({
    queryKey: ['taskset-runs', agentId, tasksetId],
    queryFn: () => apiClient.listTasksetRuns(agentId, tasksetId),
    refetchInterval: (query) => {
      // Don't poll if LiveJobMonitor is showing (it handles SSE)
      if (activeJobId) return false
      // Poll every 3 seconds if there are running or queued runs (fallback for page refresh)
      const data = query.state.data
      const hasActiveRuns = data?.runs?.some(
        (r: TasksetRun) => r.status === 'running' || r.status === 'queued'
      )
      return hasActiveRuns ? 3000 : false
    },
  })

  // Run taskset mutation
  const runTasksetMutation = useMutation({
    mutationFn: () => apiClient.runTaskset(agentId, tasksetId, {
      model_provider: 'anthropic',
      model_id: 'anthropic/claude-sonnet-4-5',
    }),
    onSuccess: (data) => {
      toast.success('Taskset run started!')
      // Set job ID for SSE live updates
      setActiveJobId(data.job_id)
      queryClient.invalidateQueries({ queryKey: ['taskset-runs', agentId, tasksetId] })
      setRunModalOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to start taskset run')
    },
  })

  if (agentLoading || tasksetLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="h-10 w-48 bg-muted rounded-lg animate-pulse" />
          <div className="h-32 bg-muted rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-96 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  if (tasksetError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState message="Failed to load taskset" />
      </div>
    )
  }

  const runs = runsData?.runs || []
  const tasks = taskset?.tasks || []
  const runningRuns = runs.filter((r) => r.status === 'running' || r.status === 'queued')
  const completedRuns = runs.filter((r) => r.status === 'completed')
  const hasActiveRun = runningRuns.length > 0

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/agents/${agentId}/tasksets`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tasksets
          </Button>
        </Link>
      </div>

      <div className="mb-8 pb-8 border-b">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-tight">{taskset?.name}</h1>
            {taskset?.description && (
              <p className="text-muted-foreground mt-3 text-lg max-w-3xl">{taskset.description}</p>
            )}
            <div className="flex items-center gap-3 mt-4">
              <Badge variant="secondary" className="font-medium">{tasks.length} tasks</Badge>
              <span className="text-sm text-muted-foreground">
                Created {formatRelativeTime(taskset?.created_at || '')}
              </span>
            </div>
          </div>
          <Button
            size="lg"
            onClick={() => runTasksetMutation.mutate()}
            disabled={runTasksetMutation.isPending || hasActiveRun}
            className="ml-6 min-w-[160px] transition-all hover:scale-105 hover:shadow-lg group"
          >
            {runTasksetMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2 group-hover:animate-pulse" />
                Run Taskset
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Live Job Monitor - shows when a run is active */}
      {activeJobId && (
        <div className="mb-8">
          <LiveJobMonitor
            jobId={activeJobId}
            jobType="taskset_run"
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['taskset-runs', agentId, tasksetId] })
              setActiveJobId(null)
            }}
            onFail={() => {
              queryClient.invalidateQueries({ queryKey: ['taskset-runs', agentId, tasksetId] })
              setActiveJobId(null)
            }}
          />
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-200 border-l-4 border-l-primary">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Play className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="text-3xl font-bold">{runs.length}</div>
                <div className="text-sm text-muted-foreground font-medium">Total Runs</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-200 border-l-4 border-l-blue-500">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-xl">
                <Loader2 className={`w-6 h-6 text-blue-500 ${hasActiveRun ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <div className="text-3xl font-bold">{runningRuns.length}</div>
                <div className="text-sm text-muted-foreground font-medium">Running</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-200 border-l-4 border-l-green-500">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <div className="text-3xl font-bold">{completedRuns.length}</div>
                <div className="text-sm text-muted-foreground font-medium">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-200 border-l-4 border-l-purple-500">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-xl">
                <TrendingUp className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <div className="text-3xl font-bold">
                  {completedRuns.length > 0
                    ? formatPercentage(
                        completedRuns.reduce((sum, r) => sum + (r.completed_count / r.task_count), 0) /
                          completedRuns.length
                      )
                    : '0%'}
                </div>
                <div className="text-sm text-muted-foreground font-medium">Avg Success</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Runs List */}
      <Card className="shadow-md">
        <CardHeader className="bg-muted/30">
          <CardTitle className="text-xl">Recent Runs</CardTitle>
          <CardDescription>
            History of taskset execution runs
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {runsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-16 bg-muted/20 rounded-lg border-2 border-dashed">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Play className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No runs yet</h3>
              <p className="text-muted-foreground mb-4">Click &quot;Run Taskset&quot; above to execute your first run</p>
            </div>
          ) : (
            <div className="space-y-4">
              {runs.map((run) => {
                const progress = run.task_count > 0
                  ? ((run.completed_count + run.failed_count) / run.task_count) * 100
                  : 0
                const successRate = run.completed_count > 0
                  ? (run.completed_count / (run.completed_count + run.failed_count)) * 100
                  : 0

                return (
                  <Card key={run.id} className="hover:border-primary/50 hover:shadow-md transition-all duration-200 border-2">
                    <CardContent className="py-5 px-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            {getRunStatusBadge(run.status)}
                            <span className="text-sm text-muted-foreground font-medium">
                              {formatRelativeTime(run.created_at)}
                            </span>
                            {(run.model_provider || run.model_id) && (
                              <span className="text-sm text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                                {run.model_id?.startsWith(run.model_provider + '/')
                                  ? run.model_id
                                  : run.model_id || run.model_provider || 'Unknown'}
                              </span>
                            )}
                          </div>

                          {(run.status === 'running' || run.status === 'queued') && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground font-medium">Progress</span>
                                <span className="font-semibold">
                                  {run.completed_count + run.failed_count} / {run.task_count}
                                </span>
                              </div>
                              <Progress value={progress} className="h-3 shadow-inner" />
                            </div>
                          )}

                          {run.status === 'completed' && (
                            <div className="flex items-center gap-6 text-sm">
                              <span className="text-muted-foreground">
                                Success: <span className="font-semibold text-green-600">{run.completed_count}/{run.task_count}</span>
                              </span>
                              {run.failed_count > 0 && (
                                <span className="text-muted-foreground">
                                  Failed: <span className="font-semibold text-red-600">{run.failed_count}</span>
                                </span>
                              )}
                              <span className="text-muted-foreground">
                                Rate: <span className="font-semibold text-foreground">{formatPercentage(successRate / 100)}</span>
                              </span>
                            </div>
                          )}

                          {run.error && (
                            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">{run.error}</div>
                          )}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/resources/${run.id}`)}
                          className="ml-4 hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tasks Preview */}
      <Card className="mt-8 shadow-md">
        <CardHeader className="bg-muted/30">
          <CardTitle className="text-xl">Tasks ({tasks.length})</CardTitle>
          <CardDescription>
            Test cases in this taskset
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {tasks.length === 0 ? (
            <div className="text-center py-16 bg-muted/20 rounded-lg border-2 border-dashed">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground font-medium">No tasks in this taskset</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2">
              {tasks.slice(0, 5).map((task, index) => {
                // Extract known variable fields from metadata
                const metadata = task.metadata || {}
                const variableFields = ['inbox_address', 'query_date']
                const variables = variableFields
                  .filter(key => key in metadata)
                  .map(key => ({ key, value: metadata[key] }))
                const otherMetadata = Object.entries(metadata)
                  .filter(([key]) => !variableFields.includes(key))

                return (
                  <div
                    key={task.id}
                    className={`border-2 rounded-lg p-5 transition-all hover:shadow-md hover:border-primary/30 ${
                      index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                    }`}
                  >
                    {/* Variables Section */}
                    {variables.length > 0 && (
                      <div className="mb-4">
                        <div className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Variables:</div>
                        <div className="flex flex-wrap gap-2">
                          {variables.map(({ key, value }) => (
                            <div key={key} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-md text-sm">
                              <span className="font-mono text-xs opacity-70">{key}:</span>
                              <span className="font-medium">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* User Message */}
                    <div className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">User Message:</div>
                    <div className="text-sm mb-4 whitespace-pre-wrap bg-muted/30 p-3 rounded border">
                      {task.user_message}
                    </div>

                    {/* Expected Output */}
                    {task.expected_output && (
                      <>
                        <div className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Expected Output:</div>
                        <div className="text-sm mb-4 whitespace-pre-wrap bg-muted/30 p-3 rounded border">
                          {task.expected_output}
                        </div>
                      </>
                    )}

                    {/* Additional Metadata */}
                    {otherMetadata.length > 0 && (
                      <div className="mb-4">
                        <div className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Metadata:</div>
                        <div className="bg-muted/30 p-3 rounded border">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                            {otherMetadata.map(([key, value]) => (
                              <div key={key} className="flex items-start gap-1.5">
                                <span className="font-mono text-xs text-muted-foreground">{key}:</span>
                                <span className="text-foreground break-all">
                                  {Array.isArray(value)
                                    ? `[${value.length} items]`
                                    : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Source Badge */}
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-medium">
                        {task.source}
                      </Badge>
                    </div>
                  </div>
                )
              })}
              {tasks.length > 5 && (
                <div className="text-center py-4 bg-primary/5 rounded-lg border border-primary/20">
                  <p className="text-sm font-medium text-primary">
                    And {tasks.length - 5} more tasks...
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
