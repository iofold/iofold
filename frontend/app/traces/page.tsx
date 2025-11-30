'use client'

import { Suspense, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { TraceFeedback } from '@/components/trace-feedback'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { Upload, Inbox, Filter, X, Keyboard } from 'lucide-react'
import { formatRelativeTime, getRatingEmoji, truncate } from '@/lib/utils'
import { ImportTracesModal } from '@/components/import-traces-modal'
import { TraceListSkeleton } from '@/components/skeletons/trace-skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MetricsBar } from '@/components/traces/MetricsBar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

function TracesPageContent() {
  const searchParams = useSearchParams()
  const urlAgentId = searchParams?.get('agent_id')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(urlAgentId || null)
  const [importModalOpen, setImportModalOpen] = useState(false)

  // Filter state
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [hasFeedbackFilter, setHasFeedbackFilter] = useState<string>('')
  const [ratingFilter, setRatingFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)

  // Build query params based on filters
  const queryParams = useMemo(() => {
    const params: {
      limit: number
      source?: string
      has_feedback?: boolean
      rating?: string
      date_from?: string
      date_to?: string
    } = { limit: 50 }

    if (sourceFilter) params.source = sourceFilter
    if (hasFeedbackFilter === 'true') params.has_feedback = true
    if (hasFeedbackFilter === 'false') params.has_feedback = false
    if (ratingFilter) params.rating = ratingFilter
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo

    return params
  }, [sourceFilter, hasFeedbackFilter, ratingFilter, dateFrom, dateTo])

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (sourceFilter) count++
    if (hasFeedbackFilter) count++
    if (ratingFilter) count++
    if (dateFrom) count++
    if (dateTo) count++
    return count
  }, [sourceFilter, hasFeedbackFilter, ratingFilter, dateFrom, dateTo])

  // Clear all filters
  const clearFilters = () => {
    setSourceFilter('')
    setHasFeedbackFilter('')
    setRatingFilter('')
    setDateFrom('')
    setDateTo('')
  }

  // Fetch agents for the selector
  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.listAgents(),
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['traces', queryParams],
    queryFn: () => apiClient.listTraces(queryParams),
  })

  // Compute metrics from trace data
  const metrics = useMemo(() => {
    if (!data?.traces) return { totalTraces: 0, feedbackCount: 0, errorCount: 0 }

    const traces = data.traces
    const totalTraces = data.total_count || traces.length
    const feedbackCount = traces.filter((t: any) => t.feedback).length
    const errorCount = traces.filter((t: any) => t.summary?.has_errors).length

    return { totalTraces, feedbackCount, errorCount }
  }, [data])

  // Get the effective agent ID (from existing feedback or selected)
  const getEffectiveAgentId = (trace: any) => {
    return trace.feedback?.agent_id || selectedAgentId
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Traces</h1>
            <p className="text-muted-foreground">
              Browse and annotate imported traces
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground">
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="text-sm">
                  <p className="font-semibold mb-2">Keyboard Shortcuts</p>
                  <div className="space-y-1">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Navigate traces</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">j/k</kbd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Open trace</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Enter</kbd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Toggle filters</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">f</kbd>
                    </div>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="toggle-filters-button"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button onClick={() => setImportModalOpen(true)} data-testid="import-traces-button">
              <Upload className="w-4 h-4 mr-2" />
              Import Traces
            </Button>
          </div>
        </div>

        {/* Metrics Bar */}
        <MetricsBar
          totalTraces={metrics.totalTraces}
          feedbackCount={metrics.feedbackCount}
          errorCount={metrics.errorCount}
          isLoading={isLoading}
        />

      {/* Filters Panel */}
      {showFilters && (
        <Card className="mb-6 p-4" data-testid="trace-filters-panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">Filter Traces</h3>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-1" />
                Clear All
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="source-filter">Source</Label>
              <Select
                value={sourceFilter}
                onValueChange={setSourceFilter}
              >
                <SelectTrigger id="source-filter" data-testid="source-filter">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All sources</SelectItem>
                  <SelectItem value="langfuse">Langfuse</SelectItem>
                  <SelectItem value="langsmith">Langsmith</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-filter">Has Feedback</Label>
              <Select
                value={hasFeedbackFilter}
                onValueChange={setHasFeedbackFilter}
              >
                <SelectTrigger id="feedback-filter" data-testid="has-feedback-filter">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  <SelectItem value="true">With feedback</SelectItem>
                  <SelectItem value="false">Without feedback</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rating-filter">Rating</Label>
              <Select
                value={ratingFilter}
                onValueChange={setRatingFilter}
              >
                <SelectTrigger id="rating-filter" data-testid="rating-filter">
                  <SelectValue placeholder="Any rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any rating</SelectItem>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-from">From Date</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="date-from-filter"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-to">To Date</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="date-to-filter"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Agent Selector */}
      <div className="mb-6 p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">Agent for Feedback:</label>
          <Select
            value={selectedAgentId || ''}
            onValueChange={(value) => setSelectedAgentId(value || null)}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select an agent..." />
            </SelectTrigger>
            <SelectContent>
              {agentsData?.agents?.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedAgentId && (
            <span className="text-sm text-muted-foreground">
              Select an agent to enable quick feedback
            </span>
          )}
        </div>
      </div>

      {/* Results Summary */}
      {!isLoading && !error && data?.traces && (
        <div className="mb-4 text-sm text-muted-foreground" data-testid="traces-count">
          Showing {data.traces.length} of {data.total_count || data.traces.length} traces
          {activeFilterCount > 0 && ' (filtered)'}
        </div>
      )}

      {isLoading ? (
        <TraceListSkeleton count={5} />
      ) : error ? (
        <ErrorState
          title="Failed to load traces"
          message="There was an error loading traces. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      ) : data?.traces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No traces yet</h3>
          <p className="text-muted-foreground text-center mb-6 max-w-sm">
            Import traces from your connected integrations to start reviewing and annotating them.
          </p>
          <Button onClick={() => setImportModalOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import Traces
          </Button>
        </div>
      ) : (
        <div className="space-y-4" data-testid="trace-list">
          {data?.traces.map((trace) => (
            <Card key={trace.id} className="p-4" data-testid="trace-row">
              <Link href={`/traces/${trace.id}`} className="block hover:bg-accent/50 transition-colors -m-4 p-4 mb-0">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">
                        {trace.trace_id.slice(0, 8)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                        {trace.source}
                      </span>
                      {trace.feedback && (
                        <span className="text-lg">
                          {getRatingEmoji(trace.feedback.rating)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatRelativeTime(trace.timestamp)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {trace.step_count} {trace.step_count === 1 ? 'step' : 'steps'}
                    </div>
                    {trace.summary.has_errors && (
                      <span className="text-xs text-red-600">Has errors</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Input</div>
                    <div className="text-sm">
                      {truncate(trace.summary.input_preview, 100)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Output</div>
                    <div className="text-sm">
                      {truncate(trace.summary.output_preview, 100)}
                    </div>
                  </div>
                </div>

                {trace.feedback?.notes && (
                  <div className="mb-4 pb-4 border-b">
                    <div className="text-xs text-muted-foreground mb-1">Notes</div>
                    <div className="text-sm">{truncate(trace.feedback.notes, 100)}</div>
                  </div>
                )}
              </Link>

              <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                {getEffectiveAgentId(trace) ? (
                  <TraceFeedback
                    traceId={trace.id}
                    agentId={getEffectiveAgentId(trace)!}
                    currentRating={trace.feedback?.rating}
                    feedbackId={trace.feedback?.id}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Select an agent above to provide feedback
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

        <ImportTracesModal
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
        />
      </div>
    </TooltipProvider>
  )
}

export default function TracesPage() {
  return (
    <Suspense fallback={<div className="container py-8"><TraceListSkeleton count={5} /></div>}>
      <TracesPageContent />
    </Suspense>
  )
}
