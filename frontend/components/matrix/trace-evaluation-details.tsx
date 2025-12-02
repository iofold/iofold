'use client'

import { useState } from 'react'
import { AgentVersion } from '@/types/agent'
import { MatrixRow } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertCircle,
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  HelpCircle,
  MessageSquare,
  Minus,
  Search,
  ThumbsDown,
  ThumbsUp
} from 'lucide-react'
import { toast } from 'sonner'

interface TraceEvaluationDetailsProps {
  data: MatrixRow[]
  version: AgentVersion
  selectedTraces: string[]
  onTraceSelection: (traceId: string, isSelected: boolean) => void
  onContradictionClick: (trace: MatrixRow) => void
}

export function TraceEvaluationDetails({
  data,
  version,
  selectedTraces,
  onTraceSelection,
  onContradictionClick
}: TraceEvaluationDetailsProps) {
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null)

  const getRatingIcon = (result: boolean | null) => {
    if (result === null) return HelpCircle
    return result ? ThumbsUp : ThumbsDown
  }

  const getRatingColor = (result: boolean | null) => {
    if (result === null) return 'text-muted-foreground bg-muted'
    return result ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10'
  }

  const getRatingLabel = (result: boolean | null) => {
    if (result === null) return 'unknown'
    return result ? 'positive' : 'negative'
  }

  const getHumanRatingIcon = (rating: 'positive' | 'negative' | 'neutral') => {
    switch (rating) {
      case 'positive': return ThumbsUp
      case 'negative': return ThumbsDown
      case 'neutral': return Minus
      default: return HelpCircle
    }
  }

  const getHumanRatingColor = (rating: 'positive' | 'negative' | 'neutral') => {
    switch (rating) {
      case 'positive': return 'text-success bg-success/10'
      case 'negative': return 'text-destructive bg-destructive/10'
      case 'neutral': return 'text-warning bg-warning/10'
      default: return 'text-muted-foreground bg-muted'
    }
  }

  const handleExpandTrace = (traceId: string) => {
    setExpandedTrace(expandedTrace === traceId ? null : traceId)
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Filter traces that have predictions for this version
  const tracesWithEval = data.filter(row => row.predictions[version.id])

  return (
    <div className="space-y-4">
      {/* Eval Info Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">{version.prompt_template || `Eval ${version.version}`}</h3>
              <p className="text-sm text-muted-foreground">
                Showing {tracesWithEval.length} traces evaluated by this eval
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">
                {version.accuracy ? Math.round(version.accuracy) : 'N/A'}%
              </div>
              <div className="text-xs text-muted-foreground">Overall Accuracy</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trace List */}
      <div className="space-y-3">
        {tracesWithEval.map((trace) => {
          const prediction = trace.predictions[version.id]
          const hasContradiction = prediction?.is_contradiction || false
          const isExpanded = expandedTrace === trace.trace_id
          const isSelected = selectedTraces.includes(trace.trace_id)
          const HumanIcon = trace.human_feedback ? getHumanRatingIcon(trace.human_feedback.rating) : HelpCircle
          const PredictionIcon = getRatingIcon(prediction?.result ?? null)

          return (
            <Card
              key={trace.trace_id}
              className={`overflow-hidden transition-all ${
                hasContradiction ? 'border-destructive bg-destructive/5' : ''
              } ${isSelected ? 'ring-2 ring-primary' : ''}`}
            >
              {/* Trace Header */}
              <CardContent className="p-4">
                <div className="flex items-start space-x-4">
                  {/* Checkbox */}
                  <div className="pt-1">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => onTraceSelection(trace.trace_id, checked)}
                    />
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    {/* Trace ID and Metadata */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2 flex-wrap">
                          <span className="font-mono text-sm font-medium text-foreground">
                            {trace.trace_id}
                          </span>
                          {hasContradiction && (
                            <span className="px-2 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded border border-destructive flex items-center space-x-1">
                              <AlertTriangle size={12} />
                              <span>Contradiction</span>
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTimestamp(trace.trace_summary.timestamp)}
                        </div>
                      </div>
                    </div>

                    {/* Trace Content Preview */}
                    <div className="mb-3">
                      <p className="text-sm text-foreground line-clamp-2">
                        {trace.trace_summary.input_preview}
                      </p>
                    </div>

                    {/* Evaluation Summary */}
                    <div className="grid grid-cols-3 gap-4 p-3 bg-muted/50 rounded-lg">
                      {/* Human Feedback */}
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Human Feedback</div>
                        <div className="flex items-center space-x-2">
                          {trace.human_feedback ? (
                            <>
                              <HumanIcon size={16} className={getHumanRatingColor(trace.human_feedback.rating).split(' ')[0]} />
                              <span className={`text-sm font-medium capitalize ${getHumanRatingColor(trace.human_feedback.rating).split(' ')[0]}`}>
                                {trace.human_feedback.rating}
                              </span>
                            </>
                          ) : (
                            <span className="text-sm text-muted-foreground">No feedback</span>
                          )}
                        </div>
                      </div>

                      {/* Agent Evaluation */}
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Agent Evaluation</div>
                        <div className="flex items-center space-x-2">
                          <PredictionIcon size={16} className={getRatingColor(prediction?.result ?? null).split(' ')[0]} />
                          <span className={`text-sm font-medium capitalize ${getRatingColor(prediction?.result ?? null).split(' ')[0]}`}>
                            {getRatingLabel(prediction?.result ?? null)}
                          </span>
                        </div>
                      </div>

                      {/* Execution Time */}
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Execution Time</div>
                        <div className="text-sm font-medium text-foreground">
                          {prediction?.execution_time_ms ? `${prediction.execution_time_ms}ms` : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expand Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExpandTrace(trace.trace_id)}
                    className="shrink-0"
                  >
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </Button>
                </div>
              </CardContent>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t bg-muted/20 p-6 space-y-6">
                  {/* Full Trace Content */}
                  <div>
                    <h4 className="font-medium text-sm text-foreground mb-3 flex items-center">
                      <FileText size={16} className="mr-2 text-primary" />
                      Complete Trace Content
                    </h4>
                    <div className="bg-background p-4 rounded-lg border space-y-2">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Input:</div>
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {trace.trace_summary.input_preview}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Output:</div>
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {trace.trace_summary.output_preview}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Human Feedback Details */}
                  {trace.human_feedback?.notes && (
                    <div>
                      <h4 className="font-medium text-sm text-foreground mb-3 flex items-center">
                        <MessageSquare size={16} className="mr-2 text-primary" />
                        Human Feedback Notes
                      </h4>
                      <div className="bg-background p-4 rounded-lg border">
                        <p className="text-sm text-muted-foreground">
                          {trace.human_feedback.notes}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Agent Evaluation Reasoning */}
                  <div>
                    <h4 className="font-medium text-sm text-foreground mb-3 flex items-center">
                      <Brain size={16} className="mr-2 text-primary" />
                      Agent Evaluation Reasoning
                    </h4>
                    <div className={`bg-background p-4 rounded-lg border ${
                      hasContradiction ? 'border-destructive bg-destructive/5' : ''
                    }`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <PredictionIcon size={18} className={getRatingColor(prediction?.result ?? null).split(' ')[0]} />
                          <span className={`font-medium uppercase ${getRatingColor(prediction?.result ?? null).split(' ')[0]}`}>
                            {getRatingLabel(prediction?.result ?? null)}
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {prediction?.execution_time_ms}ms
                        </span>
                      </div>
                      <p className="text-sm text-foreground">
                        {prediction?.reason || 'No reasoning provided'}
                      </p>
                      {prediction?.error && (
                        <div className="mt-3 pt-3 border-t border-destructive">
                          <div className="flex items-start space-x-2 text-destructive">
                            <AlertCircle size={16} className="mt-0.5" />
                            <div>
                              <div className="font-medium text-sm">Execution Error</div>
                              <div className="text-xs mt-1">{prediction.error}</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {hasContradiction && (
                        <div className="mt-3 pt-3 border-t border-destructive">
                          <div className="flex items-start space-x-2 text-destructive">
                            <AlertTriangle size={16} className="mt-0.5" />
                            <div>
                              <div className="font-medium text-sm">Contradiction Detected</div>
                              <div className="text-xs mt-1">
                                This evaluation disagrees with human feedback. Consider reviewing for refinement.
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-3 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onContradictionClick(trace)}
                    >
                      <Eye size={16} className="mr-2" />
                      View in Comparison Panel
                    </Button>
                    {hasContradiction && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive hover:bg-destructive/5"
                        onClick={() => toast.info('Not implemented: Resolve Contradiction')}
                      >
                        <AlertCircle size={16} className="mr-2" />
                        Resolve Contradiction
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Empty State */}
      {tracesWithEval.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Search size={48} className="text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Traces Found</h3>
            <p className="text-muted-foreground">
              No traces were evaluated by this agent version, or they don&apos;t match your current filters.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
