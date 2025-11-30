'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertCircle, X, RefreshCw, ChevronDown, CheckCircle, Clock } from 'lucide-react'

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
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [responseTimeData] = useState(generateResponseTimeData())
  const [memoryData] = useState(generateMemoryData())
  const [services] = useState(mockServices)
  const [alerts] = useState(mockAlerts)
  const [mounted, setMounted] = useState(false)

  // Delay rendering charts until after hydration to prevent SSR dimension issues
  useEffect(() => {
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
        return 'bg-emerald-500'
      case 'warning':
        return 'bg-amber-500'
      case 'critical':
        return 'bg-rose-500'
      default:
        return 'bg-slate-500'
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-l-rose-500 bg-rose-50 dark:bg-rose-950/20'
      case 'warning':
        return 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20'
      case 'info':
        return 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20'
      default:
        return 'border-l-slate-500 bg-slate-50 dark:bg-slate-950/20'
    }
  }

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-rose-500 text-white'
      case 'warning':
        return 'bg-amber-500 text-white'
      case 'info':
        return 'bg-blue-500 text-white'
      default:
        return 'bg-slate-500 text-white'
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-[1600px] p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                System Monitoring
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Real-time infrastructure health and performance analytics
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* Connection Status */}
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Connected
                </span>
              </div>

              {/* Time Range Selector */}
              <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                Last 24 Hours
                <ChevronDown className="h-4 w-4" />
              </button>

              {/* Auto Refresh Toggle */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  autoRefresh
                    ? 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950/20 dark:text-purple-400'
                    : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                Auto-refresh {autoRefresh && `(${nextRefresh}s)`}
              </button>
            </div>
          </div>

          {/* Last Updated */}
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Clock className="h-4 w-4" />
            <span suppressHydrationWarning>
              Last updated: {mounted ? lastUpdated.toLocaleTimeString() : '--:--:--'}
            </span>
            {autoRefresh && <span suppressHydrationWarning>• Next refresh in {nextRefresh}s</span>}
          </div>
        </div>

        {/* Alert Banner */}
        {showBanner && (
          <div className="mb-6 flex items-start gap-4 rounded-lg border-l-4 border-l-amber-500 bg-amber-50 p-4 dark:bg-amber-950/20">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 dark:text-amber-200">
                High Memory Usage Detected
              </h3>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                Memory usage has exceeded 85% threshold. Consider scaling resources or investigating memory leaks.
              </p>
              <button className="mt-2 text-sm font-medium text-amber-700 underline hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200">
                View Details
              </button>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="flex-shrink-0 text-amber-600 transition-colors hover:text-amber-900 dark:text-amber-500 dark:hover:text-amber-200"
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
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-50">
                Connector Health
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    {/* Status Bar */}
                    <div className={`mb-4 h-1 w-full rounded-full ${getStatusColor(service.status)}`} />

                    {/* Service Info */}
                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                        {service.name}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{service.type}</p>
                    </div>

                    {/* Health Progress */}
                    <div className="mb-4">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-300">Health</span>
                        <span className="font-medium text-slate-900 dark:text-slate-50">
                          {service.health}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full transition-all ${getStatusColor(service.status)}`}
                          style={{ width: `${service.health}%` }}
                        />
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-slate-600 dark:text-slate-300">Uptime</p>
                        <p className="font-semibold text-slate-900 dark:text-slate-50">
                          {service.uptime}%
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-600 dark:text-slate-300">Throughput</p>
                        <p className="font-semibold text-slate-900 dark:text-slate-50">
                          {service.throughput} req/min
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-600 dark:text-slate-300">Last Sync</p>
                        <p className="font-semibold text-slate-900 dark:text-slate-50">
                          {service.lastSync}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-600 dark:text-slate-300">Error Rate</p>
                        <p className="font-semibold text-slate-900 dark:text-slate-50">
                          {service.errorRate}%
                        </p>
                      </div>
                    </div>

                    {/* Version */}
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {service.version}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Performance Metrics */}
            <section>
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-50">
                Performance Metrics
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* API Response Time */}
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-50">
                    API Response Time
                  </h3>
                  <div className="min-h-[200px]">
                    {!mounted ? (
                      <div className="w-full h-[200px] flex items-center justify-center bg-slate-100/20 dark:bg-slate-800/20 rounded-lg">
                        <div className="animate-pulse text-slate-500 dark:text-slate-300">Loading chart...</div>
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
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Memory Usage
                  </h3>
                  <div className="min-h-[200px]">
                    {!mounted ? (
                      <div className="w-full h-[200px] flex items-center justify-center bg-slate-100/20 dark:bg-slate-800/20 rounded-lg">
                        <div className="animate-pulse text-slate-500 dark:text-slate-300">Loading chart...</div>
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
          </div>

          {/* System Alerts Sidebar */}
          <div className="lg:col-span-1">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                  System Alerts
                </h2>
                <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/20 dark:text-rose-400">
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
                        <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {alert.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {alert.message}
                        </p>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
                          {alert.timestamp}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* View All Link */}
              <button className="mt-4 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                View All Alerts
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
