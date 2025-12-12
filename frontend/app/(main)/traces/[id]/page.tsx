'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@/hooks/use-router-with-progress'
import { useParams } from 'next/navigation'
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
import { Badge } from '@/components/ui/badge'

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

// Helper to extract tool name from various locations in step data
function extractToolName(step: any): string {
  // Parse input if it's a JSON string
  let inputObj = step.input
  if (typeof step.input === 'string') {
    try {
      inputObj = JSON.parse(step.input)
    } catch {
      // Not valid JSON, use as-is
    }
  }

  // Check multiple locations for tool name (skip "unknown" values)
  // 1. Input object toolName is most reliable for playground traces
  if (inputObj?.toolName && inputObj.toolName !== 'unknown') {
    return inputObj.toolName
  }
  // 2. Direct tool_calls array
  if (step.tool_calls?.[0]?.tool_name && step.tool_calls[0].tool_name !== 'unknown') {
    return step.tool_calls[0].tool_name
  }
  // 3. Metadata may have tool_name or span_name
  if (step.metadata?.tool_name && step.metadata.tool_name !== 'unknown') {
    return step.metadata.tool_name
  }
  if (step.metadata?.span_name && step.metadata.span_name !== 'unknown') {
    return step.metadata.span_name
  }
  // 4. Check if input is a string that looks like a tool name
  if (typeof step.input === 'string' && step.input.length < 50 && !step.input.includes(' ')) {
    return step.input
  }
  return 'Tool Call'
}

