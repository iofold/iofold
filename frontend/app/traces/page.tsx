'use client'

import { Suspense, useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import {
  Upload,
  Filter,
  X,
  ChevronDown,
  Copy,
  Eye,
  Settings2,
  Download,
  RefreshCw,
  Clock,
  DollarSign,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ChevronUp,
  Save,
  CheckCircle2,
  XCircle,
  Clock3,
  MoreHorizontal
} from 'lucide-react'
import { formatRelativeTime, truncate } from '@/lib/utils'
import { ImportTracesModal } from '@/components/import-traces-modal'
import { TracesTableSkeleton } from '@/components/skeletons/traces-skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'

// Trace interface matching API response (TraceSummary)
interface Trace {
  id: string
  trace_id: string
  source: string
  timestamp: string
  imported_at?: string
  step_count: number
  summary: {
    input_preview: string
    output_preview: string
    has_errors: boolean
  }
  feedback?: {
    rating: string
    notes?: string | null
    agent_id?: string | null
  }
}

// KPI Card Component
function KPICard({
  title,
  value,
  trend,
  trendValue,
  icon: Icon,
  isLoading = false
}: {
  title: string
  value: string | number
  trend: 'up' | 'down' | 'neutral'
  trendValue: string
  icon: any
  isLoading?: boolean
}) {
  const trendColor = trend === 'up' ? 'text-success' : trend === 'down' ? 'text-error' : 'text-muted-foreground'
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : null

  return (
    <Card className="p-6 hover:shadow-elevation-2 transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-bold mb-2">{isLoading ? '...' : value}</p>
          <div className="flex items-center gap-1">
            {TrendIcon && <TrendIcon className={`h-3 w-3 ${trendColor}`} />}
            <span className={`text-xs font-medium ${trendColor}`}>
              {trendValue}
            </span>
            <span className="text-xs text-muted-foreground">vs last week</span>
          </div>
        </div>
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </Card>
  )
}

// Status Badge Component
function StatusBadge({ hasError, feedback }: { hasError: boolean; feedback?: { rating: string } }) {
  // Determine status based on error and feedback
  let status: 'success' | 'error' | 'neutral'
  if (hasError) {
    status = 'error'
  } else if (feedback?.rating === 'positive') {
    status = 'success'
  } else if (feedback?.rating === 'negative') {
    status = 'error'
  } else {
    status = 'neutral'
  }

  const variants = {
    success: 'bg-success/10 text-success border-success/20',
    error: 'bg-error/10 text-error border-error/20',
    neutral: 'bg-muted text-muted-foreground border-border',
  }

  const icons = {
    success: CheckCircle2,
    error: XCircle,
    neutral: Clock3,
  }

  const labels = {
    success: hasError ? 'Has Error' : 'Positive',
    error: hasError ? 'Error' : 'Negative',
    neutral: 'Pending Review',
  }

  const Icon = icons[status]

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${variants[status]}`}>
      <Icon className="h-3 w-3" />
      {labels[status]}
    </span>
  )
}

function TracesPageContent() {
  const searchParams = useSearchParams()
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null)
  const [sortColumn, setSortColumn] = useState<string>('timestamp')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [modelFilter, setModelFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle if not typing in input
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      if (e.key === 'f') {
        e.preventDefault()
        setShowFilters(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  // Build query params based on filters
  const queryParams = useMemo(() => {
    const params: any = { limit: 50 }
    if (sourceFilter) params.source = sourceFilter
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    return params
  }, [sourceFilter, dateFrom, dateTo])

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (searchQuery) count++
    if (statusFilter) count++
    if (sourceFilter) count++
    if (modelFilter) count++
    if (dateFrom) count++
    if (dateTo) count++
    return count
  }, [searchQuery, statusFilter, sourceFilter, modelFilter, dateFrom, dateTo])

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('')
    setSourceFilter('')
    setModelFilter('')
    setDateFrom('')
    setDateTo('')
  }

  // Real data query using API
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['traces', queryParams],
    queryFn: () => apiClient.listTraces(queryParams),
  })

  // Get traces from API response
  const traces: Trace[] = data?.traces || []

  // Apply client-side filtering
  const filteredTraces = useMemo(() => {
    let filtered = [...traces]

    if (searchQuery) {
      filtered = filtered.filter(t =>
        t.summary.input_preview.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.trace_id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    if (statusFilter) {
      if (statusFilter === 'error') {
        filtered = filtered.filter(t => t.summary.has_errors || t.feedback?.rating === 'negative')
      } else if (statusFilter === 'success') {
        filtered = filtered.filter(t => !t.summary.has_errors && t.feedback?.rating === 'positive')
      } else if (statusFilter === 'pending') {
        filtered = filtered.filter(t => !t.summary.has_errors && !t.feedback)
      }
    }
    if (sourceFilter) {
      filtered = filtered.filter(t => t.source === sourceFilter)
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: any
      let bVal: any

      if (sortColumn === 'timestamp') {
        aVal = new Date(a.timestamp || a.imported_at || 0).getTime()
        bVal = new Date(b.timestamp || b.imported_at || 0).getTime()
      } else if (sortColumn === 'step_count') {
        aVal = a.step_count
        bVal = b.step_count
      } else {
        aVal = (a as any)[sortColumn]
        bVal = (b as any)[sortColumn]
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })

    return filtered
  }, [traces, searchQuery, statusFilter, sourceFilter, sortColumn, sortDirection])

  // KPI data computed from real traces
  const kpiData = useMemo(() => {
    const errorCount = traces.filter(t => t.summary.has_errors).length
    const errorRate = traces.length > 0 ? (errorCount / traces.length) * 100 : 0
    return {
      totalTraces: data?.total_count || 0,
      avgLatency: '-', // Latency not tracked in current schema
      errorRate: errorRate.toFixed(1),
      feedbackCount: traces.filter(t => t.feedback).length,
    }
  }, [data, traces])

  // Toggle row selection
  const toggleRowSelection = (id: string) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedRows(newSelected)
  }

  // Toggle all rows
  const toggleAllRows = () => {
    if (selectedRows.size === filteredTraces.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(filteredTraces.map(t => t.id)))
    }
  }

  // Handle column sort
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
      <TooltipProvider>
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
        {/* Header Section */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Traces Explorer</h1>
            <p className="text-muted-foreground">
              Browse, filter, and analyze your AI agent traces
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Select defaultValue="">
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Load saved view..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recent Traces</SelectItem>
                <SelectItem value="errors">Error Traces Only</SelectItem>
                <SelectItem value="expensive">High Cost Traces</SelectItem>
                <SelectItem value="slow">Slow Responses</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Save className="w-4 h-4 mr-2" />
              Save View
            </Button>
            <Button onClick={() => setImportModalOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Import Traces
            </Button>
          </div>
        </div>

        {/* KPI Summary Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <KPICard
            title="Total Traces"
            value={kpiData.totalTraces.toLocaleString()}
            trend="neutral"
            trendValue="all time"
            icon={Activity}
            isLoading={isLoading}
          />
          <KPICard
            title="Reviewed"
            value={kpiData.feedbackCount}
            trend="neutral"
            trendValue="with feedback"
            icon={CheckCircle2}
            isLoading={isLoading}
          />
          <KPICard
            title="Error Rate"
            value={`${kpiData.errorRate}%`}
            trend={parseFloat(kpiData.errorRate) > 5 ? 'down' : 'up'}
            trendValue={parseFloat(kpiData.errorRate) > 5 ? 'high' : 'good'}
            icon={XCircle}
            isLoading={isLoading}
          />
          <KPICard
            title="Step Count"
            value={traces.length > 0 ? Math.round(traces.reduce((sum, t) => sum + t.step_count, 0) / traces.length) : 0}
            trend="neutral"
            trendValue="avg per trace"
            icon={Activity}
            isLoading={isLoading}
          />
        </div>

        {/* Live Data Indicator */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="text-sm text-muted-foreground">
              Live data - Last updated just now
            </span>
            <button className="text-sm text-primary hover:underline">
              Change range
            </button>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filteredTraces.length} of {data?.total_count || 0} traces
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <Card className="mb-6 p-6 animate-slide-in-from-top">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Advanced Filters</h3>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="search-query">Search</Label>
                <Input
                  id="search-query"
                  placeholder="Search by name or trace ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status-filter">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All statuses</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="source-filter">Source</Label>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger id="source-filter">
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
                <Label htmlFor="model-filter">Model</Label>
                <Select value={modelFilter} onValueChange={setModelFilter}>
                  <SelectTrigger id="model-filter">
                    <SelectValue placeholder="All models" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All models</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="claude-4.5-sonnet">Claude 4.5 Sonnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-from">Date Range</Label>
                <div className="flex gap-2">
                  <Input
                    id="date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {selectedRows.size > 0 && (
              <span className="text-sm text-muted-foreground">
                {selectedRows.size} row{selectedRows.size > 1 ? 's' : ''} selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="w-4 h-4 mr-2" />
                  Columns
                </Button>
              </TooltipTrigger>
              <TooltipContent>Configure visible columns</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export traces to CSV</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh data</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Advanced Data Table */}
        {isLoading ? (
          <TracesTableSkeleton count={10} />
        ) : error ? (
          <ErrorState
            title="Failed to load traces"
            message="There was an error loading traces. Please try again."
            error={error as Error}
            onRetry={() => window.location.reload()}
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="w-10 px-4 py-3 text-left">
                      <Checkbox
                        checked={selectedRows.size === filteredTraces.length && filteredTraces.length > 0}
                        onCheckedChange={toggleAllRows}
                      />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => handleSort('timestamp')}
                    >
                      <div className="flex items-center gap-1">
                        Timestamp
                        {sortColumn === 'timestamp' && (
                          sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Trace ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[200px]">
                      Input Preview
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => handleSort('step_count')}
                    >
                      <div className="flex items-center gap-1">
                        Steps
                        {sortColumn === 'step_count' && (
                          sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Feedback
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTraces.map((trace) => (
                      <tr
                        key={trace.id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setSelectedTrace(trace)}
                      >
                        <td className="px-4 py-4">
                          <Checkbox
                            checked={selectedRows.has(trace.id)}
                            onCheckedChange={() => toggleRowSelection(trace.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="px-4 py-4 text-sm text-muted-foreground whitespace-nowrap">
                          {formatRelativeTime(trace.imported_at || trace.timestamp)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <code className="text-xs bg-muted px-2 py-1 rounded font-mono cursor-help">
                                  {trace.id.slice(0, 16)}...
                                </code>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-mono text-xs">{trace.id}</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyToClipboard(trace.id)
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Copy trace ID</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm max-w-[300px]">
                          <span className="line-clamp-2" title={trace.summary.input_preview}>
                            {trace.summary.input_preview || 'No input'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge hasError={trace.summary.has_errors} feedback={trace.feedback} />
                        </td>
                        <td className="px-4 py-4 text-sm text-center">
                          {trace.step_count}
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs bg-secondary/50 px-2 py-1 rounded capitalize">
                            {trace.source}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {trace.feedback ? (
                            <span className={`text-xs px-2 py-1 rounded capitalize ${
                              trace.feedback.rating === 'positive' ? 'bg-success/10 text-success' :
                              trace.feedback.rating === 'negative' ? 'bg-error/10 text-error' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {trace.feedback.rating}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                  }}
                                  asChild
                                >
                                  <Link href={`/traces/${trace.id}`}>
                                    <Eye className="h-3 w-3" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View details</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyToClipboard(trace.id)
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy trace ID</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                      {expandedRows.has(trace.id) && (
                        <tr className="bg-muted/20">
                          <td colSpan={10} className="px-4 py-4">
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground mb-1">Source Platform</p>
                                <p className="font-medium capitalize">{trace.source}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Full Trace ID</p>
                                <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all">
                                  {trace.id}
                                </code>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Imported At</p>
                                <p className="font-medium">{trace.imported_at ? new Date(trace.imported_at).toLocaleString() : 'N/A'}</p>
                              </div>
                              <div className="col-span-3">
                                <p className="text-muted-foreground mb-1">Output Preview</p>
                                <p className="font-medium text-foreground/80 line-clamp-3">
                                  {trace.summary.output_preview || 'No output recorded'}
                                </p>
                              </div>
                              {trace.feedback && (
                                <div className="col-span-3">
                                  <p className="text-muted-foreground mb-1">Feedback Notes</p>
                                  <p className="font-medium text-foreground/80">
                                    {trace.feedback.notes || 'No notes provided'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Keyboard Shortcuts Footer */}
        <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background rounded border border-border font-mono">f</kbd>
                <span>Toggle filters</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background rounded border border-border font-mono">j</kbd>
                <kbd className="px-2 py-1 bg-background rounded border border-border font-mono">k</kbd>
                <span>Navigate rows</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background rounded border border-border font-mono">Enter</kbd>
                <span>Open trace</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background rounded border border-border font-mono">Space</kbd>
                <span>Select row</span>
              </div>
            </div>
            <span className="text-muted-foreground">Press ? to see all shortcuts</span>
          </div>
        </div>

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
    <Suspense fallback={<div className="container py-8"><TracesTableSkeleton count={10} /></div>}>
      <TracesPageContent />
    </Suspense>
  )
}
