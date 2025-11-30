'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Wrench,
  Layers,
  Sparkles,
  AlertCircle,
  Calendar,
  Hash,
  Activity,
  Zap,
  User,
  Bot,
  Code2,
  FileJson,
  Eye,
  EyeOff,
  Timer,
} from 'lucide-react'
import { formatDate, formatDuration, cn } from '@/lib/utils'
import { TraceFeedback } from '@/components/trace-feedback'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// Types
interface Observation {
  id: string
  type: 'SPAN' | 'GENERATION' | 'EVENT' | 'TOOL'
  name: string
  startTime: string
  endTime?: string
  duration?: number
  level?: string
  statusMessage?: string
  parentObservationId?: string
  input?: any
  output?: any
  metadata?: any
  model?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  children?: Observation[]
  error?: any
}

// Helper to build tree structure from flat observations
function buildObservationTree(observations: any[]): Observation[] {
  if (!observations || !Array.isArray(observations)) return []

  const obsMap = new Map<string, Observation>()
  const roots: Observation[] = []

  // First pass: create all nodes
  observations.forEach((obs) => {
    const node: Observation = {
      id: obs.id,
      type: obs.type || 'SPAN',
      name: obs.name || 'Unnamed',
      startTime: obs.startTime || obs.createdAt,
      endTime: obs.endTime || obs.completedAt,
      level: obs.level,
      statusMessage: obs.statusMessage,
      parentObservationId: obs.parentObservationId,
      input: obs.input,
      output: obs.output,
      metadata: obs.metadata,
      model: obs.model,
      usage: obs.usage,
      children: [],
      error: obs.error,
    }

    // Calculate duration
    if (node.startTime && node.endTime) {
      const start = new Date(node.startTime).getTime()
      const end = new Date(node.endTime).getTime()
      node.duration = end - start
    }

    obsMap.set(node.id, node)
  })

  // Second pass: build tree structure
  obsMap.forEach((node) => {
    if (node.parentObservationId && obsMap.has(node.parentObservationId)) {
      const parent = obsMap.get(node.parentObservationId)!
      parent.children!.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

// Get icon for observation type
function getObservationIcon(type: string) {
  switch (type) {
    case 'GENERATION':
      return Sparkles
    case 'SPAN':
      return Layers
    case 'EVENT':
      return Activity
    case 'TOOL':
      return Wrench
    default:
      return MessageSquare
  }
}

// Get color for observation type
function getObservationColor(type: string) {
  switch (type) {
    case 'GENERATION':
      return 'text-purple-600 bg-purple-50 border-purple-200'
    case 'SPAN':
      return 'text-blue-600 bg-blue-50 border-blue-200'
    case 'EVENT':
      return 'text-green-600 bg-green-50 border-green-200'
    case 'TOOL':
      return 'text-orange-600 bg-orange-50 border-orange-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

// Skeleton component
function TraceDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-muted rounded w-1/4"></div>
      <div className="h-64 bg-muted rounded"></div>
      <div className="h-96 bg-muted rounded"></div>
    </div>
  )
}

// Tree Node Component
function ObservationTreeNode({
  observation,
  depth = 0,
  isSelected,
  onSelect,
  traceStartTime,
}: {
  observation: Observation
  depth?: number
  isSelected: boolean
  onSelect: (obs: Observation) => void
  traceStartTime: number
}) {
  const [isExpanded, setIsExpanded] = useState(depth === 0)
  const hasChildren = observation.children && observation.children.length > 0
  const Icon = getObservationIcon(observation.type)

  // Calculate relative timing for waterfall
  const startOffset = observation.startTime
    ? new Date(observation.startTime).getTime() - traceStartTime
    : 0

  return (
    <div className="select-none">
      <div
        className={cn(
          'flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors',
          isSelected && 'bg-primary/10 border border-primary/20'
        )}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={() => onSelect(observation)}
      >
        {hasChildren && (
          <button
            className="p-0.5 hover:bg-muted rounded"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        )}
        {!hasChildren && <div className="w-4" />}

        <div
          className={cn(
            'p-1 rounded border',
            getObservationColor(observation.type)
          )}
        >
          <Icon className="h-3 w-3" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {observation.name}
            </span>
            {observation.model && (
              <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                {observation.model}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {observation.duration && (
            <div className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              <span>{formatDuration(observation.duration)}</span>
            </div>
          )}
          {observation.usage?.totalTokens && (
            <div className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              <span>{observation.usage.totalTokens.toLocaleString()}</span>
            </div>
          )}
          {observation.error && (
            <AlertCircle className="h-4 w-4 text-error" />
          )}
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div>
          {observation.children!.map((child) => (
            <ObservationTreeNode
              key={child.id}
              observation={child}
              depth={depth + 1}
              isSelected={isSelected}
              onSelect={onSelect}
              traceStartTime={traceStartTime}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Timeline/Waterfall View Component
function TimelineView({
  observations,
  traceStartTime,
  traceEndTime,
  selectedObservation,
  onSelect,
}: {
  observations: Observation[]
  traceStartTime: number
  traceEndTime: number
  selectedObservation: Observation | null
  onSelect: (obs: Observation) => void
}) {
  const totalDuration = traceEndTime - traceStartTime

  // Flatten observations for timeline
  const flattenObservations = (obs: Observation[], result: Observation[] = []): Observation[] => {
    obs.forEach((o) => {
      result.push(o)
      if (o.children && o.children.length > 0) {
        flattenObservations(o.children, result)
      }
    })
    return result
  }

  const flatObs = flattenObservations(observations)

  return (
    <div className="space-y-2">
      {flatObs.map((obs) => {
        const startOffset = obs.startTime
          ? new Date(obs.startTime).getTime() - traceStartTime
          : 0
        const duration = obs.duration || 0
        const leftPercent = (startOffset / totalDuration) * 100
        const widthPercent = (duration / totalDuration) * 100
        const Icon = getObservationIcon(obs.type)

        return (
          <div
            key={obs.id}
            className={cn(
              'relative h-8 cursor-pointer hover:opacity-80 transition-opacity',
              selectedObservation?.id === obs.id && 'ring-2 ring-primary ring-offset-2'
            )}
            onClick={() => onSelect(obs)}
          >
            <div className="absolute inset-y-0 left-0 right-0 flex items-center">
              <div
                className={cn(
                  'h-6 rounded border flex items-center gap-1 px-2',
                  getObservationColor(obs.type)
                )}
                style={{
                  marginLeft: `${leftPercent}%`,
                  width: `${Math.max(widthPercent, 2)}%`,
                }}
              >
                <Icon className="h-3 w-3 flex-shrink-0" />
                <span className="text-xs font-medium truncate">{obs.name}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Detail Panel Component
function DetailPanel({ observation }: { observation: Observation | null }) {
  const [showInput, setShowInput] = useState(true)
  const [showOutput, setShowOutput] = useState(true)
  const [showMetadata, setShowMetadata] = useState(false)

  if (!observation) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Select an observation to view details</p>
        </div>
      </div>
    )
  }

  const Icon = getObservationIcon(observation.type)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const renderJson = (data: any) => {
    if (!data) return <span className="text-muted-foreground">No data</span>

    try {
      const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      return (
        <div className="relative group">
          <Button
            variant="ghost"
            size="xs"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => copyToClipboard(jsonString)}
          >
            <Copy className="h-3 w-3" />
          </Button>
          <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-[400px] font-mono">
            {jsonString}
          </pre>
        </div>
      )
    } catch (e) {
      return <span className="text-error">Invalid JSON</span>
    }
  }

  return (
    <div className="space-y-4 h-full overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 pb-4 border-b">
        <div className="flex items-start gap-3 mb-4">
          <div className={cn('p-2 rounded-lg border', getObservationColor(observation.type))}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg mb-1">{observation.name}</h3>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className={cn('px-2 py-0.5 rounded-md text-xs border', getObservationColor(observation.type))}>
                {observation.type}
              </span>
              {observation.model && (
                <span className="px-2 py-0.5 rounded-md text-xs bg-muted">
                  {observation.model}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Timing Info */}
        <div className="grid grid-cols-2 gap-4 p-3 bg-muted/30 rounded-lg">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Start Time</div>
            <div className="text-sm font-medium">
              {observation.startTime ? formatDate(observation.startTime) : 'N/A'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Duration</div>
            <div className="text-sm font-medium">
              {observation.duration ? formatDuration(observation.duration) : 'N/A'}
            </div>
          </div>
        </div>

        {/* Token Usage */}
        {observation.usage && (
          <div className="grid grid-cols-3 gap-4 p-3 bg-muted/30 rounded-lg mt-2">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Prompt Tokens</div>
              <div className="text-sm font-medium">
                {observation.usage.promptTokens?.toLocaleString() || 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Completion Tokens</div>
              <div className="text-sm font-medium">
                {observation.usage.completionTokens?.toLocaleString() || 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Total Tokens</div>
              <div className="text-sm font-medium font-bold">
                {observation.usage.totalTokens?.toLocaleString() || 0}
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {observation.error && (
          <div className="p-3 bg-error/10 border border-error/20 rounded-lg mt-2">
            <div className="flex items-center gap-2 text-error font-medium mb-2">
              <AlertCircle className="h-4 w-4" />
              <span>Error</span>
            </div>
            <pre className="text-xs text-error whitespace-pre-wrap">
              {typeof observation.error === 'string'
                ? observation.error
                : JSON.stringify(observation.error, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Content Sections */}
      <div className="space-y-4">
        {/* Input */}
        {observation.input && (
          <div>
            <button
              className="flex items-center gap-2 w-full text-left font-medium mb-2 hover:text-primary transition-colors"
              onClick={() => setShowInput(!showInput)}
            >
              {showInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span>Input</span>
            </button>
            {showInput && renderJson(observation.input)}
          </div>
        )}

        {/* Output */}
        {observation.output && (
          <div>
            <button
              className="flex items-center gap-2 w-full text-left font-medium mb-2 hover:text-primary transition-colors"
              onClick={() => setShowOutput(!showOutput)}
            >
              {showOutput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span>Output</span>
            </button>
            {showOutput && renderJson(observation.output)}
          </div>
        )}

        {/* Metadata */}
        {observation.metadata && (
          <div>
            <button
              className="flex items-center gap-2 w-full text-left font-medium mb-2 hover:text-primary transition-colors"
              onClick={() => setShowMetadata(!showMetadata)}
            >
              {showMetadata ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span>Metadata</span>
            </button>
            {showMetadata && renderJson(observation.metadata)}
          </div>
        )}
      </div>
    </div>
  )
}

// Main Page Component
export default function TraceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const traceId = params.id as string
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null)
  const [viewMode, setViewMode] = useState<'tree' | 'timeline'>('tree')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // Fetch trace data
  const { data: trace, isLoading, error } = useQuery({
    queryKey: ['trace', traceId],
    queryFn: () => apiClient.getTrace(traceId),
  })

  // Fetch agents for feedback
  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.listAgents(),
  })

  // Build observation tree from raw_data
  const observations = useMemo(() => {
    if (!trace?.raw_data?.observations) return []
    return buildObservationTree(trace.raw_data.observations)
  }, [trace])

  // Calculate trace timing
  const { traceStartTime, traceEndTime, totalDuration } = useMemo(() => {
    if (!trace?.timestamp) {
      return { traceStartTime: 0, traceEndTime: 0, totalDuration: 0 }
    }

    const start = new Date(trace.timestamp).getTime()
    let end = start

    if (trace.raw_data?.observations) {
      trace.raw_data.observations.forEach((obs: any) => {
        if (obs.endTime || obs.completedAt) {
          const obsEnd = new Date(obs.endTime || obs.completedAt).getTime()
          if (obsEnd > end) end = obsEnd
        }
      })
    }

    return {
      traceStartTime: start,
      traceEndTime: end,
      totalDuration: end - start,
    }
  }, [trace])

  // Auto-select first agent if none is selected
  const effectiveAgentId = selectedAgentId || trace?.feedback?.agent_id || agentsData?.agents?.[0]?.id

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-[1800px]">
        <TraceDetailSkeleton />
      </div>
    )
  }

  if (error || !trace) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-[1800px]">
        <ErrorState
          title="Failed to load trace"
          message="The trace could not be found or there was an error loading it."
          error={error as Error}
          onRetry={() => router.back()}
        />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto px-4 py-8 max-w-[1800px]">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push('/traces')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Traces
          </Button>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">Trace Details</h1>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                    {trace.trace_id}
                  </code>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => navigator.clipboard.writeText(trace.trace_id)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy trace ID</TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{formatDate(trace.timestamp)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs">
                    {trace.source}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{formatDuration(totalDuration)}</span>
                </div>
                {trace.summary?.has_errors && (
                  <div className="flex items-center gap-2 text-error">
                    <AlertCircle className="h-4 w-4" />
                    <span>Has Errors</span>
                  </div>
                )}
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'tree' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('tree')}
              >
                <Layers className="h-4 w-4 mr-2" />
                Tree
              </Button>
              <Button
                variant={viewMode === 'timeline' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('timeline')}
              >
                <Activity className="h-4 w-4 mr-2" />
                Timeline
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content - Split View */}
        <div className="grid grid-cols-12 gap-6 mb-6">
          {/* Left Panel - Tree/Timeline View */}
          <div className="col-span-5">
            <Card className="h-[700px] flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">
                  {viewMode === 'tree' ? 'Observation Tree' : 'Timeline'}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                {observations.length > 0 ? (
                  viewMode === 'tree' ? (
                    <div className="space-y-1">
                      {observations.map((obs) => (
                        <ObservationTreeNode
                          key={obs.id}
                          observation={obs}
                          isSelected={selectedObservation?.id === obs.id}
                          onSelect={setSelectedObservation}
                          traceStartTime={traceStartTime}
                        />
                      ))}
                    </div>
                  ) : (
                    <TimelineView
                      observations={observations}
                      traceStartTime={traceStartTime}
                      traceEndTime={traceEndTime}
                      selectedObservation={selectedObservation}
                      onSelect={setSelectedObservation}
                    />
                  )
                ) : trace.steps && trace.steps.length > 0 ? (
                  // Fallback to steps if no observations
                  <div className="space-y-3">
                    {trace.steps.map((step: any, index: number) => (
                      <Card key={index} className="p-4">
                        <div className="font-medium mb-2">Step {index + 1}</div>
                        {step.messages_added && step.messages_added.length > 0 && (
                          <div className="space-y-2">
                            {step.messages_added.map((msg: any, msgIdx: number) => (
                              <div key={msgIdx} className="text-sm">
                                <div className="text-xs text-muted-foreground capitalize mb-1">
                                  {msg.role}
                                </div>
                                <div className="pl-3 border-l-2 border-primary">
                                  {msg.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <FileJson className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No observations or steps data available</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Detail View */}
          <div className="col-span-7">
            <Card className="h-[700px]">
              <CardHeader>
                <CardTitle className="text-lg">
                  {selectedObservation ? 'Observation Details' : 'Details'}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-80px)]">
                <DetailPanel observation={selectedObservation} />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Feedback Section */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {trace.feedback ? 'Update Feedback' : 'Add Feedback'}
          </h2>

          {trace.feedback && (
            <div className="mb-6 p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-lg">
                  {trace.feedback.rating === 'positive' ? '👍' : trace.feedback.rating === 'negative' ? '👎' : '😐'}
                </span>
                <span className="font-medium capitalize">{trace.feedback.rating}</span>
              </div>
              {trace.feedback.notes && (
                <div className="text-sm text-muted-foreground">{trace.feedback.notes}</div>
              )}
            </div>
          )}

          {/* Agent Selector */}
          {!trace.feedback && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Select Agent
              </label>
              <Select
                value={selectedAgentId || ''}
                onValueChange={(value) => setSelectedAgentId(value)}
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent>
                  {agentsData?.agents?.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Feedback Buttons */}
          {effectiveAgentId ? (
            <TraceFeedback
              traceId={trace.id}
              agentId={effectiveAgentId}
              currentRating={trace.feedback?.rating}
              feedbackId={trace.feedback?.id}
            />
          ) : (
            <div className="text-sm text-muted-foreground">
              {agentsData?.agents?.length === 0
                ? 'Create an agent first to enable feedback.'
                : 'Select an agent above to enable feedback buttons.'}
            </div>
          )}
        </Card>
      </div>
    </TooltipProvider>
  )
}
