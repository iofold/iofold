'use client'

import * as React from 'react'
import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { KPICard } from '@/components/ui/kpi-card'
import { PassRateTrendChart } from '@/components/charts/pass-rate-trend-chart'
import { ErrorState } from '@/components/ui/error-state'
import { DashboardSkeleton } from '@/components/skeletons/dashboard-skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Calendar,
  Download,
  Circle,
  Users,
  Activity,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  PlayCircle,
  XCircle,
  Bell,
  Filter,
  ChevronRight,
} from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { Job, TraceSummary, Eval } from '@/types/api'
import type { Agent } from '@/types/agent'

// Activity event types for feed
interface ActivityEvent {
  id: string
  type: 'failure' | 'evaluation' | 'alert' | 'success'
  title: string
  description: string
  timestamp: string
  tags?: string[]
  status?: 'failed' | 'passed' | 'warning' | 'running'
}

type ActivityFilter = 'all' | 'failures' | 'evaluations' | 'alerts'

// Map job status to activity type
function jobToActivity(job: Job, mounted: boolean): ActivityEvent | null {
  if (job.status === 'completed') {
    return {
      id: job.id,
      type: job.type === 'execute' ? 'evaluation' : 'success',
      title: getJobTitle(job),
      description: getJobDescription(job),
      timestamp: mounted ? formatRelativeTime(job.completed_at || job.created_at) : '',
      tags: [job.type],
      status: 'passed',
    }
  } else if (job.status === 'failed') {
    return {
      id: job.id,
      type: 'failure',
      title: getJobTitle(job),
      description: job.error || 'Job failed',
      timestamp: mounted ? formatRelativeTime(job.completed_at || job.created_at) : '',
      tags: [job.type],
      status: 'failed',
    }
  } else if (job.status === 'running') {
    return {
      id: job.id,
      type: 'evaluation',
      title: getJobTitle(job),
      description: `Progress: ${job.progress}%`,
      timestamp: mounted ? formatRelativeTime(job.started_at || job.created_at) : '',
      tags: [job.type],
      status: 'running',
    }
  }
  return null
}

function getJobTitle(job: Job): string {
  switch (job.type) {
    case 'import':
      return 'Trace import job'
    case 'generate':
      return 'Eval generation job'
    case 'execute':
      return 'Eval execution job'
    default:
      return 'Job'
  }
}

function getJobDescription(job: Job): string {
  if (job.status === 'completed' && job.result) {
    if (job.type === 'import') {
      return `Imported ${job.result.traces_imported || 0} traces`
    } else if (job.type === 'generate') {
      return `Generated eval with ${job.result.accuracy || 0}% accuracy`
    } else if (job.type === 'execute') {
      return `Executed ${job.result.total_executions || 0} evaluations`
    }
  }
  return 'Completed successfully'
}

