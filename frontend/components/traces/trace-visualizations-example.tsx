/**
 * Example usage of TraceTimeline and SpanTree components
 * This file demonstrates how to integrate the visualization components
 * into a trace detail page.
 */

"use client"

import * as React from "react"
import { TraceTimeline, type Span } from "./trace-timeline"
import { SpanTree, type SpanTreeNode } from "./span-tree"

// Example: Converting flat spans to tree structure
function buildSpanTree(flatSpans: Span[]): SpanTreeNode[] {
  const spanMap = new Map<string, SpanTreeNode>()
  const roots: SpanTreeNode[] = []

  // First pass: create nodes
  flatSpans.forEach(span => {
    spanMap.set(span.id, {
      id: span.id,
      name: span.name,
      type: span.type,
      startTime: span.startTime,
      duration: span.duration,
      status: span.status,
      children: [],
    })
  })

  // Second pass: build tree
  flatSpans.forEach(span => {
    const node = spanMap.get(span.id)!
    if (span.parentId) {
      const parent = spanMap.get(span.parentId)
      if (parent) {
        parent.children = parent.children || []
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    } else {
      roots.push(node)
    }
  })

  return roots
}

// Example component showing both visualizations
export function TraceVisualizationsExample() {
  const [selectedSpanId, setSelectedSpanId] = React.useState<string>()

  // Example data
  const spans: Span[] = [
    {
      id: "span-1",
      name: "Agent Execution",
      type: "agent",
      startTime: 0,
      duration: 1500,
      status: "success",
      level: 0,
    },
    {
      id: "span-2",
      name: "LLM Generation",
      type: "generation",
      startTime: 100,
      duration: 800,
      parentId: "span-1",
      status: "success",
      level: 1,
    },
    {
      id: "span-3",
      name: "Tool Call: search",
      type: "tool",
      startTime: 950,
      duration: 450,
      parentId: "span-1",
      status: "success",
      level: 1,
    },
    {
      id: "span-4",
      name: "Retriever Query",
      type: "retriever",
      startTime: 1000,
      duration: 300,
      parentId: "span-3",
      status: "success",
      level: 2,
    },
    {
      id: "span-5",
      name: "Final Response",
      type: "generation",
      startTime: 1420,
      duration: 50,
      parentId: "span-1",
      status: "success",
      level: 1,
    },
  ]

  const treeData = buildSpanTree(spans)
  const totalDuration = Math.max(...spans.map(s => s.startTime + s.duration))

  return (
    <div className="space-y-6">
      {/* Timeline View */}
      <TraceTimeline
        spans={spans}
        totalDuration={totalDuration}
        selectedSpanId={selectedSpanId}
        onSpanClick={setSelectedSpanId}
      />

      {/* Tree View */}
      <SpanTree
        spans={treeData}
        selectedSpanId={selectedSpanId}
        onSpanClick={setSelectedSpanId}
      />

      {/* Selected Span Details */}
      {selectedSpanId && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-2">Selected Span</h3>
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">
            {JSON.stringify(
              spans.find(s => s.id === selectedSpanId),
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  )
}
