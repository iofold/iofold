'use client'

import { useState } from 'react'
import { AgentVersion } from '@/types/agent'
import { MatrixRow } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  GitCompare,
  HelpCircle,
  History,
  Lightbulb,
  MessageCircle,
  Minus,
  MousePointer,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Zap
} from 'lucide-react'

interface ComparisonPanelProps {
  selectedContradiction: MatrixRow | null
  versions: AgentVersion[]
  onRefineEval: () => void
}

interface RefinementHistoryItem {
  id: string
  fromVersion: number
  toVersion: number
  changes: string
  contradictionsResolved: number
  accuracyImprovement: number
  timestamp: string
  status: 'completed' | 'testing' | 'draft'
}

export function ComparisonPanel({
  selectedContradiction,
  versions,
  onRefineEval
}: ComparisonPanelProps) {
  const [activeTab, setActiveTab] = useState<'comparison' | 'history' | 'insights'>('comparison')

  // Mock refinement history - in real app this would come from API
  const refinementHistory: RefinementHistoryItem[] = [
    {
      id: 'ref-1',
      fromVersion: 1,
      toVersion: 2,
      changes: 'Added accuracy prioritization over speed',
      contradictionsResolved: 2,
      accuracyImprovement: 6,
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      status: 'completed'
    }
  ]

  const getRatingIcon = (result: boolean | null) => {
    if (result === null) return HelpCircle
    return result ? ThumbsUp : ThumbsDown
  }

  const getRatingColor = (result: boolean | null) => {
    if (result === null) return 'text-gray-600 bg-gray-50'
    return result ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
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
      case 'positive': return 'text-green-600 bg-green-50'
      case 'negative': return 'text-red-600 bg-red-50'
      case 'neutral': return 'text-yellow-600 bg-yellow-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const tabOptions = [
    { id: 'comparison' as const, label: 'Comparison', icon: GitCompare },
    { id: 'history' as const, label: 'History', icon: History },
    { id: 'insights' as const, label: 'Insights', icon: Lightbulb }
  ]

  return (
    <Card className="h-fit sticky top-6">
      <CardHeader className="border-b pb-4">
        <h3 className="font-semibold text-foreground">Detailed Comparison</h3>
        <p className="text-sm text-muted-foreground">
          Side-by-side analysis and refinement suggestions
        </p>
      </CardHeader>

      {/* Tab Navigation */}
      <div className="flex border-b">
        {tabOptions.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon size={16} className="inline mr-2" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <CardContent className="p-4">
        {/* Comparison Tab */}
        {activeTab === 'comparison' && (
          <div className="space-y-4">
            {selectedContradiction ? (
              <>
                {/* Trace Overview */}
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm text-foreground mb-2">Trace Details</h4>
                    <div className="bg-muted/30 p-3 rounded text-sm">
                      <div className="font-medium text-foreground mb-1">
                        ID: {selectedContradiction.trace_id}
                      </div>
                      <div className="text-muted-foreground text-xs mb-2">
                        {formatTimestamp(selectedContradiction.trace_summary.timestamp)}
                      </div>
                      <p className="text-foreground">
                        {selectedContradiction.trace_summary.input_preview}
                      </p>
                    </div>
                  </div>

                  {/* Human Feedback */}
                  {selectedContradiction.human_feedback && (
                    <div>
                      <h4 className="font-medium text-sm text-foreground mb-2">Human Assessment</h4>
                      <div className="bg-background p-3 rounded border">
                        <div className="flex items-center space-x-2 mb-2">
                          {(() => {
                            const Icon = getHumanRatingIcon(selectedContradiction.human_feedback.rating)
                            return <Icon size={16} className="text-foreground" />
                          })()}
                          <span className={`px-2 py-1 text-xs rounded ${getHumanRatingColor(selectedContradiction.human_feedback.rating)}`}>
                            {selectedContradiction.human_feedback.rating}
                          </span>
                        </div>
                        {selectedContradiction.human_feedback.notes && (
                          <p className="text-sm text-muted-foreground italic">
                            {selectedContradiction.human_feedback.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Evaluation Comparisons */}
                  <div>
                    <h4 className="font-medium text-sm text-foreground mb-2">Evaluation Predictions</h4>
                    <div className="space-y-2">
                      {versions.map((version) => {
                        const prediction = selectedContradiction.predictions[version.id]
                        if (!prediction) return null

                        const isContradiction = prediction.is_contradiction
                        const Icon = getRatingIcon(prediction.result)

                        return (
                          <div
                            key={version.id}
                            className={`p-3 rounded border ${isContradiction ? 'border-red-200 bg-red-50/50' : 'bg-background'}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-xs text-foreground">
                                Version {version.version}
                              </span>
                              {isContradiction && (
                                <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded flex items-center">
                                  <AlertTriangle size={12} className="mr-1" />
                                  Contradiction
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 mb-2">
                              <Icon size={14} className="text-foreground" />
                              <span className={`px-2 py-1 text-xs rounded ${getRatingColor(prediction.result)}`}>
                                {prediction.result ? 'positive' : 'negative'}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {prediction.execution_time_ms}ms
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {prediction.reason || 'No reasoning provided'}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-2 pt-4 border-t">
                    <Button size="sm" onClick={onRefineEval} className="flex-1">
                      <Zap size={14} />
                      <span className="ml-2">Refine Eval</span>
                    </Button>
                    <Button variant="outline" size="sm">
                      <MessageCircle size={14} />
                      <span className="ml-2">Add Note</span>
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <MousePointer size={48} className="text-muted-foreground mx-auto mb-4" />
                <h4 className="font-medium text-foreground mb-2">Select a Trace</h4>
                <p className="text-sm text-muted-foreground">
                  Click on any trace in the matrix to view detailed comparison
                </p>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-sm text-foreground mb-3">Refinement History</h4>
              <div className="space-y-3">
                {refinementHistory.map((refinement) => (
                  <div key={refinement.id} className="bg-background p-3 rounded border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm text-foreground">
                        v{refinement.fromVersion} → v{refinement.toVersion}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded ${
                        refinement.status === 'completed' ? 'bg-green-100 text-green-700' :
                        refinement.status === 'testing' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {refinement.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {refinement.changes}
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">Contradictions Resolved:</span>
                        <span className="ml-1 text-green-600 font-medium">
                          {refinement.contradictionsResolved}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Accuracy Change:</span>
                        <span className={`ml-1 font-medium ${
                          refinement.accuracyImprovement > 0 ? 'text-green-600' :
                          refinement.accuracyImprovement < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {refinement.accuracyImprovement > 0 ? '+' : ''}{refinement.accuracyImprovement}%
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {formatTimestamp(refinement.timestamp)}
                    </div>
                  </div>
                ))}
                {refinementHistory.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No refinement history available yet
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-sm text-foreground mb-3">Pattern Analysis</h4>
              <div className="space-y-3">
                <div className="bg-blue-50 p-3 rounded border border-blue-200">
                  <div className="flex items-start space-x-2">
                    <TrendingUp size={16} className="text-blue-600 mt-0.5" />
                    <div>
                      <div className="font-medium text-sm text-blue-900">
                        Speed vs Accuracy Pattern
                      </div>
                      <p className="text-sm text-blue-700">
                        Most contradictions occur when responses are accurate but slow.
                        Consider adjusting evaluation criteria to prioritize accuracy.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                  <div className="flex items-start space-x-2">
                    <AlertCircle size={16} className="text-yellow-600 mt-0.5" />
                    <div>
                      <div className="font-medium text-sm text-yellow-900">
                        Policy Knowledge Gap
                      </div>
                      <p className="text-sm text-yellow-700">
                        High contradiction rate in policy-related queries suggests
                        evaluation model needs better policy context training.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 p-3 rounded border border-green-200">
                  <div className="flex items-start space-x-2">
                    <CheckCircle size={16} className="text-green-600 mt-0.5" />
                    <div>
                      <div className="font-medium text-sm text-green-900">
                        Technical Support Excellence
                      </div>
                      <p className="text-sm text-green-700">
                        Technical support traces show high agreement between human
                        feedback and evaluations. This domain is well-calibrated.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-sm text-foreground mb-3">Recommendations</h4>
              <div className="space-y-2">
                <div className="flex items-start space-x-2 text-sm">
                  <ArrowRight size={14} className="text-primary mt-0.5" />
                  <span className="text-muted-foreground">
                    Focus refinement on policy and billing categories
                  </span>
                </div>
                <div className="flex items-start space-x-2 text-sm">
                  <ArrowRight size={14} className="text-primary mt-0.5" />
                  <span className="text-muted-foreground">
                    Add response time tolerance to evaluation criteria
                  </span>
                </div>
                <div className="flex items-start space-x-2 text-sm">
                  <ArrowRight size={14} className="text-primary mt-0.5" />
                  <span className="text-muted-foreground">
                    Collect more training examples for edge cases
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