export default function DashboardPage() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)
  const [selectedProject, setSelectedProject] = useState('all')
  const [dateRange, setDateRange] = useState('7d')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')

  // Fetch real data from APIs
  const { data: tracesData, isLoading: tracesLoading, error: tracesError } = useQuery({
    queryKey: ['traces', { limit: 100 }],
    queryFn: () => apiClient.listTraces({ limit: 100 }),
  })

  const { data: evalsData, isLoading: evalsLoading, error: evalsError } = useQuery({
    queryKey: ['evals', { limit: 50 }],
    queryFn: () => apiClient.listEvals({ limit: 50 }),
  })

  const { data: agentsData, isLoading: agentsLoading, error: agentsError } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.listAgents(),
  })

  const { data: jobsData, isLoading: jobsLoading, error: jobsError } = useQuery({
    queryKey: ['jobs', { limit: 20 }],
    queryFn: () => apiClient.listJobs({ limit: 20 }),
    refetchInterval: 5000, // Refetch every 5 seconds for live updates
  })

  // Handle client-side mounting for time-dependent content
  useEffect(() => {
    setMounted(true)
  }, [])

  // Update time every second (only on client)
  useEffect(() => {
    setCurrentTime(new Date()) // Set initial time on client
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Extract data arrays safely with memoization to avoid re-renders
  const traces = useMemo(() => tracesData?.traces || [], [tracesData])
  const evals = useMemo(() => evalsData?.evals || [], [evalsData])
  const agents = useMemo(() => agentsData?.agents || [], [agentsData])
  const jobs = useMemo(() => jobsData?.jobs || [], [jobsData])

  // Compute KPI metrics
  const kpiMetrics = useMemo(() => {
    // Total traces count
    const totalTraces = tracesData?.total_count || 0

    // Active evals count (evals with execution_count > 0)
    const activeEvals = evals.filter(e => e.execution_count > 0).length

    // Active agents count (confirmed agents with active version)
    const activeAgents = agents.filter(a => a.status === 'confirmed').length

    // Compute overall pass rate from feedback
    const tracesWithFeedback = traces.filter(t => t.feedback)
    const positiveCount = tracesWithFeedback.filter(t => t.feedback?.rating === 'positive').length
    const totalWithFeedback = tracesWithFeedback.length
    const passRate = totalWithFeedback > 0 ? (positiveCount / totalWithFeedback) * 100 : 0

    return {
      totalTraces,
      activeEvals,
      activeAgents,
      passRate: passRate.toFixed(1),
    }
  }, [traces, evals, agents, tracesData])

  // Generate trend data from traces (group by date)
  const trendData = useMemo(() => {
    if (traces.length === 0) {
      // Return empty placeholder data
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      return days.map((day, index) => ({
        time: day,
        passRate: 0,
        evaluationVolume: 0,
        date: new Date(Date.now() - (6 - index) * 24 * 60 * 60 * 1000).toISOString(),
      }))
    }

    // Group traces by day
    const dayGroups: Record<string, TraceSummary[]> = {}
    const now = new Date()

    // Create buckets for last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dayKey = date.toISOString().split('T')[0]
      dayGroups[dayKey] = []
    }

    // Group traces by day
    traces.forEach(trace => {
      const traceDate = new Date(trace.timestamp)
      const dayKey = traceDate.toISOString().split('T')[0]
      if (dayGroups[dayKey]) {
        dayGroups[dayKey].push(trace)
      }
    })

    // Calculate daily stats
    return Object.entries(dayGroups).map(([dateStr, dayTraces]) => {
      const date = new Date(dateStr)
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })

      // Calculate pass rate for the day
      const withFeedback = dayTraces.filter(t => t.feedback)
      const positive = withFeedback.filter(t => t.feedback?.rating === 'positive').length
      const passRate = withFeedback.length > 0 ? (positive / withFeedback.length) * 100 : 0

      return {
        time: dayName,
        passRate,
        evaluationVolume: dayTraces.length,
        date: dateStr,
      }
    })
  }, [traces])

  // Convert jobs to activity events
  const activities = useMemo(() => {
    return jobs
      .map(job => jobToActivity(job, mounted))
      .filter((activity): activity is ActivityEvent => activity !== null)
  }, [jobs, mounted])

  // Get top performing evals (by accuracy)
  const topPerformingEvals = useMemo(() => {
    return [...evals]
      .filter(e => e.execution_count > 0)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 3)
      .map(e => ({ name: e.name, rate: e.accuracy }))
  }, [evals])

  // Get evals needing attention (low accuracy)
  const needsAttentionEvals = useMemo(() => {
    return [...evals]
      .filter(e => e.execution_count > 0 && e.accuracy < 85)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3)
      .map(e => ({ name: e.name, rate: e.accuracy }))
  }, [evals])

  // Get recent agent deployments
  const recentDeployments = useMemo(() => {
    return [...agents]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3)
      .map(a => ({
        agent: a.name,
        time: mounted ? formatRelativeTime(a.created_at) : '',
        status: a.status === 'confirmed' ? 'live' : a.status === 'discovered' ? 'stable' : 'deprecated',
      }))
  }, [agents, mounted])

  const formatTime = (date: Date | null) => {
    if (!date) return '--:--:--'
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  const formatDate = (date: Date | null) => {
    if (!date) return ''
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getActivityIcon = (type: string, status?: string) => {
    if (status === 'failed') return <XCircle className="w-4 h-4" />
    if (status === 'passed') return <CheckCircle2 className="w-4 h-4" />
    if (status === 'warning') return <AlertTriangle className="w-4 h-4" />
    if (status === 'running') return <PlayCircle className="w-4 h-4" />

    switch (type) {
      case 'failure':
        return <XCircle className="w-4 h-4" />
      case 'evaluation':
        return <Activity className="w-4 h-4" />
      case 'alert':
        return <Bell className="w-4 h-4" />
      default:
        return <CheckCircle2 className="w-4 h-4" />
    }
  }

  const getActivityColor = (status?: string) => {
    switch (status) {
      case 'failed':
        return 'text-error'
      case 'passed':
        return 'text-success'
      case 'warning':
        return 'text-warning'
      case 'running':
        return 'text-info'
      default:
        return 'text-muted-foreground'
    }
  }

  const getActivityBgColor = (status?: string) => {
    switch (status) {
      case 'failed':
        return 'bg-error/10'
      case 'passed':
        return 'bg-success/10'
      case 'warning':
        return 'bg-warning/10'
      case 'running':
        return 'bg-info/10'
      default:
        return 'bg-muted'
    }
  }

  const getStatusBadgeStyles = (status?: string) => {
    switch (status) {
      case 'failed':
        return 'bg-error/10 text-error border-error/20'
      case 'passed':
        return 'bg-success/10 text-success border-success/20'
      case 'warning':
        return 'bg-warning/10 text-warning border-warning/20'
      case 'running':
        return 'bg-info/10 text-info border-info/20'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  const filterActivities = () => {
    if (activityFilter === 'all') return activities
    if (activityFilter === 'failures') {
      return activities.filter(a => a.status === 'failed')
    }
    if (activityFilter === 'evaluations') {
      return activities.filter(a => a.type === 'evaluation')
    }
    if (activityFilter === 'alerts') {
      return activities.filter(a => a.type === 'alert')
    }
    return activities
  }

  const filteredActivities = filterActivities()

  // Check for errors
  const hasError = tracesError || evalsError || agentsError || jobsError
  const isLoading = tracesLoading || evalsLoading || agentsLoading || jobsLoading

  // Show error state if any API fails
  if (hasError) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-6 py-8">
          <ErrorState
            title="Failed to load dashboard data"
            message="There was an error loading dashboard data. Please try again."
            error={(tracesError || evalsError || agentsError || jobsError) as Error}
            onRetry={() => window.location.reload()}
          />
        </div>
      </div>
    )
  }

  // Show loading skeleton
  if (isLoading) {
    return (
      <div className="min-h-screen">
        {/* Page Header */}
        <div className="border-b border-border bg-card">
          <div className="container mx-auto px-6 py-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-1">Dashboard</h1>
                <p className="text-muted-foreground">Project overview and analytics</p>
              </div>
              <div className="flex items-center gap-3">
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="w-[180px]" aria-label="Select project filter">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    <SelectItem value="prod">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="dev">Development</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="w-[160px]" aria-label="Select date range">
                    <Calendar className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Last 24 hours</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-success/10 border border-success/20" aria-label="Live data indicator">
                  <div className="w-2 h-2 bg-success rounded-full animate-pulse-subtle" />
                  <span className="text-sm font-medium text-success">Live</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted border border-border">
                  <Circle className="w-3 h-3 fill-success text-success" />
                  <span className="text-sm font-medium text-foreground">Connected</span>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between py-3 px-4 bg-muted rounded-lg">
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Last updated:</span>
                  <span className="font-medium text-foreground" suppressHydrationWarning>
                    {mounted ? formatTime(currentTime) : '--:--:--'}
                  </span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Active evaluations:</span>
                  <span className="font-medium text-foreground"><span className="text-muted-foreground">Loading...</span></span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Online users:</span>
                  <span className="font-medium text-foreground">3</span>
                </div>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground" suppressHydrationWarning>
                  {mounted ? formatDate(currentTime) : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content with Skeleton */}
        <div className="container mx-auto px-6 py-8">
          <DashboardSkeleton />
        </div>
      </div>
    )
  }

  return (
      <div className="min-h-screen">
        {/* Page Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-1">Dashboard</h1>
              <p className="text-muted-foreground">Project overview and analytics</p>
            </div>

            <div className="flex items-center gap-3">
              {/* Project Selector */}
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="w-[180px]" aria-label="Select project filter">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  <SelectItem value="prod">Production</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="dev">Development</SelectItem>
                </SelectContent>
              </Select>

              {/* Date Range Selector */}
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[160px]" aria-label="Select date range">
                  <Calendar className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>

              {/* Live Indicator */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-success/10 border border-success/20" aria-label="Live data indicator">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse-subtle" />
                <span className="text-sm font-medium text-success">Live</span>
              </div>

              {/* Connected Status */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted border border-border">
                <Circle className="w-3 h-3 fill-success text-success" />
                <span className="text-sm font-medium text-foreground">Connected</span>
              </div>

              {/* Export Button */}
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          {/* Status Bar */}
          <div className="flex items-center justify-between py-3 px-4 bg-muted rounded-lg">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Last updated:</span>
                <span className="font-medium text-foreground" suppressHydrationWarning>
                  {mounted ? formatTime(currentTime) : '--:--:--'}
                </span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Active evaluations:</span>
                <span className="font-medium text-foreground">{kpiMetrics.activeEvals}</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Online users:</span>
                <span className="font-medium text-foreground">3</span>
              </div>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground" suppressHydrationWarning>
                {mounted ? formatDate(currentTime) : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div>
            <KPICard
            title="Total Traces"
            value={kpiMetrics.totalTraces}
            change={traces.length > 0 ? `${traces.length} recent` : '0'}
            changeType="neutral"
            icon={<Activity className="w-5 h-5" />}
            status="success"
            sparklineData={trendData.map(d => d.evaluationVolume)}
          />
          </div>
          <div>
            <KPICard
            title="Overall Pass Rate"
            value={`${kpiMetrics.passRate}%`}
            change={parseFloat(kpiMetrics.passRate) >= 80 ? '+Good' : 'Low'}
            changeType={parseFloat(kpiMetrics.passRate) >= 80 ? 'positive' : 'negative'}
            icon={<CheckCircle2 className="w-5 h-5" />}
            status={parseFloat(kpiMetrics.passRate) >= 80 ? 'success' : 'warning'}
            sparklineData={trendData.map(d => d.passRate)}
          />
          </div>
          <div>
            <KPICard
            title="Active Evals"
            value={kpiMetrics.activeEvals}
            change={`${evals.length} total`}
            changeType="neutral"
            icon={<Activity className="w-5 h-5" />}
            status="success"
          />
          </div>
          <div>
            <KPICard
            title="Active Agents"
            value={kpiMetrics.activeAgents}
            change={`${agents.length} total`}
            changeType="neutral"
            icon={<Users className="w-5 h-5" />}
            status="success"
          />
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pass Rate Trends Chart - Takes 2 columns */}
          <div className="lg:col-span-2">
            <PassRateTrendChart
              data={trendData}
              title="Pass Rate Trends"
              subtitle="Evaluation performance over time"
              onDrillDown={(data) => {
                console.log('Drill down:', data)
              }}
            />
          </div>

          {/* Recent Activity Sidebar */}
          <div className="lg:col-span-1">
            <Card className="p-6 h-full">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
                  <p className="text-sm text-muted-foreground">Real-time event feed</p>
                </div>
                <Button variant="ghost" size="sm" aria-label="Filter activity">
                  <Filter className="w-4 h-4" />
                </Button>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
                {(['all', 'failures', 'evaluations', 'alerts'] as ActivityFilter[]).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActivityFilter(filter)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm font-medium transition-smooth capitalize',
                      activityFilter === filter
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Activity Feed */}
              <div className="space-y-3 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {filteredActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="group p-3 rounded-lg border border-border bg-card hover:shadow-elevation-1 hover:border-primary/20 transition-smooth cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                          getActivityBgColor(activity.status),
                          getActivityColor(activity.status)
                        )}
                      >
                        {getActivityIcon(activity.type, activity.status)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-sm font-medium text-foreground leading-tight">
                            {activity.title}
                          </h4>
                          {activity.status && (
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded text-xs font-medium border flex-shrink-0 capitalize',
                                getStatusBadgeStyles(activity.status)
                              )}
                            >
                              {activity.status}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground mb-2">
                          {activity.description}
                        </p>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {activity.tags?.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground font-medium"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0" suppressHydrationWarning>
                            <Clock className="w-3 h-3" />
                            {activity.timestamp}
                          </div>
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>

              {/* View All Link */}
              <div className="mt-4 pt-4 border-t border-border">
                <Button variant="ghost" className="w-full justify-center text-sm">
                  View all activity
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </Card>
          </div>
        </div>

        {/* Additional Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Top Performing Evals</h3>
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
            <div className="space-y-3">
              {topPerformingEvals.length > 0 ? (
                topPerformingEvals.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{item.name}</span>
                    <span className="text-sm font-semibold text-success">{item.rate.toFixed(1)}%</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No evals have been executed yet. Import traces and generate evals to see performance data.</p>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Needs Attention</h3>
              <TrendingDown className="w-4 h-4 text-error" />
            </div>
            <div className="space-y-3">
              {needsAttentionEvals.length > 0 ? (
                needsAttentionEvals.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{item.name}</span>
                    <span className="text-sm font-semibold text-error">{item.rate.toFixed(1)}%</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{evals.length > 0 && evals.some(e => e.execution_count > 0) ? 'All evals performing well! No evaluations below 85% accuracy.' : 'No eval performance data yet. Execute evals to monitor accuracy.'}</p>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Recent Agent Deployments</h3>
              <PlayCircle className="w-4 h-4 text-info" />
            </div>
            <div className="space-y-3">
              {recentDeployments.length > 0 ? (
                recentDeployments.map((deploy) => (
                  <div key={deploy.agent} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Circle
                        className={cn(
                          'w-2 h-2 fill-current',
                          deploy.status === 'live' && 'text-success',
                          deploy.status === 'stable' && 'text-info',
                          deploy.status === 'deprecated' && 'text-muted-foreground'
                        )}
                      />
                      <span className="text-sm font-medium text-foreground">{deploy.agent}</span>
                    </div>
                    <span className="text-xs text-muted-foreground" suppressHydrationWarning>{deploy.time}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No agents discovered yet. Connect your observability platform to start tracking agents.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
      </div>
  )
}
