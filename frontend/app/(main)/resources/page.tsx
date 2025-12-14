'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Briefcase,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  RefreshCw,
  StopCircle,
  Trash2,
  Eye,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatRelativeTime } from '@/lib/utils'
import type { Job } from '@/types/api'

type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
type JobType = 'import' | 'generate' | 'execute' | 'taskset_run' | 'agent_discovery' | 'gepa_optimization'

function getStatusIcon(status: JobStatus) {
  switch (status) {
    case 'queued':
      return <Clock className="w-4 h-4 text-muted-foreground" />
    case 'running':
      return <Loader2 className="w-4 h-4 text-primary animate-spin" />
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />
    case 'failed':
      return <XCircle className="w-4 h-4 text-destructive" />
    case 'cancelled':
      return <StopCircle className="w-4 h-4 text-muted-foreground" />
    default:
      return <AlertCircle className="w-4 h-4" />
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

interface JobLog {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export default function JobsPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Fetch jobs with polling for active jobs
  const { data: jobsData, isLoading, refetch } = useQuery({
    queryKey: ['jobs', statusFilter, typeFilter],
    queryFn: () => apiClient.listJobs({
      status: statusFilter !== 'all' ? statusFilter as JobStatus : undefined,
      type: typeFilter !== 'all' ? typeFilter as JobType : undefined,
      limit: 100,
    }),
    refetchInterval: (query) => {
      const data = query.state.data
      const hasActiveJobs = data?.jobs?.some(
        (j: Job) => j.status === 'running' || j.status === 'queued'
      )
      return hasActiveJobs ? 3000 : false
    },
  })

  // Cancel job mutation
  const cancelJobMutation = useMutation({
    mutationFn: (jobId: string) => apiClient.cancelJob(jobId),
    onSuccess: () => {
      toast.success('Job cancelled')
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to cancel job')
    },
  })

  const jobs = jobsData?.jobs || []
  const activeJobs = jobs.filter(j => j.status === 'running' || j.status === 'queued')
  const completedJobs = jobs.filter(j => j.status === 'completed')
  const failedJobs = jobs.filter(j => j.status === 'failed')

  const handleViewDetails = (job: Job) => {
    setSelectedJob(job)
    setDetailsOpen(true)
  }

  const handleCancelJob = (jobId: string) => {
    if (confirm('Are you sure you want to cancel this job?')) {
      cancelJobMutation.mutate(jobId)
    }
  }

  // Get logs from job metadata
  const getJobLogs = (job: Job): JobLog[] => {
    const metadata = job.metadata as Record<string, unknown> | undefined
    return (metadata?.logs as JobLog[]) || []
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Jobs</h1>
            <p className="text-muted-foreground mt-1">
              Monitor and manage background jobs
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mt-6">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="import">Import Traces</SelectItem>
                <SelectItem value="generate">Generate Eval</SelectItem>
                <SelectItem value="execute">Execute Eval</SelectItem>
                <SelectItem value="taskset_run">Taskset Run</SelectItem>
                <SelectItem value="agent_discovery">Agent Discovery</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1" />

          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-xl">
                <Loader2 className={`w-6 h-6 text-blue-500 ${activeJobs.length > 0 ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <div className="text-3xl font-bold">{activeJobs.length}</div>
                <div className="text-sm text-muted-foreground">Active Jobs</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <div className="text-3xl font-bold">{completedJobs.length}</div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/10 rounded-xl">
                <XCircle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <div className="text-3xl font-bold">{failedJobs.length}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Briefcase className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="text-3xl font-bold">{jobs.length}</div>
                <div className="text-sm text-muted-foreground">Total Jobs</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
          <CardDescription>
            Background jobs for imports, evals, and taskset runs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16 bg-muted/20 rounded-lg border-2 border-dashed">
              <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold mb-2">No jobs found</h3>
              <p className="text-muted-foreground">Jobs will appear here when you import traces, generate evals, or run tasksets</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => {
                const logs = getJobLogs(job)
                const lastLog = logs[logs.length - 1]
                const metadata = job.metadata as Record<string, unknown> | undefined
                const statusMessage = metadata?.statusMessage as string | undefined

                return (
                  <div
                    key={job.id}
                    className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          {getStatusIcon(job.status as JobStatus)}
                          <Badge variant={getStatusBadgeVariant(job.status as JobStatus)}>
                            {job.status}
                          </Badge>
                          <Badge variant="outline">
                            {getJobTypeLabel(job.type)}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatRelativeTime(job.created_at)}
                          </span>
                        </div>

                        <div className="text-sm text-muted-foreground mb-2 font-mono">
                          {job.id}
                        </div>

                        {/* Progress bar for running jobs */}
                        {(job.status === 'running' || job.status === 'queued') && (
                          <div className="space-y-1 mb-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                {statusMessage || 'Processing...'}
                              </span>
                              <span className="font-medium">{job.progress}%</span>
                            </div>
                            <Progress value={job.progress} className="h-2" />
                          </div>
                        )}

                        {/* Error message for failed jobs */}
                        {job.status === 'failed' && job.error && (
                          <div className="text-sm text-destructive bg-destructive/10 p-2 rounded mt-2">
                            {job.error}
                          </div>
                        )}

                        {/* Last log message */}
                        {lastLog && job.status === 'running' && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Latest: {lastLog.message}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(job)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Details
                        </Button>
                        {(job.status === 'running' || job.status === 'queued') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelJob(job.id)}
                            disabled={cancelJobMutation.isPending}
                          >
                            <StopCircle className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Job Details</DialogTitle>
            <DialogDescription>
              {selectedJob && (
                <span className="font-mono text-xs">{selectedJob.id}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedJob && (
            <div className="space-y-4 px-6 pb-6">
              {/* Status & Type */}
              <div className="flex items-center gap-3">
                {getStatusIcon(selectedJob.status as JobStatus)}
                <Badge variant={getStatusBadgeVariant(selectedJob.status as JobStatus)}>
                  {selectedJob.status}
                </Badge>
                <Badge variant="outline">
                  {getJobTypeLabel(selectedJob.type)}
                </Badge>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <span className="ml-2">{new Date(selectedJob.created_at).toLocaleString()}</span>
                </div>
                {selectedJob.started_at && (
                  <div>
                    <span className="text-muted-foreground">Started:</span>
                    <span className="ml-2">{new Date(selectedJob.started_at).toLocaleString()}</span>
                  </div>
                )}
                {selectedJob.completed_at && (
                  <div>
                    <span className="text-muted-foreground">Completed:</span>
                    <span className="ml-2">{new Date(selectedJob.completed_at).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Progress */}
              {(selectedJob.status === 'running' || selectedJob.status === 'queued') && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Progress</span>
                    <span>{selectedJob.progress}%</span>
                  </div>
                  <Progress value={selectedJob.progress} />
                </div>
              )}

              {/* Error */}
              {selectedJob.error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <h4 className="font-medium text-destructive mb-1">Error</h4>
                  <p className="text-sm text-destructive/90">{selectedJob.error}</p>
                </div>
              )}

              {/* Logs */}
              {(() => {
                const logs = getJobLogs(selectedJob)
                if (logs.length === 0) return null

                return (
                  <div>
                    <h4 className="font-medium mb-2">Logs ({logs.length})</h4>
                    <div className="bg-muted rounded-lg p-3 max-h-60 overflow-y-auto font-mono text-xs space-y-1">
                      {logs.map((log, idx) => (
                        <div key={idx} className="flex gap-2">
                          <span className="text-muted-foreground shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span className={
                            log.level === 'error' ? 'text-destructive' :
                            log.level === 'warn' ? 'text-warning' :
                            'text-foreground'
                          }>
                            {log.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Result */}
              {selectedJob.result && (
                <div>
                  <h4 className="font-medium mb-2">Result</h4>
                  <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto">
                    {JSON.stringify(selectedJob.result, null, 2)}
                  </pre>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                {(selectedJob.status === 'running' || selectedJob.status === 'queued') && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      handleCancelJob(selectedJob.id)
                      setDetailsOpen(false)
                    }}
                  >
                    <StopCircle className="w-4 h-4 mr-2" />
                    Cancel Job
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
