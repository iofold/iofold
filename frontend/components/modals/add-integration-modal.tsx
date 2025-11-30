'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

interface AddIntegrationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddIntegrationModal({ open, onOpenChange }: AddIntegrationModalProps) {
  const [platform, setPlatform] = useState<'langfuse' | 'langsmith' | 'openai'>('langfuse')
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: { platform: 'langfuse' | 'langsmith' | 'openai'; name: string; api_key: string; base_url?: string }) =>
      apiClient.createIntegration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integration added successfully')
      onOpenChange(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add integration')
    },
  })

  const resetForm = () => {
    setName('')
    setApiKey('')
    setBaseUrl('')
    setPlatform('langfuse')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      platform,
      name,
      api_key: apiKey,
      base_url: baseUrl || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Integration</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="platform">Platform</Label>
              <Select value={platform} onValueChange={(v: any) => setPlatform(v)}>
                <SelectTrigger id="platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="langfuse">Langfuse</SelectItem>
                  <SelectItem value="langsmith">Langsmith</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Integration"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_key">API Key</Label>
              <Input
                id="api_key"
                name="api_key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="base_url">Base URL (optional)</Label>
              <Input
                id="base_url"
                name="base_url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://cloud.langfuse.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} loading={createMutation.isPending}>
              {createMutation.isPending ? 'Adding...' : 'Add Integration'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
