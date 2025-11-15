'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, APIError } from '@/lib/api-client'
import type { CreateIntegrationRequest } from '@/types/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

interface AddIntegrationModalProps {
  children: React.ReactNode
}

export function AddIntegrationModal({ children }: AddIntegrationModalProps) {
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<CreateIntegrationRequest>({
    platform: 'langfuse',
    api_key: '',
    base_url: 'https://cloud.langfuse.com',
    name: '',
  })
  const [error, setError] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: CreateIntegrationRequest) => apiClient.createIntegration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      setOpen(false)
      resetForm()
    },
    onError: (err: APIError) => {
      setError(err.message || 'Failed to create integration')
    },
  })

  const resetForm = () => {
    setFormData({
      platform: 'langfuse',
      api_key: '',
      base_url: 'https://cloud.langfuse.com',
      name: '',
    })
    setError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Basic validation
    if (!formData.api_key.trim()) {
      setError('API Key is required')
      return
    }

    // For Langfuse, we need both public and secret keys
    // The api_key field will contain the format: "public_key:secret_key"
    if (formData.platform === 'langfuse') {
      const parts = formData.api_key.split(':')
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        setError('Langfuse requires both Public Key and Secret Key')
        return
      }
    }

    mutation.mutate(formData)
  }

  const handleLangfuseKeyChange = (type: 'public' | 'secret', value: string) => {
    const parts = formData.api_key.split(':')
    if (type === 'public') {
      setFormData({ ...formData, api_key: `${value}:${parts[1] || ''}` })
    } else {
      setFormData({ ...formData, api_key: `${parts[0] || ''}:${value}` })
    }
  }

  const langfuseKeys = formData.api_key.split(':')
  const publicKey = langfuseKeys[0] || ''
  const secretKey = langfuseKeys[1] || ''

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Integration</DialogTitle>
            <DialogDescription>
              Connect your observability platform to import traces
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 px-6">
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="platform">Platform</Label>
              <Select
                id="platform"
                value={formData.platform}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    platform: e.target.value as 'langfuse' | 'langsmith' | 'openai',
                  })
                }
                disabled={mutation.isPending}
              >
                <option value="langfuse">Langfuse</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                placeholder="My Langfuse Integration"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={mutation.isPending}
              />
            </div>

            {formData.platform === 'langfuse' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="public-key">
                    Public Key <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="public-key"
                    type="text"
                    placeholder="pk-lf-..."
                    value={publicKey}
                    onChange={(e) => handleLangfuseKeyChange('public', e.target.value)}
                    disabled={mutation.isPending}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="secret-key">
                    Secret Key <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="secret-key"
                    type="password"
                    placeholder="sk-lf-..."
                    value={secretKey}
                    onChange={(e) => handleLangfuseKeyChange('secret', e.target.value)}
                    disabled={mutation.isPending}
                    required
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="base-url">Base URL</Label>
              <Input
                id="base-url"
                type="url"
                placeholder="https://cloud.langfuse.com"
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                disabled={mutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Leave default for Langfuse Cloud, or enter your self-hosted URL
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating...' : 'Create Integration'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
