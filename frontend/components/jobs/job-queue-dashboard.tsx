'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { JobRetryBadge } from './job-retry-badge';
import { RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Job {
  id: string;
  type: string;
  status: string;
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error?: string;
  error_category?: string;
  retry_count?: number;
  max_retries?: number;
}

interface JobQueueDashboardProps {
  workspaceId: string;
  refreshInterval?: number;
}

// API base URL from environment or default to localhost
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

export function JobQueueDashboard({ workspaceId, refreshInterval = 5000 }: JobQueueDashboardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0
  });

  const fetchJobs = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs?limit=20`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);

        // Calculate stats
        const newStats = { queued: 0, running: 0, completed: 0, failed: 0 };
        (data.jobs || []).forEach((job: Job) => {
          if (job.status in newStats) {
            newStats[job.status as keyof typeof newStats]++;
          }
        });
        setStats(newStats);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const handleRetry = async (jobId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/retry`, { method: 'POST' });
      if (response.ok) {
        fetchJobs(); // Refresh list
      }
    } catch (error) {
      console.error('Failed to retry job:', error);
    }
  };

  const getJobTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      import: 'Import Traces',
      generate: 'Generate Eval',
      execute: 'Execute Eval',
      agent_discovery: 'Discover Agents',
      prompt_improvement: 'Improve Prompt',
      prompt_evaluation: 'Evaluate Prompt',
      monitor: 'Monitor',
      auto_refine: 'Auto Refine'
    };
    return labels[type] || type;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Job Queue</CardTitle>
          <CardDescription>Background job processing status</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchJobs}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10">
            <Clock className="h-5 w-5 text-warning" />
            <div>
              <p className="text-2xl font-bold">{stats.queued}</p>
              <p className="text-xs text-muted-foreground">Queued</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10">
            <RefreshCw className="h-5 w-5 text-primary animate-spin" />
            <div>
              <p className="text-2xl font-bold">{stats.running}</p>
              <p className="text-xs text-muted-foreground">Running</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10">
            <CheckCircle className="h-5 w-5 text-success" />
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10">
            <XCircle className="h-5 w-5 text-error" />
            <div>
              <p className="text-2xl font-bold">{stats.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>
        </div>

        {/* Job List */}
        <div className="space-y-3">
          {loading ? (
            <p className="text-muted-foreground text-center py-4">Loading jobs...</p>
          ) : jobs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No jobs in queue</p>
          ) : (
            jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{getJobTypeLabel(job.type)}</span>
                    <JobRetryBadge
                      status={job.status}
                      retryCount={job.retry_count}
                      maxRetries={job.max_retries}
                      errorCategory={job.error_category}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{job.id.slice(0, 12)}...</span>
                    <span>{formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</span>
                  </div>
                  {job.status === 'running' && (
                    <Progress value={job.progress} className="h-1 mt-2" />
                  )}
                  {job.error && (
                    <p className="text-xs text-error mt-1 truncate max-w-md">{job.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {job.status === 'failed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRetry(job.id)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
