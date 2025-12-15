'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface LiveJobMonitorProps {
  jobId: string;
  jobType: 'import' | 'generate' | 'execute' | 'taskset_run';
  onComplete?: (result: any) => void;
  onFail?: (error: string) => void;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

/**
 * Map job type to user-friendly label
 */
function getJobTypeLabel(jobType: string): string {
  const labels: Record<string, string> = {
    import: 'Import Traces',
    generate: 'Generate Eval',
    execute: 'Execute Eval',
    taskset_run: 'Run Taskset',
  };
  return labels[jobType] || jobType;
}

/**
 * LiveJobMonitor component displays real-time progress and logs for a background job
 * Uses Server-Sent Events (SSE) to stream updates from the backend
 */
export function LiveJobMonitor({ jobId, jobType, onComplete, onFail }: LiveJobMonitorProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'running' | 'completed' | 'failed'>('running');
  const [error, setError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { hour12: false });
    } catch {
      return timestamp;
    }
  };

  // Fetch initial job state to load persisted logs for completed/failed jobs
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const job = await apiClient.getJob(jobId);
        // Set status and progress from initial state
        if (job.status === 'completed' || job.status === 'failed') {
          setStatus(job.status);
          setProgress(job.progress || (job.status === 'completed' ? 100 : 0));
          if (job.status === 'failed' && job.error) {
            setError(job.error);
          }
        }
        // Load logs from metadata
        const metadata = job.metadata as Record<string, unknown> | null;
        const persistedLogs = (metadata?.logs as LogEntry[]) || [];
        if (persistedLogs.length > 0) {
          setLogs(persistedLogs);
        }
      } catch (err) {
        console.error('Failed to load initial job state:', err);
      }
    };
    loadInitialState();
  }, [jobId]);

  useEffect(() => {
    // Connect to SSE stream using apiClient pattern
    const eventSource = apiClient.streamJob(jobId);
    eventSourceRef.current = eventSource;

    // Handle progress events
    eventSource.addEventListener('progress', (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data.progress);
      } catch (err) {
        console.error('Failed to parse progress event:', err);
      }
    });

    // Handle log events
    eventSource.addEventListener('log', (event) => {
      try {
        const data = JSON.parse(event.data);
        // Deduplicate by timestamp + message to avoid duplicates from SSE + metadata
        setLogs((prev) => {
          const isDuplicate = prev.some(
            (log) => log.timestamp === data.timestamp && log.message === data.message
          );
          if (isDuplicate) return prev;
          return [...prev, data];
        });
        // Auto-scroll to bottom
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
      } catch (err) {
        console.error('Failed to parse log event:', err);
      }
    });

    // Handle completion events
    eventSource.addEventListener('completed', (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus('completed');
        if (onComplete) {
          onComplete(data.result);
        }
        eventSource.close();
      } catch (err) {
        setStatus('completed');
        if (onComplete) {
          onComplete(null);
        }
        eventSource.close();
      }
    });

    // Handle failure events
    eventSource.addEventListener('failed', (event) => {
      try {
        const data = JSON.parse(event.data);
        const errorMessage = data.error || 'Job failed';
        setStatus('failed');
        setError(errorMessage);
        if (onFail) {
          onFail(errorMessage);
        }
        eventSource.close();
      } catch (err) {
        const errorMessage = 'Job failed';
        setStatus('failed');
        setError(errorMessage);
        if (onFail) {
          onFail(errorMessage);
        }
        eventSource.close();
      }
    });

    // Handle generic errors
    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('EventSource connection closed');
      }
    };

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [jobId, onComplete, onFail]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{getJobTypeLabel(jobType)}</CardTitle>
          <Badge
            variant={
              status === 'completed'
                ? 'default'
                : status === 'failed'
                ? 'destructive'
                : 'secondary'
            }
          >
            {status === 'running' && (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            )}
            {status === 'completed' && (
              <CheckCircle2 className="w-3 h-3 mr-1" />
            )}
            {status === 'failed' && (
              <AlertCircle className="w-3 h-3 mr-1" />
            )}
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm text-muted-foreground">Progress</span>
            <span className="text-sm font-medium">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>

        {/* Log Viewer */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Execution Log</h4>
          <div className="h-64 border rounded p-3 bg-muted/50 overflow-y-auto">
            <div className="space-y-2 text-sm">
              {logs.length === 0 && status === 'running' && (
                <div className="flex gap-2 items-center text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Waiting for updates...</span>
                </div>
              )}
              {logs.map((log, i) => (
                <div key={i} className="font-mono text-xs space-y-0.5">
                  <div className="flex gap-2 items-start">
                    <span className="text-muted-foreground shrink-0">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`h-5 shrink-0 ${
                        log.level === 'error'
                          ? 'border-destructive text-destructive'
                          : log.level === 'warn'
                          ? 'border-yellow-500 text-yellow-500'
                          : log.level === 'debug'
                          ? 'border-muted-foreground text-muted-foreground'
                          : ''
                      }`}
                    >
                      {log.level}
                    </Badge>
                    <span className="break-words flex-1">{log.message}</span>
                  </div>
                  {log.data && Object.keys(log.data).length > 0 && (
                    <div className="ml-20 text-muted-foreground bg-muted/50 rounded px-2 py-1">
                      {Object.entries(log.data).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-muted-foreground">{key}:</span>{' '}
                          <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {logs.length > 0 && status === 'running' && (
                <div className="flex gap-2 items-center text-muted-foreground pt-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Processing...</span>
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex gap-2 p-3 rounded bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="break-words">{error}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
