'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Plus, AlertCircle, Bot } from 'lucide-react'
import Link from 'next/link'
import { formatRelativeTime, getStatusColor } from '@/lib/utils'
import { CreateAgentModal } from '@/components/modals/create-agent-modal'
import { AgentsGridSkeleton } from '@/components/skeletons/agents-skeleton'
import type { AgentStatus } from '@/types/agent'

function getAgentStatusColor(status: AgentStatus): string {
  switch (status) {
    case 'confirmed':
      return 'text-green-600 bg-green-50'
    case 'discovered':
      return 'text-yellow-600 bg-yellow-50'
    case 'archived':
      return 'text-gray-600 bg-gray-50'
    default:
      return 'text-gray-600 bg-gray-50'
  }
}

export default function AgentsPage() {
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.listAgents(),
  })

  return (
    <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="agents-page-title">Agents</h1>
          <p className="text-muted-foreground">
            Manage AI agents and their prompt versions
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} data-testid="create-agent-button">
          <Plus className="w-4 h-4 mr-2" />
          Create Agent
        </Button>
      </div>

      {data && data.pending_discoveries > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3" data-testid="pending-discoveries-banner">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800" data-testid="pending-discoveries-count">
              {data.pending_discoveries} pending {data.pending_discoveries === 1 ? 'discovery' : 'discoveries'}
            </p>
            <p className="text-xs text-yellow-700">
              New agents have been discovered from traces. Review and confirm them below.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <AgentsGridSkeleton count={6} />
      ) : error ? (
        <ErrorState
          title="Failed to load agents"
          message="There was an error loading agents. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="agents-grid">
          {data?.agents.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`} data-testid={`agent-card-link-${agent.id}`}>
              <Card interactive className="p-6 group" data-testid={`agent-card-${agent.id}`}>
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg group-hover:text-primary transition-colors" data-testid="agent-card-name">
                    {agent.name}
                  </h3>
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${getAgentStatusColor(agent.status)}`} data-testid="agent-card-status">
                    {agent.status}
                  </span>
                </div>

                {agent.description && (
                  <p className="text-sm text-muted-foreground mb-4" data-testid="agent-card-description">
                    {agent.description}
                  </p>
                )}

                {agent.active_version ? (
                  <div className="mb-4" data-testid="agent-card-active-version">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Active version:</span>
                      <span className="font-medium">v{agent.active_version.version}</span>
                    </div>
                    {agent.active_version.accuracy !== null && (
                      <div className="flex items-center gap-2 text-sm mt-1">
                        <span className="text-muted-foreground">Accuracy:</span>
                        <span className="font-medium">{Math.round(agent.active_version.accuracy * 100)}%</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mb-4" data-testid="agent-card-no-version">
                    <span className="text-sm text-muted-foreground italic">No active version</span>
                  </div>
                )}

                <p className="text-xs text-muted-foreground" data-testid="agent-card-updated">
                  Updated {formatRelativeTime(agent.updated_at)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {data && data.agents.length === 0 && (
        <div className="text-center py-12 bg-card rounded-lg border" data-testid="empty-agents-state">
          <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-4" data-testid="empty-state-icon" />
          <h3 className="text-lg font-medium mb-2" data-testid="empty-state-title">No agents yet</h3>
          <p className="text-muted-foreground mb-4 max-w-md mx-auto" data-testid="empty-state-description">
            Create your first agent to start evaluating AI responses and generating eval functions.
          </p>
          <Button onClick={() => setCreateModalOpen(true)} data-testid="empty-state-create-button">
            <Plus className="w-4 h-4 mr-2" />
            Create your first agent
          </Button>
        </div>
      )}

      <CreateAgentModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
    </div>
  )
}
