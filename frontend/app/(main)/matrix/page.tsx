'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Info,
  Layers,
  Loader2,
  Minus,
  ThumbsDown,
  ThumbsUp
} from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import type { AgentWithDetails } from '@/types/agent'

export default function MatrixPage() {
  // Fetch agents list
  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.listAgents(),
  })

  // Fetch detailed data for each agent to get metrics
  const { data: agentsDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['agents-details', agentsData?.agents?.map(a => a.id)],
    queryFn: async () => {
      if (!agentsData?.agents?.length) return []
      const details = await Promise.all(
        agentsData.agents.map(agent => apiClient.getAgent(agent.id))
      )
      return details
    },
    enabled: !!agentsData?.agents?.length,
  })

  const isLoading = agentsLoading || detailsLoading
  const agents = agentsDetails || []

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-success text-white border-success'
      case 'pending':
        return 'bg-warning text-warning-foreground border-warning'
      case 'draft':
        return 'bg-muted text-foreground border-border'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const calculatePercentage = (count: number, total: number) => {
    if (total === 0) return 0
    return Math.round((count / total) * 100)
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Agent Performance Overview
        </h1>
        <p className="text-muted-foreground">
          Compare evaluation scores and feedback across your agents
        </p>
      </div>

      {/* Info Box */}
      <div className="bg-card rounded-lg border border-border p-6 mb-8 shadow-sm">
        <div className="flex items-start space-x-3">
          <Info className="text-primary mt-1 flex-shrink-0" size={20} />
          <div>
            <h3 className="font-semibold text-foreground mb-2">
              How to Use This View
            </h3>
            <p className="text-sm text-muted-foreground">
              This overview shows evaluation performance metrics across your agents.
              Click on any agent card to view detailed per-trace evaluation outputs, contradictions, and reasoning.
            </p>
          </div>
        </div>
      </div>

      {/* Agent Performance Cards */}
      {agents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent: AgentWithDetails) => {
            const totalFeedback = agent.metrics.feedback_count
            const positiveCount = agent.metrics.positive_feedback_count
            const negativeCount = agent.metrics.negative_feedback_count
            const neutralCount = totalFeedback - positiveCount - negativeCount
            const contradictionCount = agent.metrics.contradiction_rate
              ? Math.round(agent.metrics.contradiction_rate * totalFeedback)
              : 0

            return (
              <Link
                key={agent.id}
                href={`/matrix/${agent.id}`}
                className="block group"
                aria-label={`View details for ${agent.name}`}
              >
                <div className="bg-card rounded-lg border border-border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden h-full flex flex-col cursor-pointer">
                  {/* Card Header */}
                  <div className="border-b border-border p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-foreground mb-1 group-hover:text-primary transition-colors">
                          {agent.name}
                        </h3>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(agent.created_at)}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 text-xs font-medium rounded-full border capitalize ${getStatusColor(
                          agent.status
                        )}`}
                      >
                        {agent.status}
                      </span>
                    </div>

                    {/* Overall Accuracy */}
                    <div className="bg-muted rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">
                        Overall Accuracy
                      </div>
                      <div className="flex items-baseline space-x-2">
                        <span className="text-3xl font-bold text-foreground">
                          {agent.metrics.accuracy !== null
                            ? `${Math.round(agent.metrics.accuracy * 100)}%`
                            : 'N/A'}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          ({agent.metrics.eval_count} evals)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-6 flex-1 flex flex-col space-y-4">
                    {/* Feedback Distribution */}
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-3">
                        Feedback Distribution
                      </div>
                      <div className="space-y-2">
                        {/* Positive */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <ThumbsUp size={14} className="text-success" />
                            <span className="text-sm text-foreground">Positive</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-foreground">
                              {positiveCount}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({calculatePercentage(positiveCount, totalFeedback)}%)
                            </span>
                          </div>
                        </div>

                        {/* Neutral */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Minus size={14} className="text-warning" />
                            <span className="text-sm text-foreground">Neutral</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-foreground">
                              {neutralCount}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({calculatePercentage(neutralCount, totalFeedback)}%)
                            </span>
                          </div>
                        </div>

                        {/* Negative */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <ThumbsDown size={14} className="text-destructive" />
                            <span className="text-sm text-foreground">Negative</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-foreground">
                              {negativeCount}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({calculatePercentage(negativeCount, totalFeedback)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Contradictions */}
                    <div className="pt-4 border-t border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle size={16} className="text-destructive" />
                          <span className="text-sm font-medium text-foreground">
                            Contradictions
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-destructive">
                            {contradictionCount}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {agent.metrics.contradiction_rate !== null
                              ? `${Math.round(agent.metrics.contradiction_rate * 100)}% rate`
                              : 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Total Traces */}
                    <div className="pt-2 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Total Traces
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {agent.metrics.trace_count}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="p-6 pt-0">
                    <div
                      className="w-full py-2 px-4 border border-border rounded-lg text-foreground group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-colors flex items-center justify-center space-x-2"
                      role="button"
                      aria-label={`View trace details for ${agent.name}`}
                    >
                      <span>View Details</span>
                      <ArrowRight size={16} />
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <Layers size={48} className="text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            No Agents Found
          </h3>
          <p className="text-muted-foreground mb-4">
            Create an agent to start tracking evaluation metrics.
          </p>
          <Link href="/agents">
            <button className="py-2 px-4 border border-border rounded-lg text-foreground hover:bg-primary hover:text-white hover:border-primary transition-colors">
              View Agents
            </button>
          </Link>
        </div>
      )}
    </div>
  )
}
