'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertCircle, X, RefreshCw, ChevronDown, CheckCircle, Clock } from 'lucide-react'
import { JobQueueDashboard } from '@/components/jobs'
import { toast } from 'sonner'

// Mock data for performance charts
const generateResponseTimeData = () => {
  return Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    responseTime: Math.floor(Math.random() * 150) + 50
  }))
}

const generateMemoryData = () => {
  return Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    usage: Math.floor(Math.random() * 30) + 60
  }))
}

interface ServiceStatus {
  id: string
  name: string
  type: string
  status: 'healthy' | 'warning' | 'critical'
  uptime: number
  throughput: number
  lastSync: string
  errorRate: number
  version: string
  health: number
}

interface Alert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  timestamp: string
}

const mockServices: ServiceStatus[] = [
  {
    id: '1',
    name: 'Langfuse Production',
    type: 'Observability Platform',
    status: 'healthy',
    uptime: 99.98,
    throughput: 1247,
    lastSync: '2 min ago',
    errorRate: 0.02,
    version: 'v2.4.1',
    health: 98
  },
  {
    id: '2',
    name: 'Webhook Service',
    type: 'Event Delivery',
    status: 'healthy',
    uptime: 99.95,
    throughput: 856,
    lastSync: '1 min ago',
    errorRate: 0.05,
    version: 'v1.8.3',
    health: 96
  },
  {
    id: '3',
    name: 'Evaluation Engine',
    type: 'Processing Service',
    status: 'warning',
    uptime: 99.23,
    throughput: 423,
    lastSync: '5 min ago',
    errorRate: 0.77,
    version: 'v3.1.0',
    health: 87
  },
  {
    id: '4',
    name: 'Data Storage',
    type: 'Database Service',
    status: 'healthy',
    uptime: 99.99,
    throughput: 2134,
    lastSync: '30 sec ago',
    errorRate: 0.01,
    version: 'v5.2.8',
    health: 99
  }
]

const mockAlerts: Alert[] = [
  {
    id: '1',
    severity: 'critical',
    title: 'High Memory Usage',
    message: 'Memory usage exceeded 85% threshold',
    timestamp: '5 minutes ago'
  },
  {
    id: '2',
    severity: 'warning',
    title: 'Elevated Error Rate',
    message: 'Evaluation Engine error rate increased to 0.77%',
    timestamp: '12 minutes ago'
  },
  {
    id: '3',
    severity: 'info',
    title: 'Scheduled Maintenance',
    message: 'Database backup completed successfully',
    timestamp: '1 hour ago'
  }
]

