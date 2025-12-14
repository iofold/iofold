'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface LiveJobMonitorProps {
  jobId: string;
  jobType: 'import' | 'generate' | 'execute';
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: any;
}

/**
 * Map job type to user-friendly label
 */
function getJobTypeLabel(jobType: string): string {
  const labels: Record<string, string> = {
    import: 'Import Traces',
    generate: 'Generate Eval',
    execute: 'Execute Eval',
  };
  return labels[jobType] || jobType;
}

/**
 * LiveJobMonitor component displays real-time progress and logs for a background job
 * Uses Server-Sent Events (SSE) to stream updates from the backend
 */
export function LiveJobMonitor({ jobId, jobType }: LiveJobMonitorProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'running' | 'completed' | 'failed'>('running');
  const [error, setError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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
        setLogs((prev) => [...prev, data]);
        // Auto-scroll to bottom
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
      } catch (err) {
        console.error('Failed to parse log event:', err);
      }
    });

    // Handle completion events
    eventSource.addEventListener('completed', () => {
      setStatus('completed');
      eventSource.close();
    });

    // Handle failure events
    eventSource.addEventListener('failed', (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus('failed');
        setError(data.error || 'Job failed');
        eventSource.close();
      } catch (err) {
        setStatus('failed');
        setError('Job failed');
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
  }, [jobId]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{getJobTypeLabel(jobType)}</CardTitle>
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
            <div className="space-y-1 text-sm">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-2 font-mono text-xs">
                  <span className="text-muted-foreground shrink-0">
                    {log.timestamp}
                  </span>
                  <Badge
                    variant="outline"
                    className={`h-5 shrink-0 ${
                      log.level === 'error'
                        ? 'border-destructive text-destructive'
                        : log.level === 'warn'
                        ? 'border-yellow-500 text-yellow-500'
                        : ''
                    }`}
                  >
                    {log.level}
                  </Badge>
                  <span className="break-words">{log.message}</span>
                </div>
              ))}
              {status === 'running' && (
                <div className="flex gap-2 items-center text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Waiting for updates...</span>
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
