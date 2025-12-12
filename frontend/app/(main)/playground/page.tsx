'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@/hooks/use-router-with-progress'
import { apiClient } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { Gamepad2, Bot, Clock, MessageSquare, ExternalLink } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useState } from 'react'
import Link from 'next/link'

// Format date to relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Get model display name
function getModelLabel(provider: string, modelId: string): string {
  const modelMap: Record<string, string> = {
    // Claude 4.5 series (primary)
    'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5',
    'claude-haiku-4-5-20250929': 'Claude Haiku 4.5',
    'claude-opus-4-5-20251101': 'Claude Opus 4.5',
  }
  return modelMap[modelId] || modelId
}

export default function PlaygroundPage() {
  const router = useRouter()
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')

  const { data: agentsData, isLoading: agentsLoading, error: agentsError, refetch: refetchAgents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.listAgents(),
  })

  const { data: sessionsData, isLoading: sessionsLoading, error: sessionsError, refetch: refetchSessions } = useQuery({
    queryKey: ['all-playground-sessions'],
    queryFn: () => apiClient.listAllPlaygroundSessions(),
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  const handleAgentSelect = (agentId: string) => {
    setSelectedAgentId(agentId)
    router.push(`/agents/${agentId}/playground`)
  }

  const sessions = sessionsData?.sessions || []

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Gamepad2 className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="playground-page-title">
            Playground
          </h1>
        </div>
        <p className="text-muted-foreground">
          Test and interact with your agents in real-time
        </p>
      </div>

      <div className="grid gap-6">
        {/* New Session Card */}
        {agentsLoading ? (
          <Card className="p-6">
            <div className="space-y-4">
              <div className="h-4 bg-muted animate-pulse rounded w-1/4" />
              <div className="h-10 bg-muted animate-pulse rounded" />
            </div>
          </Card>
        ) : agentsError ? (
          <ErrorState
            title="Failed to load agents"
            message="There was an error loading agents. Please try again."
            error={agentsError as Error}
            onRetry={() => refetchAgents()}
          />
        ) : agentsData && agentsData.agents.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No agents available</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Create an agent first to start using the playground.
              </p>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Start a new session
                </label>
                <Select value={selectedAgentId} onValueChange={handleAgentSelect}>
                  <SelectTrigger className="w-full" data-testid="agent-selector">
                    <SelectValue placeholder="Choose an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {agentsData?.agents
                      .filter(agent => agent.status === 'confirmed')
                      .map((agent) => (
                        <SelectItem
                          key={agent.id}
                          value={agent.id}
                          data-testid={`agent-option-${agent.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            <span className="font-medium">{agent.name}</span>
                            {agent.active_version && (
                              <span className="text-xs text-muted-foreground">
                                (v{agent.active_version.version})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {agentsData && agentsData.agents.filter(agent => agent.status === 'confirmed').length === 0 && (
                <div className="p-4 bg-warning/10 border border-warning rounded-lg">
                  <p className="text-sm text-warning">
                    No confirmed agents available. Please confirm at least one agent to use the playground.
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Recent Sessions */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Sessions</h2>
          {sessionsLoading ? (
            <Card className="p-4">
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-lg border">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </Card>
          ) : sessionsError ? (
            <ErrorState
              title="Failed to load sessions"
              message="There was an error loading sessions. Please try again."
              error={sessionsError as Error}
              onRetry={() => refetchSessions()}
            />
          ) : sessions.length === 0 ? (
            <Card className="p-8">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <h3 className="text-lg font-medium mb-2">No sessions yet</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Start a new session by selecting an agent above.
                </p>
              </div>
            </Card>
          ) : (
            <Card className="divide-y">
              {sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/agents/${session.agentId}/playground?session=${session.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors group"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{session.agentName}</span>
                      <span className="text-xs text-muted-foreground">
                        {getModelLabel(session.modelProvider, session.modelId)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {session.messageCount} messages
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(session.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </Card>
          )}
        </div>

        {/* About Section */}
        <Card className="p-6">
          <h3 className="text-sm font-medium mb-2">About the Playground</h3>
          <p className="text-sm text-muted-foreground">
            The playground allows you to test your agents with different prompts,
            variables, and configurations. You can try different model providers
            and see how your agent responds in real-time.
          </p>
        </Card>
      </div>
    </div>
  )
}
