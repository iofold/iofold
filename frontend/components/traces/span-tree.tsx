"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  ChevronRight,
  ChevronDown,
  Sparkles,
  Box,
  Calendar,
  Wrench,
  Bot,
  Database,
  AlertCircle,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export interface SpanTreeNode {
  id: string
  name: string
  type: 'span' | 'generation' | 'event' | 'tool' | 'agent' | 'retriever'
  startTime: number
  duration: number
  status: 'success' | 'error' | 'running'
  children?: SpanTreeNode[]
}

export interface SpanTreeProps {
  spans: SpanTreeNode[]
  onSpanClick?: (spanId: string) => void
  selectedSpanId?: string
  className?: string
}

const SPAN_TYPE_CONFIG = {
  generation: {
    icon: Sparkles,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    label: 'Generation',
  },
  span: {
    icon: Box,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    label: 'Span',
  },
  tool: {
    icon: Wrench,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    label: 'Tool',
  },
  agent: {
    icon: Bot,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    label: 'Agent',
  },
  event: {
    icon: Calendar,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    label: 'Event',
  },
  retriever: {
    icon: Database,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    label: 'Retriever',
  },
}

function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(2)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`
}

interface SpanTreeNodeProps {
  node: SpanTreeNode
  level: number
  onSpanClick?: (spanId: string) => void
  selectedSpanId?: string
  isExpanded: boolean
  onToggle: () => void
}

function SpanTreeNodeComponent({
  node,
  level,
  onSpanClick,
  selectedSpanId,
  isExpanded,
  onToggle,
}: SpanTreeNodeProps) {
  const config = SPAN_TYPE_CONFIG[node.type]
  const Icon = config.icon
  const hasChildren = node.children && node.children.length > 0
  const isSelected = selectedSpanId === node.id
  const isError = node.status === 'error'
  const isRunning = node.status === 'running'

  return (
    <div className="select-none">
      {/* Node row */}
      <div
        className={cn(
          "flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer transition-colors group",
          "hover:bg-gray-50",
          isSelected && "bg-blue-50 hover:bg-blue-50",
          isError && "bg-red-50 hover:bg-red-50"
        )}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => onSpanClick?.(node.id)}
      >
        {/* Expand/collapse button */}
        <div className="flex-shrink-0">
          {hasChildren ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0 hover:bg-gray-200"
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-600" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-600" />
              )}
            </Button>
          ) : (
            <div className="w-5" />
          )}
        </div>

        {/* Icon */}
        <div
          className={cn(
            "flex-shrink-0 p-1.5 rounded",
            isError ? "bg-red-100" : config.bgColor
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              isError ? "text-red-600" : config.color
            )}
          />
        </div>

        {/* Span name */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium truncate",
              isError && "text-red-700",
              !isError && "text-gray-900"
            )}
          >
            {node.name}
          </span>
          {isError && (
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          )}
          {isRunning && (
            <Clock className="h-4 w-4 text-blue-500 flex-shrink-0 animate-pulse" />
          )}
        </div>

        {/* Duration */}
        <div className="flex-shrink-0 flex items-center gap-1.5">
          <span
            className={cn(
              "text-xs font-mono",
              isError ? "text-red-600" : "text-gray-600"
            )}
          >
            {formatDuration(node.duration)}
          </span>
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              node.status === 'success' && "bg-green-500",
              node.status === 'error' && "bg-red-500",
              node.status === 'running' && "bg-blue-500 animate-pulse"
            )}
          />
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <SpanTreeNodeWrapper
              key={child.id}
              node={child}
              level={level + 1}
              onSpanClick={onSpanClick}
              selectedSpanId={selectedSpanId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SpanTreeNodeWrapperProps {
  node: SpanTreeNode
  level: number
  onSpanClick?: (spanId: string) => void
  selectedSpanId?: string
}

function SpanTreeNodeWrapper({
  node,
  level,
  onSpanClick,
  selectedSpanId,
}: SpanTreeNodeWrapperProps) {
  const [isExpanded, setIsExpanded] = React.useState(true)

  return (
    <SpanTreeNodeComponent
      node={node}
      level={level}
      onSpanClick={onSpanClick}
      selectedSpanId={selectedSpanId}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
    />
  )
}

export function SpanTree({
  spans,
  onSpanClick,
  selectedSpanId,
  className,
}: SpanTreeProps) {
  const [expandedAll, setExpandedAll] = React.useState(true)
  const [expandedNodes, setExpandedNodes] = React.useState<Set<string>>(
    new Set(spans.map(s => s.id))
  )

  const toggleAll = () => {
    if (expandedAll) {
      setExpandedNodes(new Set())
    } else {
      const allIds = new Set<string>()
      const collectIds = (nodes: SpanTreeNode[]) => {
        nodes.forEach(node => {
          allIds.add(node.id)
          if (node.children) collectIds(node.children)
        })
      }
      collectIds(spans)
      setExpandedNodes(allIds)
    }
    setExpandedAll(!expandedAll)
  }

  const totalSpans = React.useMemo(() => {
    let count = 0
    const countNodes = (nodes: SpanTreeNode[]) => {
      nodes.forEach(node => {
        count++
        if (node.children) countNodes(node.children)
      })
    }
    countNodes(spans)
    return count
  }, [spans])

  return (
    <div className={cn("flex flex-col gap-3 bg-white rounded-lg border p-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Span Tree</h3>
          <span className="text-xs text-gray-500">
            {totalSpans} span{totalSpans !== 1 ? 's' : ''}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleAll}
          className="h-8 text-xs"
        >
          {expandedAll ? 'Collapse All' : 'Expand All'}
        </Button>
      </div>

      {/* Tree */}
      <div className="space-y-0.5 max-h-[600px] overflow-y-auto">
        {spans.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No spans to display
          </div>
        ) : (
          spans.map((span) => (
            <SpanTreeNodeWrapper
              key={span.id}
              node={span}
              level={0}
              onSpanClick={onSpanClick}
              selectedSpanId={selectedSpanId}
            />
          ))
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 border-t">
        {Object.entries(SPAN_TYPE_CONFIG).map(([type, config]) => {
          const Icon = config.icon
          return (
            <div key={type} className="flex items-center gap-1.5">
              <div className={cn("p-1 rounded", config.bgColor)}>
                <Icon className={cn("h-3 w-3", config.color)} />
              </div>
              <span className="text-xs text-gray-600">{config.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
