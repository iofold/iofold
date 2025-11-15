'use client'

import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useJobMonitor } from '@/hooks/use-job-monitor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'

interface ImportTracesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  integrations: Array<{ id: string; platform: string; name: string }>
}

export function ImportTracesModal({ open, onOpenChange, integrations }: ImportTracesModalProps) {
  const [integrationId, setIntegrationId] = useState('')
  const [limit, setLimit] = useState('10')
  const [jobId, setJobId] = useState<string | null>(null)

  // Use job monitor hook for SSE + polling fallback
  const { job: jobData, isStreaming, isPolling, isSSEActive, stop: stopMonitoring } = useJobMonitor(jobId, {
    autoStart: true,
    onProgress: (update) => {
      console.log('[ImportTracesModal (modals)] Job progress:', update)
    },
    onCompleted: (result) => {
      console.log('[ImportTracesModal (modals)] Import completed:', result)
      toast.success(`Successfully imported ${result?.imported_count || 0} traces`)
    },
    onFailed: (error, details) => {
      console.error('[ImportTracesModal (modals)] Import failed:', error, details)
      toast.error(`Import failed: ${error}`)
    },
    onOpen: () => {
      console.log('[ImportTracesModal (modals)] SSE connection established')
    },
  })

  const jobStatus = jobData?.status
  const progress = jobData?.progress || 0

  const importMutation = useMutation({
    mutationFn: (data: { integration_id: string; limit?: number }) =>
      apiClient.importTraces(data),
    onSuccess: (data) => {
      if (data.job_id) {
        setJobId(data.job_id)
        toast.success('Import started')
      }
    },
    onError: () => {
      toast.error('Failed to start import')
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
    importMutation.mutate({
      integration_id: integrationId,
      limit: parseInt(limit) || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Traces</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="integration">Integration</Label>
              <Select name="integration_id" value={integrationId} onValueChange={setIntegrationId}>
                <SelectTrigger id="integration">
                  <SelectValue placeholder="Select integration" />
                </SelectTrigger>
                <SelectContent>
                  {integrations.map((int) => (
                    <SelectItem key={int.id} value={int.id}>
                      {int.platform} - {int.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit">Limit (optional)</Label>
              <Input
                id="limit"
                name="limit"
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                min="1"
                max="100"
              />
            </div>
            {jobStatus && jobStatus !== 'completed' && (
              <div className="space-y-2">
                <Label>Progress</Label>
                <Progress value={progress} />
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Status: {jobStatus}
                  </p>
                  {isStreaming && (
                    <p className="text-xs">
                      {isSSEActive && <span className="text-green-600">Real-time (SSE)</span>}
                      {isPolling && <span className="text-yellow-600">Polling fallback</span>}
                      {!isSSEActive && !isPolling && <span className="text-gray-500">Connecting...</span>}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!integrationId || importMutation.isPending || jobStatus === 'running'}
            >
              {importMutation.isPending || jobStatus === 'running' ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
