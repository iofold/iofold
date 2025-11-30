/**
 * PreviousSteps Component
 *
 * Displays previous conversation steps in an expandable section.
 * Shows chronological message history with tool calls.
 */

import { PreviousStep } from '@/types/trace'
import { formatRelativeTime } from '@/lib/trace-parser'

interface PreviousStepsProps {
  steps: PreviousStep[]
}

export function PreviousSteps({ steps }: PreviousStepsProps) {
  if (!steps || steps.length === 0) {
    return null
  }

  // Exclude the last two messages (human and assistant) as they're shown in the main view
  const previousSteps = steps.slice(0, -2)

  if (previousSteps.length === 0) {
    return null
  }

  return (
    <div className="px-4 pb-4 border-t border-border">
      <div className="pt-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">
          Previous Messages ({previousSteps.length}):
        </h3>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {previousSteps.map((step, index) => (
            <div key={index} className="space-y-1">
              {/* Message Header */}
              <div className="flex items-center gap-2">
                <span role="img" aria-label={step.role === 'human' ? 'Human' : 'Assistant'} className="text-base">
                  {step.role === 'human' ? '👤' : '🤖'}
                </span>
                <span className={`text-sm font-semibold ${step.role === 'human' ? 'text-info' : 'text-purple-700'}`}>
                  {step.role === 'human' ? 'Human' : 'Assistant'}:
                </span>
                {step.timestamp && (
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(step.timestamp)}
                  </span>
                )}
              </div>

              {/* Message Content */}
              <div className={`ml-7 border-l-4 p-3 rounded-r ${
                step.role === 'human'
                  ? 'bg-info/10 border-info'
                  : 'bg-purple-50 border-purple-500'
              }`}>
                <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                  {step.content}
                </p>

                {/* Tool Calls (if any) */}
                {step.tools && step.tools.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <div className="text-xs text-muted-foreground mb-1 font-semibold">
                      🔧 Tool Calls:
                    </div>
                    {step.tools.map((tool, toolIndex) => (
                      <div key={toolIndex} className="text-xs text-muted-foreground ml-4 mb-1">
                        <code className="font-mono">
                          {tool.name}
                          {tool.module && <span className="text-muted-foreground"> ({tool.module})</span>}
                        </code>
                        {tool.error && (
                          <div className="text-destructive mt-0.5">
                            → ❌ Error: {tool.error}
                          </div>
                        )}
                        {tool.result !== undefined && !tool.error && (
                          <div className="text-success mt-0.5">
                            → Result: {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
