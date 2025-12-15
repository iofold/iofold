'use client'

import { use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@/hooks/use-router-with-progress'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  StopCircle,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { LiveJobMonitor } from '@/components/jobs/live-job-monitor'
import type { Job } from '@/types/api'

type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

function getStatusIcon(status: JobStatus, size = 'w-5 h-5') {
  switch (status) {
    case 'queued':
      return <Clock className={`${size} text-muted-foreground`} />
    case 'running':
      return <Loader2 className={`${size} text-primary animate-spin`} />
    case 'completed':
      return <CheckCircle2 className={`${size} text-green-500`} />
    case 'failed':
      return <XCircle className={`${size} text-destructive`} />
    case 'cancelled':
      return <StopCircle className={`${size} text-muted-foreground`} />
    default:
      return <AlertCircle className={size} />
  }
}

function getStatusBadgeVariant(status: JobStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default'
    case 'failed':
      return 'destructive'
    case 'running':
    case 'queued':
      return 'secondary'
    default:
      return 'outline'
  }
}

function getJobTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    import: 'Import Traces',
    generate: 'Generate Eval',
    execute: 'Execute Eval',
    taskset_run: 'Taskset Run',
    agent_discovery: 'Agent Discovery',
    gepa_optimization: 'GEPA Optimization',
    rollout_task: 'Rollout Task',
  }
  return labels[type] || type
}

interface PageProps {
  params: Promise<{ jobId: string }>
}

export default function JobDetailsPage({ params }: PageProps) {
  const { jobId } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()

  // Fetch job details with polling for active jobs
  const { data: job, isLoading, error } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => apiClient.getJob(jobId),
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.status === 'running' || data?.status === 'queued') {
        return 2000
      }
      return false
    },
  })

  // Cancel job mutation
  const cancelJobMutation = useMutation({
    mutationFn: (id: string) => apiClient.cancelJob(id),
    onSuccess: () => {
      toast.success('Job cancelled')
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to cancel job')
    },
  })

  const handleCancelJob = () => {
    if (confirm('Are you sure you want to cancel this job?')) {
      cancelJobMutation.mutate(jobId)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <h2 className="text-xl font-semibold mb-2">Job Not Found</h2>
              <p className="text-muted-foreground mb-4">
                The job you&apos;re looking for doesn&apos;t exist or has been deleted.
              </p>
              <Link href="/resources">
                <Button>Back to Jobs</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isActive = job.status === 'running' || job.status === 'queued'
  const isCompleted = job.status === 'completed'
  const isFailed = job.status === 'failed'

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/resources"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Jobs
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {getStatusIcon(job.status as JobStatus, 'w-8 h-8')}
            <div>
              <h1 className="text-2xl font-bold">{getJobTypeLabel(job.type)}</h1>
              <p className="text-sm text-muted-foreground font-mono">{job.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={getStatusBadgeVariant(job.status as JobStatus)} className="text-sm">
              {job.status}
            </Badge>
            {isActive && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelJob}
                disabled={cancelJobMutation.isPending}
              >
                <StopCircle className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Card for Active Jobs */}
      {isActive && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {job.status === 'queued' ? 'Waiting to start...' : 'Processing...'}
                </span>
                <span className="font-medium">{job.progress}%</span>
              </div>
              <Progress value={job.progress} className="h-3" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Job Monitor */}
      {(isActive || isCompleted || isFailed) && (
        <div className="mb-6">
          <LiveJobMonitor
            jobId={jobId}
            jobType={job.type as 'import' | 'generate' | 'execute' | 'taskset_run'}
            onComplete={(result) => {
              queryClient.invalidateQueries({ queryKey: ['job', jobId] })
              queryClient.invalidateQueries({ queryKey: ['jobs'] })
              queryClient.invalidateQueries({ queryKey: ['evals'] })
            }}
            onFail={() => {
              queryClient.invalidateQueries({ queryKey: ['job', jobId] })
            }}
          />
        </div>
      )}

      {/* Result Card for Completed Jobs */}
      {isCompleted && job.result && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            {job.type === 'generate' && job.result.eval_id && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Eval ID</p>
                    <p className="font-mono text-sm">{job.result.eval_id}</p>
                  </div>
                  {job.result.accuracy !== undefined && (
                    <div>
                      <p className="text-sm text-muted-foreground">Accuracy</p>
                      <p className="text-2xl font-bold text-green-500">
                        {Math.round(job.result.accuracy * 100)}%
                      </p>
                    </div>
                  )}
                </div>

                {job.result.test_results && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Test Results</p>
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-500">
                        {job.result.test_results.correct} correct
                      </span>
                      <span className="text-destructive">
                        {job.result.test_results.incorrect} incorrect
                      </span>
                      {job.result.test_results.errors > 0 && (
                        <span className="text-orange-500">
                          {job.result.test_results.errors} errors
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <Link href={`/evals/${job.result.eval_id}`}>
                  <Button className="w-full">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Eval Details
                  </Button>
                </Link>
              </div>
            )}

            {job.type !== 'generate' && (
              <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto">
                {JSON.stringify(job.result, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error Card for Failed Jobs */}
      {isFailed && job.error && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-destructive/10 rounded-lg p-4 text-sm text-destructive">
              {job.error}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timestamps Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(job.created_at).toLocaleString()}</span>
            </div>
            {job.started_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Started</span>
                <span>{new Date(job.started_at).toLocaleString()}</span>
              </div>
            )}
            {job.completed_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Completed</span>
                <span>{new Date(job.completed_at).toLocaleString()}</span>
              </div>
            )}
            {job.started_at && job.completed_at && (
              <div className="flex justify-between text-sm border-t pt-3">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">
                  {Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)}s
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
