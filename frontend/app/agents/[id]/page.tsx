'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { ArrowLeft, Plus, ChevronDown, ChevronUp, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import { formatRelativeTime, formatPercentage } from '@/lib/utils'
import { CreateAgentVersionModal } from '@/components/modals/create-agent-version-modal'
import { toast } from 'sonner'
import type { AgentVersionStatus, AgentVersionSource } from '@/types/agent'

function getVersionStatusColor(status: AgentVersionStatus): string {
  switch (status) {
    case 'active':
      return 'text-green-600 bg-green-50'
    case 'candidate':
      return 'text-blue-600 bg-blue-50'
    case 'rejected':
      return 'text-red-600 bg-red-50'
    case 'archived':
      return 'text-gray-600 bg-gray-50'
    default:
      return 'text-gray-600 bg-gray-50'
  }
}

function getVersionSourceBadge(source: AgentVersionSource): string {
  switch (source) {
    case 'discovered':
      return '🔍 Discovered'
    case 'manual':
      return '✍️ Manual'
    case 'ai_improved':
      return '✨ AI Improved'
    default:
      return source
  }
}

interface AgentDetailPageProps {
  params: {
    id: string
  }
}

export default function AgentDetailPage({ params }: AgentDetailPageProps) {
  const [createVersionModalOpen, setCreateVersionModalOpen] = useState(false)
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set())
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: agent, isLoading, error, refetch } = useQuery({
    queryKey: ['agent', params.id],
    queryFn: () => apiClient.getAgent(params.id),
  })

  const promoteMutation = useMutation({
    mutationFn: ({ version }: { version: number }) =>
      apiClient.promoteAgentVersion(params.id, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', params.id] })
      toast.success('Version promoted successfully')
    },
    onError: () => {
      toast.error('Failed to promote version')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ version }: { version: number }) =>
      apiClient.rejectAgentVersion(params.id, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', params.id] })
      toast.success('Version rejected')
    },
    onError: () => {
      toast.error('Failed to reject version')
    },
  })

  const toggleVersionExpanded = (versionId: string) => {
    setExpandedVersions((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(versionId)) {
        newSet.delete(versionId)
      } else {
        newSet.add(versionId)
      }
      return newSet
    })
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState
          title="Failed to load agent"
          message="There was an error loading the agent details. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Agents
          </Button>
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{agent.name}</h1>
              <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                agent.status === 'confirmed' ? 'text-green-600 bg-green-50' :
                agent.status === 'discovered' ? 'text-yellow-600 bg-yellow-50' :
                'text-gray-600 bg-gray-50'
              }`}>
                {agent.status}
              </span>
            </div>
            {agent.description && (
              <p className="text-muted-foreground">{agent.description}</p>
            )}
          </div>
          <Button onClick={() => setCreateVersionModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Version
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{agent.metrics.trace_count}</div>
            <p className="text-xs text-muted-foreground">Traces</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{agent.metrics.feedback_count}</div>
            <p className="text-xs text-muted-foreground">Feedback</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{agent.metrics.eval_count}</div>
            <p className="text-xs text-muted-foreground">Evals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {agent.metrics.accuracy !== null ? formatPercentage(agent.metrics.accuracy) : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">Accuracy</p>
          </CardContent>
        </Card>
      </div>

      {/* Versions List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Versions</h2>
        <div className="space-y-3">
          {agent.versions.length === 0 ? (
            <Card className="p-8">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">No versions yet</p>
                <Button onClick={() => setCreateVersionModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create first version
                </Button>
              </div>
            </Card>
          ) : (
            agent.versions.map((version) => {
              const isExpanded = expandedVersions.has(version.id)
              const isActive = version.id === agent.active_version_id
              const isCandidate = version.status === 'candidate'

              return (
                <Card key={version.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">Version {version.version}</h3>
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${getVersionStatusColor(version.status)}`}>
                          {version.status}
                        </span>
                        {isActive && (
                          <span className="px-2 py-1 text-xs rounded-full font-medium text-blue-600 bg-blue-50">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex gap-4 text-sm text-muted-foreground mb-3">
                        <span>{getVersionSourceBadge(version.source)}</span>
                        {version.accuracy !== null && (
                          <span>Accuracy: {formatPercentage(version.accuracy)}</span>
                        )}
                        <span>Created {formatRelativeTime(version.created_at)}</span>
                      </div>

                      {version.variables.length > 0 && (
                        <div className="mb-3">
                          <p className="text-sm text-muted-foreground mb-1">Variables:</p>
                          <div className="flex flex-wrap gap-2">
                            {version.variables.map((variable) => (
                              <span
                                key={variable}
                                className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 font-mono"
                              >
                                {variable}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {isExpanded && (
                        <div className="mt-3 p-3 bg-gray-50 rounded border">
                          <p className="text-xs text-muted-foreground mb-2">Prompt Template:</p>
                          <pre className="text-xs whitespace-pre-wrap font-mono">
                            {version.prompt_template}
                          </pre>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {isCandidate && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => promoteMutation.mutate({ version: version.version })}
                            disabled={promoteMutation.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Promote
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rejectMutation.mutate({ version: version.version })}
                            disabled={rejectMutation.isPending}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleVersionExpanded(version.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })
          )}
        </div>
      </div>

      <CreateAgentVersionModal
        open={createVersionModalOpen}
        onOpenChange={setCreateVersionModalOpen}
        agentId={params.id}
      />
    </div>
  )
}
