'use client'

import { AgentVersion } from '@/types/agent'
import { MatrixRow } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import {
  AlertTriangle,
  ArrowRight,
  Info,
  Layers,
  Minus,
  Plus,
  ThumbsDown,
  ThumbsUp
} from 'lucide-react'

interface AgentVersionOverviewProps {
  versions: AgentVersion[]
  matrixData: MatrixRow[]
  onVersionClick: (version: AgentVersion) => void
}

interface VersionMetrics {
  totalTraces: number
  contradictions: number
  contradictionRate: number
  positiveCount: number
  negativeCount: number
  neutralCount: number
  avgConfidence: number
}

export function AgentVersionOverview({
  versions,
  matrixData,
  onVersionClick
}: AgentVersionOverviewProps) {

  const calculateMetrics = (versionId: string): VersionMetrics => {
    const versionTraces = matrixData.filter(row =>
      row.predictions[versionId]
    )

    const totalTraces = versionTraces.length
    const contradictions = versionTraces.filter(row =>
      row.predictions[versionId]?.is_contradiction
    ).length

    const positiveCount = versionTraces.filter(row =>
      row.predictions[versionId]?.result === true
    ).length

    const negativeCount = versionTraces.filter(row =>
      row.predictions[versionId]?.result === false
    ).length

    const neutralCount = totalTraces - positiveCount - negativeCount

    // Calculate average confidence (placeholder - would come from actual data)
    const avgConfidence = 85

    return {
      totalTraces,
      contradictions,
      contradictionRate: totalTraces > 0 ? Math.round((contradictions / totalTraces) * 100) : 0,
      positiveCount,
      negativeCount,
      neutralCount,
      avgConfidence
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 border-green-200'
      case 'candidate': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'rejected': return 'bg-red-100 text-red-700 border-red-200'
      case 'archived': return 'bg-gray-100 text-gray-700 border-gray-200'
      default: return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="space-y-6 mt-6">
      {/* Overview Description */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start space-x-3">
            <Info className="text-primary mt-1" size={20} />
            <div>
              <h3 className="font-semibold text-foreground mb-2">How to Use This View</h3>
              <p className="text-sm text-muted-foreground">
                This overview shows evaluation performance metrics across different agent versions.
                Click on any version card to view detailed per-trace evaluation outputs, contradictions, and reasoning.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent Version Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {versions.map((version) => {
          const metrics = calculateMetrics(version.id)

          return (
            <Card
              key={version.id}
              interactive
              onClick={() => onVersionClick(version)}
              className="group"
            >
              <CardHeader className="border-b pb-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-foreground mb-1 group-hover:text-primary transition-colors">
                      Version {version.version}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(version.created_at)}
                      </span>
                    </div>
                  </div>
                  <span className={`px-3 py-1 text-xs font-medium rounded-full border ${getStatusColor(version.status)}`}>
                    {version.status}
                  </span>
                </div>

                {/* Accuracy Score */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground mb-1">Overall Accuracy</div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-bold text-foreground">
                      {version.accuracy ? Math.round(version.accuracy) : 'N/A'}%
                    </span>
                    <span className="text-sm text-muted-foreground">
                      ({metrics.avgConfidence}% avg confidence)
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-6">
                {/* Evaluation Distribution */}
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-3">
                    Evaluation Distribution
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <ThumbsUp size={14} className="text-green-600" />
                        <span className="text-sm text-foreground">Positive</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-foreground">{metrics.positiveCount}</span>
                        <span className="text-xs text-muted-foreground">
                          ({metrics.totalTraces > 0 ? Math.round((metrics.positiveCount / metrics.totalTraces) * 100) : 0}%)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Minus size={14} className="text-yellow-600" />
                        <span className="text-sm text-foreground">Neutral</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-foreground">{metrics.neutralCount}</span>
                        <span className="text-xs text-muted-foreground">
                          ({metrics.totalTraces > 0 ? Math.round((metrics.neutralCount / metrics.totalTraces) * 100) : 0}%)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <ThumbsDown size={14} className="text-red-600" />
                        <span className="text-sm text-foreground">Negative</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-foreground">{metrics.negativeCount}</span>
                        <span className="text-xs text-muted-foreground">
                          ({metrics.totalTraces > 0 ? Math.round((metrics.negativeCount / metrics.totalTraces) * 100) : 0}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contradiction Stats */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle size={16} className="text-red-600" />
                      <span className="text-sm font-medium text-foreground">Contradictions</span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-red-600">{metrics.contradictions}</div>
                      <div className="text-xs text-muted-foreground">{metrics.contradictionRate}% rate</div>
                    </div>
                  </div>
                </div>

                {/* Total Traces */}
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Traces Evaluated</span>
                    <span className="text-sm font-medium text-foreground">{metrics.totalTraces}</span>
                  </div>
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors"
                >
                  <span>View Trace Details</span>
                  <ArrowRight size={16} className="ml-2" />
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {/* Empty State */}
      {versions.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Layers size={48} className="text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Agent Versions Found</h3>
            <p className="text-muted-foreground mb-4">
              There are no evaluation versions available to display.
            </p>
            <Button variant="outline">
              <Plus size={16} className="mr-2" />
              Create New Version
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
