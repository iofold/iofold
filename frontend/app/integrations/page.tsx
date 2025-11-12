'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export default function IntegrationsPage() {
  const { data, isLoading } = useQuery({
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
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Integration
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading...</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.integrations.map((integration) => (
            <Card key={integration.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold capitalize">{integration.platform}</h3>
                  <p className="text-sm text-muted-foreground">{integration.name}</p>
                </div>
                <span className={`px-2 py-1 text-xs rounded ${
                  integration.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {integration.status}
                </span>
              </div>
              {integration.last_synced_at && (
                <p className="text-xs text-muted-foreground">
                  Last synced: {new Date(integration.last_synced_at).toLocaleString()}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
