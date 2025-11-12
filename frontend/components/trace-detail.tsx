'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trace } from '@/types/api'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TraceDetailProps {
  trace: Trace
}

export function TraceDetail({ trace }: TraceDetailProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepId)) {
        next.delete(stepId)
      } else {
        next.add(stepId)
      }
      return next
    })
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Metadata</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Source</div>
            <div className="font-medium capitalize">{trace.source}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Timestamp</div>
            <div className="font-medium">
              {new Date(trace.timestamp).toLocaleString()}
            </div>
          </div>
          {Object.entries(trace.metadata).map(([key, value]) => (
            <div key={key}>
              <div className="text-sm text-muted-foreground mb-1">{key}</div>
              <div className="font-medium">{String(value)}</div>
            </div>
          ))}
        </div>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-4">Execution Steps</h2>
        <div className="space-y-2">
          {trace.steps.map((step, index) => (
            <Card key={step.step_id} className="overflow-hidden">
              <Button
                variant="ghost"
                className="w-full justify-between p-4 h-auto"
                onClick={() => toggleStep(step.step_id)}
              >
                <div className="flex items-center gap-3">
                  {expandedSteps.has(step.step_id) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span className="font-medium">Step {index + 1}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(step.timestamp).toLocaleTimeString()}
                  </span>
                  {step.error && (
                    <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">
                      Error
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {step.messages_added.length} messages, {step.tool_calls.length} tools
                </div>
              </Button>

              {expandedSteps.has(step.step_id) && (
                <div className="p-4 pt-0 space-y-4">
                  {step.messages_added.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Messages</h3>
                      <div className="space-y-2">
                        {step.messages_added.map((msg, i) => (
                          <div
                            key={i}
                            className={cn(
                              "p-3 rounded-lg",
                              msg.role === 'user'
                                ? 'bg-blue-50'
                                : msg.role === 'assistant'
                                ? 'bg-green-50'
                                : 'bg-gray-50'
                            )}
                          >
                            <div className="text-xs font-medium mb-1 capitalize">
                              {msg.role}
                            </div>
                            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {step.tool_calls.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Tool Calls</h3>
                      <div className="space-y-2">
                        {step.tool_calls.map((tool, i) => (
                          <div key={i} className="p-3 rounded-lg bg-purple-50">
                            <div className="text-xs font-medium mb-1">{tool.tool_name}</div>
                            <div className="text-xs text-muted-foreground mb-2">
                              <pre className="overflow-x-auto">
                                {JSON.stringify(tool.arguments, null, 2)}
                              </pre>
                            </div>
                            {tool.result && (
                              <div className="text-xs">
                                <div className="font-medium mb-1">Result:</div>
                                <pre className="overflow-x-auto">
                                  {JSON.stringify(tool.result, null, 2)}
                                </pre>
                              </div>
                            )}
                            {tool.error && (
                              <div className="text-xs text-red-600 mt-2">
                                Error: {tool.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {step.error && (
                    <div className="p-3 rounded-lg bg-red-50">
                      <div className="text-sm font-medium text-red-700 mb-1">Error</div>
                      <div className="text-sm text-red-600">{step.error}</div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
