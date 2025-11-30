'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Plus, Plug } from 'lucide-react'
import { IntegrationListSkeleton } from '@/components/skeletons/integration-skeleton'
import { AddIntegrationModal } from '@/components/modals/add-integration-modal'
import { IntegrationActions } from '@/components/modals/integration-actions'

export default function IntegrationsPage() {
  const [addModalOpen, setAddModalOpen] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiClient.listIntegrations(),
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Integrations</h1>
          <p className="text-muted-foreground">
            Connect your observability platforms
          </p>
        </div>
        <Button onClick={() => setAddModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Integration
        </Button>
      </div>

      {isLoading ? (
        <IntegrationListSkeleton count={6} />
      ) : error ? (
        <ErrorState
          title="Failed to load integrations"
          message="There was an error loading your integrations. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.integrations.map((integration) => (
              <Card key={integration.id} className="p-6 hover:shadow-md transition-all duration-200" data-testid={`integration-card-${integration.id}`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold capitalize">{integration.platform}</h3>
                    <p className="text-sm text-muted-foreground" data-testid="integration-name">{integration.name}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                    integration.status === 'active'
                      ? 'bg-success/10 text-success'
                      : 'bg-error/10 text-error'
                  }`} data-testid="integration-status">
                    {integration.status}
                  </span>
                </div>
                {integration.last_synced_at && (
                  <p className="text-xs text-muted-foreground mb-4" suppressHydrationWarning>
                    Last synced: {new Date(integration.last_synced_at).toLocaleString()}
                  </p>
                )}
                <IntegrationActions integrationId={integration.id} />
              </Card>
            ))}
          </div>

          {data && data.integrations.length === 0 && (
            <div className="text-center py-12 bg-card rounded-lg border">
              <Plug className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No integrations connected</h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Connect your observability platform (Langfuse, Langsmith, or OpenAI) to import traces.
              </p>
              <Button onClick={() => setAddModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add your first integration
              </Button>
            </div>
          )}
        </>
      )}

      <AddIntegrationModal open={addModalOpen} onOpenChange={setAddModalOpen} />
    </div>
  )
}
