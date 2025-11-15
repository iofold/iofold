'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useJobMonitor } from '@/hooks/use-job-monitor'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getStatusColor } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import type { JobResponse } from '@/types/api'

interface ImportTracesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportTracesModal({ open, onOpenChange }: ImportTracesModalProps) {
  const queryClient = useQueryClient()
  const [integrationId, setIntegrationId] = useState('')
  const [limit, setLimit] = useState('100')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)

  // Use the job monitor hook for SSE + polling fallback
  const { job: jobData, isStreaming, isPolling, isSSEActive, stop: stopMonitoring } = useJobMonitor(jobId, {
    autoStart: true,
    onProgress: (update) => {
      console.log('[ImportTracesModal] Job progress:', update)
    },
    onCompleted: (result) => {
      console.log('[ImportTracesModal] Import completed:', result)
      // Refetch traces list
      queryClient.invalidateQueries({ queryKey: ['traces'] })
    },
    onFailed: (error, details) => {
      console.error('[ImportTracesModal] Import failed:', error, details)
    },
    onOpen: () => {
      console.log('[ImportTracesModal] SSE connection established')
    },
  })

  // Fetch integrations
  const { data: integrationsData, isLoading: loadingIntegrations } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiClient.listIntegrations(),
    enabled: open,
  })

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      const limitNum = parseInt(limit, 10)
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
        throw new Error('Limit must be between 1 and 1000')
      }

      const filters: any = { limit: limitNum }
      if (dateFrom) filters.date_from = dateFrom
      if (dateTo) filters.date_to = dateTo

      const result: JobResponse = await apiClient.importTraces({
        integration_id: integrationId,
        filters,
      })

      return result
    },
    onSuccess: (data) => {
      // Set the job ID - this will trigger the useJobMonitor hook to start monitoring
      setJobId(data.job_id)
    },
    onError: (error: any) => {
      console.error('Import failed:', error)
    },
  })

  // Clean up monitoring when modal closes
  useEffect(() => {
    if (!open) {
      stopMonitoring()
    }
  }, [open, stopMonitoring])


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!integrationId) {
      return
    }
    importMutation.mutate()
  }

  const handleClose = () => {
    // Stop monitoring
    stopMonitoring()

    // Reset state when closing
    if (!importMutation.isPending && !isStreaming) {
      setIntegrationId('')
      setLimit('100')
      setDateFrom('')
      setDateTo('')
      setJobId(null)
      importMutation.reset()
      onOpenChange(false)
    }
  }

  const canSubmit = !importMutation.isPending && !isStreaming && !!integrationId
  const isProcessing = importMutation.isPending || isStreaming

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Traces</DialogTitle>
          <DialogDescription>
            Import traces from your connected integration
          </DialogDescription>
        </DialogHeader>

        {/* Show job status if import started */}
        {jobId && (
          <div className="my-4 p-4 rounded-lg border bg-muted/50">
            <div className="flex items-center gap-2 mb-2">
              {jobData?.status === 'completed' && (
                <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
              )}
              {jobData?.status === 'failed' && (
                <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
              )}
              {(jobData?.status === 'running' || jobData?.status === 'queued') && (
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" />
              )}
              <span className="font-medium">Import Status</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Job ID:</span>
                <span className="font-mono text-xs">{jobId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className={getStatusColor(jobData?.status || 'queued')}>
                  {jobData?.status || 'queued'}
                </span>
              </div>
              {jobData?.progress !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Progress:</span>
                  <span>{jobData.progress}%</span>
                </div>
              )}
              {isStreaming && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Connection:</span>
                  <span className="text-xs">
                    {isSSEActive && <span className="text-green-600">Real-time (SSE)</span>}
                    {isPolling && <span className="text-yellow-600">Polling fallback</span>}
                    {!isSSEActive && !isPolling && <span className="text-gray-500">Connecting...</span>}
                  </span>
                </div>
              )}
              {jobData?.error && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-800">
                  {jobData.error}
                </div>
              )}
              {jobData?.status === 'completed' && jobData?.result && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-green-800">
                  Successfully imported {jobData.result.imported_count || 0} traces
                </div>
              )}
            </div>
          </div>
        )}

        {/* Import form - hide if job is running/completed */}
        {!jobId && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="integration">Integration *</Label>
              {loadingIntegrations ? (
                <div className="text-sm text-muted-foreground">Loading integrations...</div>
              ) : integrationsData?.integrations.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No integrations found. Please add an integration first.
                </div>
              ) : (
                <Select value={integrationId} onValueChange={setIntegrationId} required>
                  <SelectTrigger id="integration">
                    <SelectValue placeholder="Select integration..." />
                  </SelectTrigger>
                  <SelectContent>
                    {integrationsData?.integrations.map((integration) => (
                      <SelectItem key={integration.id} value={integration.id}>
                        {integration.name} ({integration.platform})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="limit">Limit *</Label>
              <Input
                id="limit"
                type="number"
                min="1"
                max="1000"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="100"
                required
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of traces to import (1-1000)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateFrom">Date From</Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateTo">Date To</Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {importMutation.isError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">Import failed</p>
                  <p className="text-xs mt-1">
                    {importMutation.error instanceof Error
                      ? importMutation.error.message
                      : 'An error occurred during import'}
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {importMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Import Traces
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Close button when job is done */}
        {jobId && ['completed', 'failed', 'cancelled'].includes(jobData?.status || '') && (
          <DialogFooter>
            <Button onClick={handleClose}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
