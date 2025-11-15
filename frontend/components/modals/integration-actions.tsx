'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Trash2, TestTube2 } from 'lucide-react'

interface IntegrationActionsProps {
  integrationId: string
}

export function IntegrationActions({ integrationId }: IntegrationActionsProps) {
  const queryClient = useQueryClient()

  const testMutation = useMutation({
    mutationFn: () => apiClient.testIntegration(integrationId),
    onSuccess: (data: { status: string; error_message?: string }) => {
      if (data.status === 'success') {
        toast.success('Integration test successful')
      } else {
        toast.error(data.error_message || 'Integration test failed')
      }
    },
    onError: () => {
      toast.error('Failed to test integration')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteIntegration(integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integration deleted')
    },
    onError: () => {
      toast.error('Failed to delete integration')
    },
  })

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => testMutation.mutate()}
        disabled={testMutation.isPending}
      >
        <TestTube2 className="w-4 h-4 mr-1" />
        {testMutation.isPending ? 'Testing...' : 'Test'}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => deleteMutation.mutate()}
        disabled={deleteMutation.isPending}
      >
        <Trash2 className="w-4 h-4 mr-1" />
        {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
      </Button>
    </div>
  )
}
