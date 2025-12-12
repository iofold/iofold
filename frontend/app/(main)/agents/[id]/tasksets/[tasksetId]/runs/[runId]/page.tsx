'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@/hooks/use-router-with-progress'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Target,
} from 'lucide-react'
import { formatRelativeTime, formatPercentage } from '@/lib/utils'
import type { TasksetRunResult } from '@/types/taskset'

type ResultStatus = 'pending' | 'completed' | 'failed' | 'timeout'

function getResultStatusIcon(status: ResultStatus) {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4 text-muted-foreground" />
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-success" />
    case 'failed':
      return <XCircle className="w-4 h-4 text-destructive" />
    case 'timeout':
      return <AlertTriangle className="w-4 h-4 text-warning" />
  }
}

function getResultStatusBadge(status: ResultStatus) {
  const colors: Record<ResultStatus, string> = {
    pending: 'bg-muted text-muted-foreground',
    completed: 'bg-success/10 text-success',
    failed: 'bg-destructive/10 text-destructive',
    timeout: 'bg-warning/10 text-warning',
  }
  return (
    <Badge variant="secondary" className={colors[status]}>
      {getResultStatusIcon(status)}
      <span className="ml-1.5">{status}</span>
    </Badge>
  )
}

function getScoreBadge(score: number | undefined) {
  if (score === undefined || score === null) return null

  let color = 'bg-muted text-muted-foreground'
  if (score >= 0.8) color = 'bg-success/10 text-success'
  else if (score >= 0.5) color = 'bg-warning/10 text-warning'
  else color = 'bg-destructive/10 text-destructive'

  return (
    <Badge variant="secondary" className={color}>
      {formatPercentage(score)} match
    </Badge>
  )
}

