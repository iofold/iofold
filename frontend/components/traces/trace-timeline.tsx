"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"

export interface Span {
  id: string
  name: string
  type: 'span' | 'generation' | 'event' | 'tool' | 'agent' | 'retriever'
  startTime: number // ms from trace start
  duration: number // ms
  parentId?: string
  status: 'success' | 'error' | 'running'
  level: number // nesting level
}

export interface TraceTimelineProps {
  spans: Span[]
  totalDuration: number
  onSpanClick?: (spanId: string) => void
  selectedSpanId?: string
  className?: string
}

const SPAN_TYPE_COLORS = {
  generation: {
    bg: 'bg-blue-500',
    bgLight: 'bg-blue-100',
    border: 'border-blue-500',
    text: 'text-blue-700',
  },
  span: {
    bg: 'bg-gray-500',
    bgLight: 'bg-gray-100',
    border: 'border-gray-500',
    text: 'text-gray-700',
  },
  tool: {
    bg: 'bg-purple-500',
    bgLight: 'bg-purple-100',
    border: 'border-purple-500',
    text: 'text-purple-700',
  },
  agent: {
    bg: 'bg-green-500',
    bgLight: 'bg-green-100',
    border: 'border-green-500',
    text: 'text-green-700',
  },
  event: {
    bg: 'bg-orange-500',
    bgLight: 'bg-orange-100',
    border: 'border-orange-500',
    text: 'text-orange-700',
  },
  retriever: {
    bg: 'bg-cyan-500',
    bgLight: 'bg-cyan-100',
    border: 'border-cyan-500',
    text: 'text-cyan-700',
  },
}

function formatTime(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(2)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`
}

function getTimeMarkers(totalDuration: number, zoom: number): number[] {
  const adjustedDuration = totalDuration / zoom
  let interval: number

  if (adjustedDuration < 100) interval = 10
  else if (adjustedDuration < 500) interval = 50
  else if (adjustedDuration < 1000) interval = 100
  else if (adjustedDuration < 5000) interval = 500
  else if (adjustedDuration < 10000) interval = 1000
  else if (adjustedDuration < 60000) interval = 5000
  else interval = 10000

  const markers: number[] = []
  for (let i = 0; i <= totalDuration; i += interval) {
    markers.push(i)
  }
  if (markers[markers.length - 1] < totalDuration) {
    markers.push(totalDuration)
  }
  return markers
}

export function TraceTimeline({
  spans,
  totalDuration,
  onSpanClick,
  selectedSpanId,
  className,
}: TraceTimelineProps) {
  const [zoom, setZoom] = React.useState(1)
  const [scrollPosition, setScrollPosition] = React.useState(0)
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)

  const maxLevel = Math.max(...spans.map(s => s.level), 0)
  const timelineWidth = 100 * zoom // percentage
  const timeMarkers = getTimeMarkers(totalDuration, zoom)

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.5, 10))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.5, 1))
  }

  const handleResetZoom = () => {
    setZoom(1)
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0
    }
  }

  const getSpanPosition = (span: Span) => {
    const left = (span.startTime / totalDuration) * 100
    const width = Math.max((span.duration / totalDuration) * 100, 0.5) // min 0.5% width
    return { left, width }
  }

  return (
    <div className={cn("flex flex-col gap-3 bg-white rounded-lg border p-4", className)}>
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Timeline</h3>
          <span className="text-xs text-gray-600">
            {spans.length} span{spans.length !== 1 ? 's' : ''} · {formatTime(totalDuration)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            className="h-8 w-8"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleResetZoom}
            disabled={zoom === 1}
            className="h-8 w-8"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            disabled={zoom >= 10}
            className="h-8 w-8"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          {zoom > 1 && (
            <span className="text-xs text-gray-600 ml-2">{zoom.toFixed(1)}x</span>
          )}
        </div>
      </div>

      {/* Timeline container with scroll */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-hidden"
        style={{ maxHeight: `${(maxLevel + 3) * 36}px` }}
      >
        <div className="relative min-w-full" style={{ width: `${timelineWidth}%` }}>
          {/* Time markers */}
          <div className="relative h-6 border-b border-gray-200">
            {timeMarkers.map((time, idx) => {
              const position = (time / totalDuration) * 100
              return (
                <div
                  key={idx}
                  className="absolute top-0 flex flex-col items-start"
                  style={{ left: `${position}%` }}
                >
                  <div className="h-2 w-px bg-gray-300" />
                  <span className="text-[10px] text-gray-600 mt-0.5 whitespace-nowrap">
                    {formatTime(time)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Spans */}
          <div className="relative pt-2">
            <TooltipProvider>
              {spans.map((span) => {
                const { left, width } = getSpanPosition(span)
                const colors = SPAN_TYPE_COLORS[span.type]
                const isSelected = selectedSpanId === span.id
                const isError = span.status === 'error'
                const isRunning = span.status === 'running'

                return (
                  <Tooltip key={span.id}>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute h-7 cursor-pointer transition-all hover:z-10"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          top: `${span.level * 36}px`,
                        }}
                        onClick={() => onSpanClick?.(span.id)}
                      >
                        <div
                          className={cn(
                            "h-full rounded px-2 flex items-center",
                            "border transition-all",
                            colors.bgLight,
                            isSelected && "ring-2 ring-blue-500 ring-offset-1",
                            isError && "border-red-500 bg-red-50",
                            isRunning && "animate-pulse",
                            !isError && !isSelected && colors.border,
                          )}
                        >
                          {/* Left color indicator */}
                          <div
                            className={cn(
                              "absolute left-0 top-0 bottom-0 w-1 rounded-l",
                              isError ? "bg-red-500" : colors.bg
                            )}
                          />

                          {/* Span name (if space allows) */}
                          {width > 5 && (
                            <span
                              className={cn(
                                "text-xs font-medium truncate ml-1",
                                isError ? "text-red-700" : colors.text
                              )}
                            >
                              {span.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-1">
                        <div className="font-semibold">{span.name}</div>
                        <div className="text-xs space-y-0.5">
                          <div>Type: <span className="font-medium">{span.type}</span></div>
                          <div>Duration: <span className="font-medium">{formatTime(span.duration)}</span></div>
                          <div>Start: <span className="font-medium">{formatTime(span.startTime)}</span></div>
                          <div>Status: <span className={cn(
                            "font-medium",
                            span.status === 'success' && "text-green-600",
                            span.status === 'error' && "text-red-600",
                            span.status === 'running' && "text-blue-600"
                          )}>{span.status}</span></div>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 pt-2 border-t">
        {Object.entries(SPAN_TYPE_COLORS).map(([type, colors]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={cn("w-3 h-3 rounded", colors.bg)} />
            <span className="text-xs text-gray-600 capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