// Helper to convert steps to observation format for consistent UI
// Builds a hierarchical tree using parent_span_id from metadata
function convertStepsToObservations(steps: any[]): Observation[] {
  if (!steps || !Array.isArray(steps)) return []

  type ExtendedObs = Observation & { _originalStep?: any; _messages?: any[]; _toolCalls?: any[] }
  const allObservations: ExtendedObs[] = []
  const spanIdToObs = new Map<string, ExtendedObs>()

  // First pass: create all observations and build span_id lookup
  steps.forEach((step, index) => {
    const hasToolCalls = step.tool_calls && step.tool_calls.length > 0
    const hasMessages = step.messages_added && step.messages_added.length > 0
    const latencyMs = step.metadata?.latency_ms || 0

    // Parse input if it's a JSON string to check for toolName
    let inputObj = step.input
    if (typeof step.input === 'string') {
      try {
        inputObj = JSON.parse(step.input)
      } catch {
        // Not valid JSON, use as-is
      }
    }

    // Determine observation type and name
    const isToolStep = hasToolCalls || inputObj?.toolName
    const observationType = isToolStep ? 'TOOL' : 'GENERATION'

    let observationName: string
    if (isToolStep) {
      observationName = extractToolName(step)
    } else if (hasMessages) {
      const firstMsg = step.messages_added[0]
      if (firstMsg?.role === 'assistant') {
        observationName = 'LLM Generation'
      } else {
        observationName = step.metadata?.span_name || 'LLM Call'
      }
    } else {
      observationName = step.metadata?.span_name || 'LLM Call'
    }

    const observation: ExtendedObs = {
      id: step.step_id || `step_${index}`,
      type: observationType,
      name: observationName,
      startTime: step.timestamp,
      duration: latencyMs,
      input: step.input,
      output: step.output,
      metadata: step.metadata,
      error: step.error,
      children: [],
      parentObservationId: step.metadata?.parent_span_id,
      _originalStep: step,
      _messages: step.messages_added,
      _toolCalls: step.tool_calls,
    }

    allObservations.push(observation)

    // Index by span_id for parent lookup
    const spanId = step.metadata?.span_id
    if (spanId) {
      spanIdToObs.set(spanId, observation)
    }
  })

  // Second pass: build tree using parent_span_id
  const roots: ExtendedObs[] = []
  allObservations.forEach((obs) => {
    const parentSpanId = obs.parentObservationId
    if (parentSpanId && spanIdToObs.has(parentSpanId)) {
      const parent = spanIdToObs.get(parentSpanId)!
      parent.children!.push(obs)
    } else {
      roots.push(obs)
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

  // Calculate max duration for relative bar sizing
  const maxDuration = Math.max(...flatObs.map((o) => o.duration || 0), 1)

  return (
    <div className="space-y-1">
      {flatObs.map((obs) => {
        const duration = obs.duration || 0
        // Use relative bar width based on max duration for better visibility
        const widthPercent = totalDuration > 0 ? Math.max((duration / maxDuration) * 100, 5) : 50
        const Icon = getObservationIcon(obs.type)

        return (
          <div
            key={obs.id}
            className={cn(
              'flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors',
              selectedObservation?.id === obs.id && 'bg-primary/10 ring-1 ring-primary'
            )}
            onClick={() => onSelect(obs)}
          >
            {/* Icon and name */}
            <div className="flex items-center gap-2 w-32 flex-shrink-0">
              <div className={cn('p-1 rounded', getObservationColor(obs.type))}>
                <Icon className="h-3 w-3" />
              </div>
              <span className="text-xs font-medium truncate">{obs.name}</span>
            </div>

            {/* Duration bar */}
            <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden">
              <div
                className={cn(
                  'h-full rounded flex items-center justify-end px-2',
                  obs.type === 'GENERATION'
                    ? 'bg-purple-500/70'
                    : obs.type === 'TOOL'
                      ? 'bg-orange-500/70'
                      : 'bg-blue-500/70'
                )}
                style={{ width: `${widthPercent}%` }}
              >
                <span className="text-[10px] text-white font-medium">
                  {formatDuration(duration)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Enhanced Step Fallback Component
function EnhancedStepCard({ step, index }: { step: any; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Determine step type
  const hasToolCalls = step.tool_calls && step.tool_calls.length > 0
  const hasMessages = step.messages_added && step.messages_added.length > 0
  const hasError = !!step.error

  // Calculate latency if available
  const latencyMs = step.metadata?.latency_ms || step.metadata?.duration_ms
  const tokenUsage = step.metadata?.token_usage || step.metadata?.usage

  return (
    <Card
      key={step.step_id || index}
      className={cn(
        "overflow-hidden transition-all",
        hasError && "border-error/50"
      )}
    >
      {/* Step Header */}
      <div
        className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="font-medium">Step {index + 1}</span>
            </div>

            {/* Step Type Badge */}
            <Badge variant={hasToolCalls ? "secondary" : "default"}>
              {hasToolCalls ? "Tool Call" : "LLM Call"}
            </Badge>

            {/* Tool Name if available */}
            {hasToolCalls && step.tool_calls[0]?.tool_name && (
              <span className="font-mono text-sm text-muted-foreground truncate">
                {step.tool_calls[0].tool_name}
              </span>
            )}

            {/* Error Badge */}
            {hasError && (
              <Badge variant="error">
                <AlertCircle className="h-3 w-3 mr-1" />
                Error
              </Badge>
            )}
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
            {latencyMs && (
              <div className="flex items-center gap-1">
                <Timer className="h-3 w-3" />
                <span>{latencyMs}ms</span>
              </div>
            )}
            {tokenUsage?.total && (
              <div className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                <span>{tokenUsage.total}</span>
              </div>
            )}
            {step.timestamp && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{new Date(step.timestamp).toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t bg-muted/10 p-4 space-y-4">
          {/* Input */}
          {step.input && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Code2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Input</span>
              </div>
              <pre className="bg-background border rounded-lg p-3 text-xs overflow-auto max-h-[300px]">
                {typeof step.input === 'string'
                  ? step.input
                  : JSON.stringify(step.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Messages */}
          {hasMessages && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Messages</span>
              </div>
              <div className="space-y-2">
                {step.messages_added.map((msg: any, msgIdx: number) => (
                  <div
                    key={msgIdx}
                    className={cn(
                      "rounded-lg border p-3",
                      msg.role === 'user' && "bg-blue-50 border-blue-200",
                      msg.role === 'assistant' && "bg-green-50 border-green-200",
                      msg.role === 'system' && "bg-muted border-border"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {msg.role === 'user' ? (
                        <User className="h-3 w-3" />
                      ) : msg.role === 'assistant' ? (
                        <Bot className="h-3 w-3" />
                      ) : (
                        <Code2 className="h-3 w-3" />
                      )}
                      <span className="text-xs font-medium capitalize">{msg.role}</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap pl-5">
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tool Calls */}
          {hasToolCalls && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Tool Calls</span>
              </div>
              <div className="space-y-3">
                {step.tool_calls.map((tc: any, tcIdx: number) => (
                  <div
                    key={tcIdx}
                    className="border-l-4 border-orange-500 pl-4 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{tc.tool_name}</span>
                      {tc.error && (
                        <Badge variant="error" className="text-xs">
                          Failed
                        </Badge>
                      )}
                    </div>

                    {/* Arguments */}
                    {tc.arguments && Object.keys(tc.arguments).length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Arguments:</div>
                        <pre className="bg-background border rounded p-2 text-xs overflow-auto">
                          {JSON.stringify(tc.arguments, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Result */}
                    {tc.result && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Result:</div>
                        <pre className="bg-success/5 border border-success/20 rounded p-2 text-xs text-success overflow-auto">
                          {typeof tc.result === 'string'
                            ? tc.result
                            : JSON.stringify(tc.result, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Error */}
                    {tc.error && (
                      <div>
                        <div className="text-xs text-error mb-1">Error:</div>
                        <pre className="bg-error/5 border border-error/20 rounded p-2 text-xs text-error overflow-auto">
                          {tc.error}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output */}
          {step.output && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileJson className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Output</span>
              </div>
              <pre className="bg-background border rounded-lg p-3 text-xs overflow-auto max-h-[300px]">
                {typeof step.output === 'string'
                  ? step.output
                  : JSON.stringify(step.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Step Error */}
          {step.error && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-error">
                <XCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Step Error</span>
              </div>
              <pre className="bg-error/5 border border-error/20 rounded-lg p-3 text-sm text-error overflow-auto">
                {step.error}
              </pre>
            </div>
          )}

          {/* Metadata if available */}
          {step.metadata && Object.keys(step.metadata).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Metadata</span>
              </div>
              <pre className="bg-background border rounded-lg p-3 text-xs overflow-auto max-h-[200px]">
                {JSON.stringify(step.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// Detail Panel Component
function DetailPanel({ observation }: { observation: (Observation & { _messages?: any[]; _toolCalls?: any[] }) | null }) {
  const [showInput, setShowInput] = useState(true)
  const [showOutput, setShowOutput] = useState(true)
  const [showMetadata, setShowMetadata] = useState(false)
  const [showMessages, setShowMessages] = useState(true)
  const [showToolCalls, setShowToolCalls] = useState(true)

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

  const renderJson = (data: any) => {
    if (!data) return <span className="text-muted-foreground">No data</span>

    try {
      // If data is a string, try to parse it first for proper formatting
      let parsedData = data
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data)
        } catch {
          // Not valid JSON, keep as string
          parsedData = data
        }
      }
      // Format with proper indentation
      const jsonString = typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData, null, 2)
      return (
        <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-[400px] font-mono whitespace-pre-wrap">
          {jsonString}
        </pre>
      )
    } catch (e) {
      return <span className="text-error">Invalid JSON</span>
    }
  }

  // Helper to extract tool name from tool call or observation
  const getToolCallName = (tc: any) => {
    // Parse observation.input if it's a JSON string
    let inputObj = observation.input
    if (typeof observation.input === 'string') {
      try {
        inputObj = JSON.parse(observation.input)
      } catch {
        // Not valid JSON
      }
    }
    // Check various locations, skipping "unknown" values
    if (inputObj?.toolName && inputObj.toolName !== 'unknown') return inputObj.toolName
    if (tc.tool_name && tc.tool_name !== 'unknown') return tc.tool_name
    if (tc.toolName && tc.toolName !== 'unknown') return tc.toolName
    if (observation.name && observation.name !== 'Tool Call' && observation.name !== 'unknown') return observation.name
    return 'Tool'
  }

  // Check if we have messages or tool calls from converted steps
  const messages = observation._messages || []
  const toolCalls = observation._toolCalls || []

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
        {/* Messages (from converted steps) */}
        {messages.length > 0 && (
          <div>
            <button
              className="flex items-center gap-2 w-full text-left font-medium mb-2 hover:text-primary transition-colors"
              onClick={() => setShowMessages(!showMessages)}
            >
              <MessageSquare className="h-4 w-4" />
              <span>Messages ({messages.length})</span>
              {showMessages ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
            </button>
            {showMessages && (
              <div className="space-y-2">
                {messages.map((msg: any, idx: number) => (
                  <div
                    key={idx}
                    className={cn(
                      "rounded-lg border p-3",
                      msg.role === 'user' && "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
                      msg.role === 'assistant' && "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
                      msg.role === 'system' && "bg-muted border-border"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {msg.role === 'user' ? (
                        <User className="h-4 w-4" />
                      ) : msg.role === 'assistant' ? (
                        <Bot className="h-4 w-4" />
                      ) : (
                        <Code2 className="h-4 w-4" />
                      )}
                      <span className="text-xs font-medium capitalize">{msg.role}</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap pl-6">
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tool Calls (from converted steps) */}
        {toolCalls.length > 0 && (
          <div>
            <button
              className="flex items-center gap-2 w-full text-left font-medium mb-2 hover:text-primary transition-colors"
              onClick={() => setShowToolCalls(!showToolCalls)}
            >
              <Wrench className="h-4 w-4" />
              <span>Tool Calls ({toolCalls.length})</span>
              {showToolCalls ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
            </button>
            {showToolCalls && (
              <div className="space-y-3">
                {toolCalls.map((tc: any, idx: number) => (
                  <div key={idx} className="border-l-4 border-orange-500 pl-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{getToolCallName(tc)}</span>
                      {tc.error && (
                        <Badge variant="destructive" className="text-xs">Failed</Badge>
                      )}
                    </div>
                    {tc.arguments && Object.keys(tc.arguments).length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Arguments:</div>
                        <pre className="bg-muted border rounded p-2 text-xs overflow-auto max-h-[200px]">
                          {JSON.stringify(tc.arguments, null, 2)}
                        </pre>
                      </div>
                    )}
                    {tc.result && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Result:</div>
                        <pre className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-2 text-xs overflow-auto max-h-[200px]">
                          {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}
                        </pre>
                      </div>
                    )}
                    {tc.error && (
                      <div>
                        <div className="text-xs text-error mb-1">Error:</div>
                        <pre className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded p-2 text-xs text-error overflow-auto">
                          {tc.error}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input */}
        {observation.input && (
          <div>
            <button
              className="flex items-center gap-2 w-full text-left font-medium mb-2 hover:text-primary transition-colors"
              onClick={() => setShowInput(!showInput)}
            >
              <Code2 className="h-4 w-4" />
              <span>Input</span>
              {showInput ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
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
              <FileJson className="h-4 w-4" />
              <span>Output</span>
              {showOutput ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
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
              <Activity className="h-4 w-4" />
              <span>Metadata</span>
              {showMetadata ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
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

  // Build observation tree from raw_data or convert steps
  const observations = useMemo(() => {
    // Prefer raw_data.observations if available
    if (trace?.raw_data?.observations && trace.raw_data.observations.length > 0) {
      return buildObservationTree(trace.raw_data.observations)
    }
    // Fallback to converting steps to observation format
    if (trace?.steps && trace.steps.length > 0) {
      return convertStepsToObservations(trace.steps)
    }
    return []
  }, [trace])

  // Calculate trace timing
  const { traceStartTime, traceEndTime, totalDuration } = useMemo(() => {
    if (!trace?.timestamp) {
      return { traceStartTime: 0, traceEndTime: 0, totalDuration: 0 }
    }

    const start = new Date(trace.timestamp).getTime()
    let end = start
    let calculatedDuration = 0

    // Check raw_data.observations first
    if (trace.raw_data?.observations) {
      trace.raw_data.observations.forEach((obs: any) => {
        if (obs.endTime || obs.completedAt) {
          const obsEnd = new Date(obs.endTime || obs.completedAt).getTime()
          if (obsEnd > end) end = obsEnd
        }
      })
      calculatedDuration = end - start
    }
    // Fallback: sum latency from steps metadata
    else if (trace.steps && trace.steps.length > 0) {
      calculatedDuration = trace.steps.reduce((total: number, step: any) => {
        const stepLatency = step.metadata?.latency_ms || 0
        return total + stepLatency
      }, 0)
      end = start + calculatedDuration
    }

    return {
      traceStartTime: start,
      traceEndTime: end,
      totalDuration: calculatedDuration,
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 max-w-xs">
                      <Code2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <code className="font-mono text-xs bg-muted px-2 py-1 rounded truncate">
                        {trace.trace_id}
                      </code>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="font-mono text-xs max-w-md break-all">
                    {trace.trace_id}
                  </TooltipContent>
                </Tooltip>
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
                  // Fallback to enhanced steps rendering if no observations
                  <div className="space-y-3">
                    {trace.steps.map((step: any, index: number) => (
                      <EnhancedStepCard key={step.step_id || index} step={step} index={index} />
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
                <div className="text-sm text-muted-foreground mb-2">{trace.feedback.notes}</div>
              )}
              {trace.feedback.agent_id && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/50">
                  <Bot className="h-3 w-3" />
                  <span>Agent:</span>
                  <span className="font-medium">
                    {agentsData?.agents?.find((a: any) => a.id === trace.feedback?.agent_id)?.name || trace.feedback?.agent_id}
                  </span>
                </div>
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
