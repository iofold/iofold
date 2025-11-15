'use client'

import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
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
  const [jobStatus, setJobStatus] = useState<'pending' | 'running' | 'completed' | 'failed' | null>(null)
  const [progress, setProgress] = useState(0)

  const importMutation = useMutation({
    mutationFn: (data: { integration_id: string; limit?: number }) =>
      apiClient.importTraces(data),
    onSuccess: (data) => {
      if (data.job_id) {
        setJobId(data.job_id)
        setJobStatus('pending')
        toast.success('Import started')
      }
    },
    onError: () => {
      toast.error('Failed to start import')
    },
  })

  // Poll job status
  useEffect(() => {
    if (!jobId || jobStatus === 'completed' || jobStatus === 'failed') return

    const interval = setInterval(async () => {
      try {
        const job = await apiClient.getJob(jobId)
        setJobStatus(job.status as any)
        setProgress(job.progress || 0)

        if (job.status === 'completed') {
          toast.success(`Imported ${job.result?.imported_count || 0} traces`)
          clearInterval(interval)
          setTimeout(() => onOpenChange(false), 2000)
        } else if (job.status === 'failed') {
          toast.error(job.error || 'Import failed')
          clearInterval(interval)
        }
      } catch (error) {
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [jobId, jobStatus, onOpenChange])

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
              <Select
                id="integration"
                value={integrationId}
                onChange={(e) => setIntegrationId(e.target.value)}
                required
              >
                <option value="">Select integration</option>
                {integrations.map((int) => (
                  <option key={int.id} value={int.id}>
                    {int.platform} - {int.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit">Limit (optional)</Label>
              <Input
                id="limit"
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
                <p className="text-sm text-muted-foreground">
                  Status: {jobStatus}
                </p>
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