export default function SystemMonitoringPage() {
  const [showBanner, setShowBanner] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [nextRefresh, setNextRefresh] = useState(30)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [responseTimeData] = useState(generateResponseTimeData())
  const [memoryData] = useState(generateMemoryData())
  const [services] = useState(mockServices)
  const [alerts] = useState(mockAlerts)
  const [mounted, setMounted] = useState(false)

  // Initialize lastUpdated and mounted state on client only
  useEffect(() => {
    setLastUpdated(new Date())
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      setNextRefresh((prev) => {
        if (prev <= 1) {
          setLastUpdated(new Date())
          return 30
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [autoRefresh])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-success'
      case 'warning':
        return 'bg-warning'
      case 'critical':
        return 'bg-destructive'
      default:
        return 'bg-muted'
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-l-destructive bg-destructive/10'
      case 'warning':
        return 'border-l-warning bg-warning/10'
      case 'info':
        return 'border-l-info bg-info/10'
      default:
        return 'border-l-border bg-muted'
    }
  }

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-destructive text-white'
      case 'warning':
        return 'bg-warning text-white'
      case 'info':
        return 'bg-info text-white'
      default:
        return 'bg-muted text-foreground'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                System Monitoring
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Real-time infrastructure health and performance analytics
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* Connection Status */}
              <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <span className="text-sm font-medium text-success">
                  Connected
                </span>
              </div>

              {/* Time Range Selector */}
              <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                Last 24 Hours
                <ChevronDown className="h-4 w-4" />
              </button>

              {/* Auto Refresh Toggle */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  autoRefresh
                    ? 'border-primary/20 bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground'
                }`}
              >
                <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                Auto-refresh {autoRefresh && `(${nextRefresh}s)`}
              </button>
            </div>
          </div>

          {/* Last Updated */}
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span suppressHydrationWarning>
              Last updated: {mounted && lastUpdated ? lastUpdated.toLocaleTimeString() : '--:--:--'}
            </span>
            {autoRefresh && <span suppressHydrationWarning>• Next refresh in {nextRefresh}s</span>}
          </div>
        </div>

        {/* Alert Banner */}
        {showBanner && (
          <div className="mb-6 flex items-start gap-4 rounded-lg border-l-4 border-l-warning bg-warning/10 p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-warning" />
            <div className="flex-1">
              <h3 className="font-semibold text-warning">
                High Memory Usage Detected
              </h3>
              <p className="mt-1 text-sm text-warning">
                Memory usage has exceeded 85% threshold. Consider scaling resources or investigating memory leaks.
              </p>
              <button className="mt-2 text-sm font-medium text-warning underline hover:text-warning/80" onClick={() => toast.info('Not implemented: View Details')}>
                View Details
              </button>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="flex-shrink-0 text-warning transition-colors hover:text-warning/80"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Connector Health */}
            <section>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Connector Health
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-lg border border-border bg-card p-5 shadow-sm"
                  >
                    {/* Status Bar */}
                    <div className={`mb-4 h-1 w-full rounded-full ${getStatusColor(service.status)}`} />

                    {/* Service Info */}
                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-foreground">
                        {service.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{service.type}</p>
                    </div>

                    {/* Health Progress */}
                    <div className="mb-4">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Health</span>
                        <span className="font-medium text-foreground">
                          {service.health}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${getStatusColor(service.status)}`}
                          style={{ width: `${service.health}%` }}
                        />
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Uptime</p>
                        <p className="font-semibold text-foreground">
                          {service.uptime}%
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Throughput</p>
                        <p className="font-semibold text-foreground">
                          {service.throughput} req/min
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Last Sync</p>
                        <p className="font-semibold text-foreground">
                          {service.lastSync}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Error Rate</p>
                        <p className="font-semibold text-foreground">
                          {service.errorRate}%
                        </p>
                      </div>
                    </div>

                    {/* Version */}
                    <div className="mt-4 pt-4 border-t border-border">
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {service.version}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Performance Metrics */}
            <section>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Performance Metrics
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* API Response Time */}
                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-foreground">
                    API Response Time
                  </h3>
                  <div className="min-h-[200px]">
                    {!mounted ? (
                      <div className="w-full h-[200px] flex items-center justify-center bg-muted/20 rounded-lg">
                        <div className="animate-pulse text-muted-foreground">Loading chart...</div>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={responseTimeData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="time"
                            stroke="#64748b"
                            fontSize={12}
                            tickLine={false}
                          />
                          <YAxis
                            stroke="#64748b"
                            fontSize={12}
                            tickLine={false}
                            tickFormatter={(value) => `${value}ms`}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#1e293b',
                              border: '1px solid #334155',
                              borderRadius: '8px',
                              color: '#f1f5f9'
                            }}
                            formatter={(value: any) => [`${value}ms`, 'Response Time']}
                          />
                          <Line
                            type="monotone"
                            dataKey="responseTime"
                            stroke="#8b5cf6"
                            strokeWidth={2.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Memory Usage */}
                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-foreground">
                    Memory Usage
                  </h3>
                  <div className="min-h-[200px]">
                    {!mounted ? (
                      <div className="w-full h-[200px] flex items-center justify-center bg-muted/20 rounded-lg">
                        <div className="animate-pulse text-muted-foreground">Loading chart...</div>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={memoryData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="time"
                            stroke="#64748b"
                            fontSize={12}
                            tickLine={false}
                          />
                          <YAxis
                            stroke="#64748b"
                            fontSize={12}
                            tickLine={false}
                            tickFormatter={(value) => `${value}%`}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#1e293b',
                              border: '1px solid #334155',
                              borderRadius: '8px',
                              color: '#f1f5f9'
                            }}
                            formatter={(value: any) => [`${value}%`, 'Memory']}
                          />
                          <Area
                            type="monotone"
                            dataKey="usage"
                            stroke="#f59e0b"
                            fill="#f59e0b"
                            fillOpacity={0.2}
                            strokeWidth={2.5}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Job Queue Dashboard */}
            <section>
              <JobQueueDashboard workspaceId="default" refreshInterval={5000} />
            </section>
          </div>

          {/* System Alerts Sidebar */}
          <div className="lg:col-span-1">
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  System Alerts
                </h2>
                <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                  {alerts.length} Active
                </span>
              </div>

              {/* Alerts List */}
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`rounded-lg border-l-4 p-4 ${getSeverityColor(alert.severity)}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getSeverityBadgeColor(
                              alert.severity
                            )}`}
                          >
                            {alert.severity.toUpperCase()}
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-foreground">
                          {alert.title}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {alert.message}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {alert.timestamp}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* View All Link */}
              <button className="mt-4 w-full rounded-lg border border-border bg-muted py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80" onClick={() => toast.info('Not implemented: View All Alerts')}>
                View All Alerts
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
