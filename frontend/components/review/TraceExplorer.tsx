'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  Layers,
  Sparkles,
  AlertCircle,
  FileJson,
  Activity,
  MessageSquare,
  Database,
  Cpu,
} from 'lucide-react'
import { formatDate, formatDuration, cn } from '@/lib/utils'
import type { OpenInferenceSpan, OpenInferenceSpanKind } from '@/types/openinference'
import { TreeView, type TreeDataItem } from '@/components/tree-view'

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
  _messages?: any[]
  _toolCalls?: any[]
}

interface TraceExplorerProps {
  trace: any // The full trace object with steps/observations
  selectedId?: string // Currently selected observation/tool call ID
  onSelect?: (observationId: string) => void
}

/**
 * Convert OpenInference spans to Observation format for display
 *
 * ENHANCED: Infers parent-child relationships when parent_span_id is not set.
 * Links TOOL spans to their parent LLM span based on tool_call IDs.
 */
function convertOpenInferenceSpans(spans: OpenInferenceSpan[]): Observation[] {
  if (!spans || !Array.isArray(spans)) return []

  // Build a map of tool_call_id -> LLM span that requested it
  const toolCallToLLMSpan = new Map<string, string>()

  // First, scan LLM spans to find tool calls they requested
  spans.forEach((span) => {
    if (span.span_kind === 'LLM' && span.llm?.output_messages) {
      span.llm.output_messages.forEach((msg) => {
        if (msg.tool_calls) {
          msg.tool_calls.forEach((tc) => {
            if (tc.id) {
              toolCallToLLMSpan.set(tc.id, span.span_id)
            }
          })
        }
      })
    }
  })

  const obsMap = new Map<string, Observation>()
  const roots: Observation[] = []

  // First pass: create all nodes
  spans.forEach((span) => {
    // Map OpenInference span_kind to observation type
    const type = span.span_kind as any // Keep the OpenInference types

    // Calculate duration
    let duration: number | undefined
    if (span.start_time && span.end_time) {
      const start = new Date(span.start_time).getTime()
      const end = new Date(span.end_time).getTime()
      duration = end - start
    }

    // Infer parent_span_id for TOOL spans if not set
    let parentSpanId = span.parent_span_id
    if (!parentSpanId && span.span_kind === 'TOOL') {
      // Try to find parent via tool_call_id in attributes
      const toolCallId = span.attributes?.tool_call_id as string
      if (toolCallId && toolCallToLLMSpan.has(toolCallId)) {
        parentSpanId = toolCallToLLMSpan.get(toolCallId)
      }
      // Or via tool output's tool_call_id
      if (!parentSpanId && span.tool?.output) {
        const output = span.tool.output as any
        const outputToolCallId = output?.kwargs?.tool_call_id
        if (outputToolCallId && toolCallToLLMSpan.has(outputToolCallId)) {
          parentSpanId = toolCallToLLMSpan.get(outputToolCallId)
        }
      }
    }

    const node: Observation = {
      id: span.span_id,
      type,
      name: span.name,
      startTime: span.start_time,
      endTime: span.end_time,
      duration,
      statusMessage: span.status_message,
      parentObservationId: parentSpanId,
      input: span.llm?.input_messages || span.tool?.parameters || span.input,
      output: span.llm?.output_messages || span.tool?.output || span.output,
      metadata: span.attributes,
      model: span.llm?.model_name,
      usage: span.llm ? {
        promptTokens: span.llm.token_count_prompt,
        completionTokens: span.llm.token_count_completion,
        totalTokens: span.llm.token_count_total,
      } : undefined,
      children: [],
      error: span.status === 'ERROR' ? span.status_message : undefined,
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

  // Sort children by start time
  const sortChildren = (obs: Observation) => {
    if (obs.children && obs.children.length > 0) {
      obs.children.sort((a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
      obs.children.forEach(sortChildren)
    }
  }
  roots.forEach(sortChildren)

  return roots
}

// Helper to build tree structure from flat observations (legacy format)
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

  const allObservations: Observation[] = []
  const spanIdToObs = new Map<string, Observation>()

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

    const observation: Observation = {
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
  const roots: Observation[] = []
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

// Get icon for observation type (supports OpenInference span kinds)
function getObservationIcon(type: string) {
  switch (type) {
    case 'LLM':
    case 'GENERATION':
      return Sparkles
    case 'TOOL':
      return Wrench
    case 'AGENT':
      return Cpu
    case 'CHAIN':
    case 'SPAN':
      return Layers
    case 'RETRIEVER':
      return Database
    case 'EMBEDDING':
      return Activity
    case 'RERANKER':
      return Activity
    case 'EVENT':
      return Activity
    default:
      return MessageSquare
  }
}

// Get color for observation type (supports OpenInference span kinds)
function getObservationColor(type: string) {
  switch (type) {
    case 'LLM':
    case 'GENERATION':
      return 'text-purple-600 bg-purple-50 border-purple-200'
    case 'TOOL':
      return 'text-orange-600 bg-orange-50 border-orange-200'
    case 'AGENT':
      return 'text-indigo-600 bg-indigo-50 border-indigo-200'
    case 'CHAIN':
    case 'SPAN':
      return 'text-blue-600 bg-blue-50 border-blue-200'
    case 'RETRIEVER':
      return 'text-cyan-600 bg-cyan-50 border-cyan-200'
    case 'EMBEDDING':
    case 'RERANKER':
      return 'text-teal-600 bg-teal-50 border-teal-200'
    case 'EVENT':
      return 'text-green-600 bg-green-50 border-green-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

// Extended TreeDataItem to include observation data
interface ObservationTreeItem extends TreeDataItem {
  observation: Observation
}

// Convert Observation tree to TreeDataItem format for TreeView component
function convertToTreeData(observations: Observation[]): ObservationTreeItem[] {
  return observations.map((obs) => {
    const Icon = getObservationIcon(obs.type)
    const colorClass = getObservationColor(obs.type).split(' ')[0]

    const item: ObservationTreeItem = {
      id: obs.id,
      name: obs.name,
      icon: Icon,
      observation: obs,
      children: obs.children && obs.children.length > 0
        ? convertToTreeData(obs.children)
        : undefined,
    }

    return item
  })
}

// Detail Panel Component
function DetailPanel({ observation }: { observation: Observation }) {
  const renderJson = (data: any, label: string) => {
    if (!data) return null

    try {
      let parsedData = data
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data)
        } catch {
          parsedData = data
        }
      }
      const jsonString = typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData, null, 2)
      return (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <pre className="text-xs bg-muted p-2 rounded font-mono whitespace-pre-wrap">
            {jsonString}
          </pre>
        </div>
      )
    } catch {
      return null
    }
  }

  // For TOOL type, show tool call details from _toolCalls
  const toolCalls = observation._toolCalls || []
  const isToolObservation = observation.type === 'TOOL' && toolCalls.length > 0

  return (
    <div className="space-y-3 h-full overflow-auto">
      {/* Error Display */}
      {observation.error && (
        <div className="p-2 bg-error/10 border border-error/20 rounded">
          <div className="flex items-center gap-2 text-error font-medium mb-1">
            <AlertCircle className="h-3 w-3" />
            <span className="text-xs">Error</span>
          </div>
          <pre className="text-xs text-error whitespace-pre-wrap">
            {typeof observation.error === 'string'
              ? observation.error
              : JSON.stringify(observation.error, null, 2)}
          </pre>
        </div>
      )}

      {/* Tool Call Details */}
      {isToolObservation ? (
        <div className="space-y-3">
          {toolCalls.map((tc: any, idx: number) => (
            <div key={idx} className="space-y-2">
              {tc.arguments && Object.keys(tc.arguments).length > 0 && (
                renderJson(tc.arguments, 'Arguments')
              )}
              {tc.result !== undefined && (
                renderJson(tc.result, 'Result')
              )}
              {tc.error && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-error">Error</div>
                  <pre className="text-xs bg-error/10 p-2 rounded text-error whitespace-pre-wrap">
                    {tc.error}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          {renderJson(observation.input, 'Input')}
          {renderJson(observation.output, 'Output')}
        </>
      )}
    </div>
  )
}

// Main TraceExplorer Component
export function TraceExplorer({ trace, selectedId, onSelect }: TraceExplorerProps) {
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // Build observation tree - prefer spans over steps
  const observations = useMemo(() => {
    // First priority: OpenInference spans (new format)
    if (trace?.spans && trace.spans.length > 0) {
      return convertOpenInferenceSpans(trace.spans)
    }
    // Second priority: raw_data.observations (legacy format)
    if (trace?.raw_data?.observations && trace.raw_data.observations.length > 0) {
      return buildObservationTree(trace.raw_data.observations)
    }
    // Fallback: convert steps to observation format (oldest format)
    if (trace?.steps && trace.steps.length > 0) {
      return convertStepsToObservations(trace.steps)
    }
    return []
  }, [trace])

  // Calculate trace timing
  const { traceStartTime, traceEndTime } = useMemo(() => {
    if (!trace?.timestamp) {
      return { traceStartTime: 0, traceEndTime: 0 }
    }

    const start = new Date(trace.timestamp).getTime()
    let end = start

    // Check raw_data.observations first
    if (trace.raw_data?.observations) {
      trace.raw_data.observations.forEach((obs: any) => {
        if (obs.endTime || obs.completedAt) {
          const obsEnd = new Date(obs.endTime || obs.completedAt).getTime()
          if (obsEnd > end) end = obsEnd
        }
      })
    }
    // Fallback: sum latency from steps metadata
    else if (trace.steps && trace.steps.length > 0) {
      const totalDuration = trace.steps.reduce((total: number, step: any) => {
        const stepLatency = step.metadata?.latency_ms || 0
        return total + stepLatency
      }, 0)
      end = start + totalDuration
    }

    return { traceStartTime: start, traceEndTime: end }
  }, [trace])

  // Helper to find observation by ID recursively
  const findObservationById = (obs: Observation[], id: string): Observation | null => {
    for (const o of obs) {
      if (o.id === id) return o
      if (o.children && o.children.length > 0) {
        const found = findObservationById(o.children, id)
        if (found) return found
      }
    }
    return null
  }

  // Helper to get all parent IDs for an observation
  const getParentIds = (obs: Observation[], targetId: string, parents: string[] = []): string[] => {
    for (const o of obs) {
      if (o.id === targetId) {
        return parents
      }
      if (o.children && o.children.length > 0) {
        const found = getParentIds(o.children, targetId, [...parents, o.id])
        if (found.length > parents.length || (found.length === parents.length && o.children.some(c => c.id === targetId))) {
          return found.length > 0 ? found : [...parents, o.id]
        }
      }
    }
    return parents
  }

  // Update selected observation and expand parents when selectedId changes
  useEffect(() => {
    if (selectedId && observations.length > 0) {
      const obs = findObservationById(observations, selectedId)
      if (obs) {
        setSelectedObservation(obs)

        // Auto-expand parent nodes
        const parentIds = getParentIds(observations, selectedId)
        if (parentIds.length > 0) {
          setExpandedNodes(prev => {
            const newSet = new Set(prev)
            parentIds.forEach(id => newSet.add(id))
            return newSet
          })
        }
      }
    } else {
      setSelectedObservation(null)
    }
  }, [selectedId, observations])

  // Initialize with all root nodes expanded
  useEffect(() => {
    if (observations.length > 0 && expandedNodes.size === 0) {
      setExpandedNodes(new Set(observations.map(o => o.id)))
    }
  }, [observations])

  const handleSelect = (obsId: string) => {
    const obs = findObservationById(observations, obsId)
    if (obs) {
      setSelectedObservation(obs)
      onSelect?.(obsId)
    }
  }

  // Convert observations to TreeDataItem format for TreeView
  const treeData = useMemo(() => {
    return convertToTreeData(observations)
  }, [observations])

  // Handle TreeView selection
  const handleTreeSelect = (item: TreeDataItem | undefined) => {
    if (item) {
      const obsItem = item as ObservationTreeItem
      setSelectedObservation(obsItem.observation)
      onSelect?.(item.id)
    }
  }

  const [isDetailOpen, setIsDetailOpen] = useState(false)

  // Open detail panel when an observation is selected
  useEffect(() => {
    if (selectedObservation) {
      setIsDetailOpen(true)
    }
  }, [selectedObservation])

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Trace</h3>
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Tree View - takes full space when detail closed, 1/3 when open */}
        <div className={cn(
          "overflow-auto",
          isDetailOpen ? "flex-shrink-0 max-h-[33%]" : "flex-1"
        )}>
          {treeData.length > 0 ? (
            <TreeView
              data={treeData}
              initialSelectedItemId={selectedId}
              onSelectChange={handleTreeSelect}
              expandAll
              className="p-0"
              renderItem={({ item, isSelected }) => {
                const obsItem = item as ObservationTreeItem
                const obs = obsItem.observation
                const Icon = getObservationIcon(obs.type)
                const colorClass = getObservationColor(obs.type).split(' ')[0]

                return (
                  <div className={cn(
                    "flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1 -mx-2 rounded-md transition-colors",
                    isSelected && "bg-primary/20 ring-1 ring-primary/40"
                  )}>
                    <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', colorClass)} />
                    <span className={cn(
                      "text-xs truncate flex-1 min-w-0",
                      isSelected && "font-medium"
                    )}>
                      {obs.name}
                    </span>
                    {obs.duration !== undefined && (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {formatDuration(obs.duration)}
                      </span>
                    )}
                    {obs.error && (
                      <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                    )}
                  </div>
                )
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-24 text-muted-foreground">
              <div className="text-center">
                <FileJson className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No trace data</p>
              </div>
            </div>
          )}
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setIsDetailOpen(!isDetailOpen)}
          className="flex items-center justify-center gap-1 py-1 border-t border-b bg-muted/30 hover:bg-muted/50 transition-colors text-xs text-muted-foreground"
        >
          {isDetailOpen ? (
            <>
              <ChevronDown className="h-3 w-3" />
              <span>Hide Details</span>
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3 rotate-[-90deg]" />
              <span>{selectedObservation ? 'Show Details' : 'Select item to view details'}</span>
            </>
          )}
        </button>

        {/* Detail Panel - 2/3 height when open */}
        {isDetailOpen && selectedObservation && (
          <div className="flex-1 overflow-auto p-2">
            <DetailPanel observation={selectedObservation} />
          </div>
        )}
      </div>
    </div>
  )
}