export default function RunDetailPage() {
  const params = useParams()
  const router = useRouter()
  const agentId = params.id as string
  const tasksetId = params.tasksetId as string
  const runId = params.runId as string
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed'>('all')

  // Fetch agent
  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => apiClient.getAgent(agentId),
  })

  // Fetch taskset
  const { data: taskset, isLoading: tasksetLoading } = useQuery({
    queryKey: ['taskset', agentId, tasksetId],
    queryFn: () => apiClient.getTaskset(agentId, tasksetId),
  })

  // Fetch run with results
  const { data: runData, isLoading: runLoading, error: runError } = useQuery({
    queryKey: ['taskset-run', agentId, tasksetId, runId],
    queryFn: () => apiClient.getTasksetRunStatus(agentId, tasksetId, runId),
    refetchInterval: (query) => {
      // Poll every 2 seconds if run is still active
      const data = query.state.data
      if (!data) return false
      const isActive = data.run?.status === 'running' || data.run?.status === 'queued'
      return isActive ? 2000 : false
    },
  })

  const toggleResultExpanded = (resultId: string) => {
    setExpandedResults((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(resultId)) {
        newSet.delete(resultId)
      } else {
        newSet.add(resultId)
      }
      return newSet
    })
  }

  if (agentLoading || tasksetLoading || runLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (runError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState message="Failed to load run details" />
      </div>
    )
  }

  const run = runData?.run
  const results = runData?.results || []

  const filteredResults = results.filter((result) => {
    if (filter === 'all') return true
    if (filter === 'completed') return result.status === 'completed'
    if (filter === 'failed') return result.status === 'failed' || result.status === 'timeout'
    return true
  })

  const progress = run && run.task_count > 0
    ? ((run.completed_count + run.failed_count) / run.task_count) * 100
    : 0

  const successRate = run && run.completed_count > 0
    ? (run.completed_count / (run.completed_count + run.failed_count)) * 100
    : 0

  const avgScore = results
    .filter((r) => r.status === 'completed' && r.score !== undefined && r.score !== null)
    .reduce((sum, r) => sum + (r.score || 0), 0) / Math.max(1, results.filter((r) => r.score !== undefined).length)

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/agents/${agentId}/tasksets/${tasksetId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Taskset
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Run Details</h1>
        <p className="text-muted-foreground mt-2">
          {taskset?.name} - {formatRelativeTime(run?.created_at || '')}
        </p>
        <div className="flex items-center gap-3 mt-3">
          <Badge variant="secondary">
            {run?.model_provider}/{run?.model_id}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Run ID: {runId.slice(0, 8)}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{run?.task_count || 0}</div>
                <div className="text-sm text-muted-foreground">Total Tasks</div>
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
                <div className="text-2xl font-bold">{run?.completed_count || 0}</div>
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
                <div className="text-2xl font-bold">{run?.failed_count || 0}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-2xl font-bold">{formatPercentage(successRate / 100)}</div>
                <div className="text-sm text-muted-foreground">Success Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {isNaN(avgScore) ? 'N/A' : formatPercentage(avgScore)}
                </div>
                <div className="text-sm text-muted-foreground">Avg Score</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar for Running Runs */}
      {(run?.status === 'running' || run?.status === 'queued') && (
        <Card className="mb-6">
          <CardContent className="py-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="font-semibold">
                    {run.status === 'queued' ? 'Queued' : 'Running'}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {run.completed_count + run.failed_count} / {run.task_count} tasks completed
                </span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {run?.error && (
        <Card className="mb-6 border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Run Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-destructive whitespace-pre-wrap">{run.error}</pre>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Task Results ({filteredResults.length})</CardTitle>
              <CardDescription>Individual task execution results</CardDescription>
            </div>
            <Tabs defaultValue="all" value={filter} onValueChange={(v) => setFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="failed">Failed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {filteredResults.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {results.length === 0 ? 'No results yet' : 'No results matching filter'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredResults.map((result) => {
                const isExpanded = expandedResults.has(result.id)
                const task = taskset?.tasks?.find((t) => t.id === result.task_id)

                return (
                  <Card key={result.id} className="overflow-hidden">
                    <div
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleResultExpanded(result.id)}
                    >
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleResultExpanded(result.id)
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </Button>
                              {getResultStatusBadge(result.status)}
                              {result.score !== undefined && result.score !== null && getScoreBadge(result.score)}
                              {result.execution_time_ms && (
                                <span className="text-xs text-muted-foreground">
                                  {result.execution_time_ms}ms
                                </span>
                              )}
                              {result.trace_id && (
                                <Link
                                  href={`/agents/${agentId}/traces/${result.trace_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                    Trace
                                  </Badge>
                                </Link>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground ml-9">
                              {task?.user_message?.slice(0, 100) || 'Task ' + result.task_id.slice(0, 8)}
                              {task?.user_message && task.user_message.length > 100 && '...'}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </div>

                    {isExpanded && (
                      <CardContent className="border-t pt-4 pb-4 bg-muted/30">
                        <div className="space-y-4">
                          {/* User Message */}
                          <div>
                            <div className="text-sm font-semibold mb-2">User Message:</div>
                            <div className="text-sm bg-background rounded p-3 whitespace-pre-wrap">
                              {task?.user_message || 'N/A'}
                            </div>
                          </div>

                          {/* Response */}
                          {result.response && (
                            <div>
                              <div className="text-sm font-semibold mb-2">Agent Response:</div>
                              <div className="text-sm bg-background rounded p-3 whitespace-pre-wrap">
                                {result.response}
                              </div>
                            </div>
                          )}

                          {/* Expected Output */}
                          {result.expected_output && (
                            <div>
                              <div className="text-sm font-semibold mb-2">Expected Output:</div>
                              <div className="text-sm bg-background rounded p-3 whitespace-pre-wrap">
                                {result.expected_output}
                              </div>
                            </div>
                          )}

                          {/* Score Reason */}
                          {result.score_reason && (
                            <div>
                              <div className="text-sm font-semibold mb-2">Score Reason:</div>
                              <div className="text-sm bg-background rounded p-3 whitespace-pre-wrap">
                                {result.score_reason}
                              </div>
                            </div>
                          )}

                          {/* Error */}
                          {result.error && (
                            <div>
                              <div className="text-sm font-semibold mb-2 text-destructive">Error:</div>
                              <div className="text-sm bg-destructive/10 text-destructive rounded p-3 whitespace-pre-wrap">
                                {result.error}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
