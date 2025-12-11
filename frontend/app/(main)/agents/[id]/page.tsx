'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { ArrowLeft, Plus, ChevronDown, ChevronUp, CheckCircle, XCircle, Play, Sparkles, Zap, History, X } from 'lucide-react'
import Link from 'next/link'
import { formatRelativeTime, formatPercentage } from '@/lib/utils'
import { CreateAgentVersionModal } from '@/components/modals/create-agent-version-modal'
import { GEPAOptimizationModal } from '@/components/modals/gepa-optimization-modal'
import { AttachToolModal } from '@/components/modals/attach-tool-modal'
import { toast } from 'sonner'
import type { AgentVersionStatus, AgentVersionSource, Tool } from '@/types/agent'

function getVersionStatusColor(status: AgentVersionStatus): string {
  switch (status) {
    case 'active':
      return 'text-success bg-success/10'
    case 'candidate':
      return 'text-info bg-info/10'
    case 'rejected':
      return 'text-destructive bg-destructive/10'
    case 'archived':
      return 'text-muted-foreground bg-muted'
    default:
      return 'text-muted-foreground bg-muted'
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

function getCategoryBadgeColor(category: Tool['category']): string {
  switch (category) {
    case 'email':
      return 'bg-blue-100 text-blue-800'
    case 'code':
      return 'bg-purple-100 text-purple-800'
    case 'filesystem':
      return 'bg-green-100 text-green-800'
    case 'general':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export default function AgentDetailPage() {
  const params = useParams()
  const agentId = params.id as string
  const [createVersionModalOpen, setCreateVersionModalOpen] = useState(false)
  const [gepaOptimizationModalOpen, setGepaOptimizationModalOpen] = useState(false)
  const [attachToolModalOpen, setAttachToolModalOpen] = useState(false)
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set())
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: agent, isLoading, error, refetch } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => apiClient.getAgent(agentId),
  })

  const { data: toolsData, refetch: refetchTools } = useQuery({
    queryKey: ['agent-tools', agentId],
    queryFn: () => apiClient.getAgentTools(agentId),
    enabled: !!agentId,
  })

  const promoteMutation = useMutation({
    mutationFn: ({ version }: { version: number }) =>
      apiClient.promoteAgentVersion(agentId, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
      toast.success('Version promoted successfully')
    },
    onError: () => {
      toast.error('Failed to promote version')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ version }: { version: number }) =>
      apiClient.rejectAgentVersion(agentId, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
      toast.success('Version rejected')
    },
    onError: () => {
      toast.error('Failed to reject version')
    },
  })

  const detachToolMutation = useMutation({
    mutationFn: (toolId: string) => apiClient.detachToolFromAgent(agentId, toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tools', agentId] })
      toast.success('Tool detached')
    },
    onError: () => {
      toast.error('Failed to detach tool')
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
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-muted rounded animate-pulse" />
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
                agent.status === 'confirmed' ? 'text-success bg-success/10' :
                agent.status === 'discovered' ? 'text-warning bg-warning/10' :
                'text-muted-foreground bg-muted'
              }`}>
                {agent.status}
              </span>
            </div>
            {agent.description && (
              <p className="text-muted-foreground">{agent.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Link href={`/agents/${agentId}/playground`}>
              <Button variant="outline">
                <Play className="w-4 h-4 mr-2" />
                Playground
              </Button>
            </Link>
            <Link href={`/agents/${agentId}/evals`}>
              <Button variant="outline">
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Eval
              </Button>
            </Link>
            <Link href={`/agents/${agentId}/gepa`}>
              <Button variant="outline">
                <History className="w-4 h-4 mr-2" />
                GEPA Dashboard
              </Button>
            </Link>
            <Button variant="outline" onClick={() => setGepaOptimizationModalOpen(true)}>
              <Zap className="w-4 h-4 mr-2" />
              Optimize Prompt
            </Button>
            <Button onClick={() => setCreateVersionModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Version
            </Button>
          </div>
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

      {/* Tools Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Tools</h2>
          <Button onClick={() => setAttachToolModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Attach Tool
          </Button>
        </div>

        {!toolsData || toolsData.tools.length === 0 ? (
          <Card className="p-8">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">No tools attached yet</p>
              <Button onClick={() => setAttachToolModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Attach your first tool
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {toolsData.tools.map((tool) => (
              <Card key={tool.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm mb-1">{tool.name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getCategoryBadgeColor(tool.category)}`}>
                      {tool.category}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => detachToolMutation.mutate(tool.id)}
                    disabled={detachToolMutation.isPending}
                    className="h-6 w-6 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{tool.description}</p>
              </Card>
            ))}
          </div>
        )}
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
                        {isActive ? (
                          <span className="px-2 py-1 text-xs rounded-full font-medium text-info bg-info/10">
                            Active
                          </span>
                        ) : (
                          <span className={`px-2 py-1 text-xs rounded-full font-medium ${getVersionStatusColor(version.status)}`}>
                            {version.status}
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
                                className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground font-mono"
                              >
                                {variable}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {isExpanded && (
                        <div className="mt-3 p-3 bg-muted rounded border">
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
        agentId={agentId}
      />

      <GEPAOptimizationModal
        open={gepaOptimizationModalOpen}
        onOpenChange={setGepaOptimizationModalOpen}
        agentId={agentId}
      />

      <AttachToolModal
        open={attachToolModalOpen}
        onOpenChange={setAttachToolModalOpen}
        agentId={agentId}
        attachedToolIds={toolsData?.tools.map(t => t.id) || []}
      />
    </div>
  )
}
