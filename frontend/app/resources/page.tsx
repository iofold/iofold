'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  DollarSign,
  ChevronDown,
  Download,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  Info,
  ArrowUpDown,
  BarChart3,
} from 'lucide-react'

// Mock data types
interface BudgetAlert {
  id: string
  severity: 'warning' | 'error' | 'info'
  title: string
  message: string
  timestamp: string
}

interface KPICard {
  id: string
  title: string
  value: string
  badge?: {
    text: string
    variant: 'success' | 'error' | 'warning'
  }
  budget?: string
  trend: {
    value: number
    isPositive: boolean
  }
}

interface CostDriver {
  rank: number
  service: string
  cost: number
  percentage: number
  trend: number
}

interface Recommendation {
  id: string
  title: string
  description: string
  potentialSavings: number
}

// Mock data
const budgetAlerts: BudgetAlert[] = [
  {
    id: '1',
    severity: 'warning',
    title: 'API costs approaching budget threshold',
    message: 'Current spend is at 87% of monthly budget ($3,200 of $3,680)',
    timestamp: '2 hours ago',
  },
  {
    id: '2',
    severity: 'error',
    title: 'Compute costs exceeded budget',
    message: 'Exceeded budget by 12% this month ($4,480 vs $4,000 budget)',
    timestamp: '5 hours ago',
  },
  {
    id: '3',
    severity: 'info',
    title: 'Storage optimization opportunity',
    message: 'Identified 340GB of unused data that can be archived to reduce costs',
    timestamp: '1 day ago',
  },
]

const kpiCards: KPICard[] = [
  {
    id: '1',
    title: 'Total Monthly Spend',
    value: '$3,647',
    badge: {
      text: 'Within Budget',
      variant: 'success',
    },
    budget: '$4,000',
    trend: {
      value: 8.7,
      isPositive: false,
    },
  },
  {
    id: '2',
    title: 'Budget Variance',
    value: '$353',
    trend: {
      value: 12.3,
      isPositive: true,
    },
  },
  {
    id: '3',
    title: 'Cost per Evaluation',
    value: '$2.47',
    trend: {
      value: 5.2,
      isPositive: true,
    },
  },
  {
    id: '4',
    title: 'Projected Monthly Burn',
    value: '$4,234',
    badge: {
      text: 'Over Budget',
      variant: 'error',
    },
    budget: '$4,000',
    trend: {
      value: 15.8,
      isPositive: false,
    },
  },
]

const costDrivers: CostDriver[] = [
  { rank: 1, service: 'Claude API', cost: 1847, percentage: 50.6, trend: 12.3 },
  { rank: 2, service: 'Cloudflare Workers', cost: 892, percentage: 24.5, trend: -3.2 },
  { rank: 3, service: 'D1 Database', cost: 412, percentage: 11.3, trend: 8.7 },
  { rank: 4, service: 'R2 Storage', cost: 287, percentage: 7.9, trend: 2.1 },
  { rank: 5, service: 'Vectorize', cost: 209, percentage: 5.7, trend: -1.5 },
]

const recommendations: Recommendation[] = [
  {
    id: '1',
    title: 'Implement response caching',
    description: 'Cache Claude API responses for similar queries to reduce redundant calls',
    potentialSavings: 420,
  },
  {
    id: '2',
    title: 'Archive old traces',
    description: 'Move traces older than 90 days to cold storage',
    potentialSavings: 180,
  },
  {
    id: '3',
    title: 'Optimize worker execution',
    description: 'Reduce worker duration by optimizing database queries',
    potentialSavings: 145,
  },
  {
    id: '4',
    title: 'Batch API requests',
    description: 'Combine multiple eval requests into batch operations',
    potentialSavings: 230,
  },
]

const chartData = [
  { date: 'Nov 1', apiCosts: 45, compute: 28, storage: 12, database: 15 },
  { date: 'Nov 5', apiCosts: 52, compute: 32, storage: 13, database: 16 },
  { date: 'Nov 10', apiCosts: 61, compute: 29, storage: 14, database: 18 },
  { date: 'Nov 15', apiCosts: 58, compute: 35, storage: 15, database: 17 },
  { date: 'Nov 20', apiCosts: 67, compute: 31, storage: 14, database: 19 },
  { date: 'Nov 25', apiCosts: 72, compute: 38, storage: 16, database: 20 },
  { date: 'Nov 30', apiCosts: 68, compute: 34, storage: 15, database: 18 },
]

export default function ResourcesPage() {
  const [activeTab, setActiveTab] = useState<'drivers' | 'recommendations'>('drivers')
  const [sortBy, setSortBy] = useState<'cost' | 'date'>('cost')

  const getSeverityIcon = (severity: BudgetAlert['severity']) => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-warning" />
      case 'info':
        return <Info className="w-5 h-5 text-info" />
    }
  }

  const getSeverityBg = (severity: BudgetAlert['severity']) => {
    switch (severity) {
      case 'error':
        return 'bg-destructive/20'
      case 'warning':
        return 'bg-warning/10'
      case 'info':
        return 'bg-info/10'
    }
  }

  const getBadgeStyles = (variant: 'success' | 'error' | 'warning') => {
    switch (variant) {
      case 'success':
        return 'bg-success/20 text-success border-success/30'
      case 'error':
        return 'bg-destructive/20 text-destructive border-destructive/30'
      case 'warning':
        return 'bg-warning/10 text-warning border-warning/30'
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-info" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Cost & Resource Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Monitor resource utilization, track costs, and optimize infrastructure spending
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex flex-wrap items-center gap-3 mt-6">
          {/* Cost Center Selector */}
          <button className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted transition-colors">
            <span className="text-sm font-medium text-foreground">All Cost Centers</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Date Range Selector */}
          <button className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted transition-colors">
            <span className="text-sm font-medium text-foreground">Current Month</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="flex-1" />

          {/* Budget View Toggle */}
          <Button variant="outline" className="gap-2" onClick={() => toast.info('Not implemented: Budget View')}>
            <BarChart3 className="w-4 h-4" />
            Budget View
          </Button>

          {/* Export Report */}
          <Button className="gap-2 bg-info hover:bg-info/90 text-white" onClick={() => toast.info('Not implemented: Export Report')}>
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Budget Alerts */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Budget Alerts</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {budgetAlerts.map((alert) => (
            <Card
              key={alert.id}
              className={cn('p-4 border-l-4', getSeverityBg(alert.severity))}
              style={{
                borderLeftColor:
                  alert.severity === 'error'
                    ? 'hsl(var(--destructive))'
                    : alert.severity === 'warning'
                    ? 'hsl(var(--warning))'
                    : 'hsl(var(--info))',
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">{getSeverityIcon(alert.severity)}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-foreground mb-1">{alert.title}</h3>
                  <p className="text-xs text-muted-foreground mb-2">{alert.message}</p>
                  <p className="text-xs text-muted-foreground/70">{alert.timestamp}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpiCards.map((kpi) => (
          <Card key={kpi.id} className="p-6 bg-card">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{kpi.title}</span>
                {kpi.badge && (
                  <span
                    className={cn(
                      'text-xs font-medium px-2 py-0.5 rounded-full border',
                      getBadgeStyles(kpi.badge.variant)
                    )}
                  >
                    {kpi.badge.text}
                  </span>
                )}
              </div>
              <div className="text-3xl font-bold text-foreground mb-1">{kpi.value}</div>
              {kpi.budget && (
                <div className="text-sm text-muted-foreground">Budget: {kpi.budget}</div>
              )}
            </div>

            {/* Trend */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center gap-1 text-sm font-medium',
                  kpi.trend.isPositive ? 'text-success' : 'text-destructive'
                )}
              >
                {kpi.trend.isPositive ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span>{kpi.trend.value}%</span>
              </div>
              <span className="text-xs text-muted-foreground/70">vs last month</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost Breakdown Chart */}
        <div className="lg:col-span-2">
          <Card className="p-6 bg-card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">Cost Breakdown Over Time</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSortBy(sortBy === 'cost' ? 'date' : 'cost')}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Sort by {sortBy === 'cost' ? 'Cost' : 'Date'}
                </button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => toast.info('Not implemented: Export Chart')}>
                  <Download className="w-3.5 h-3.5" />
                  Export Chart
                </Button>
              </div>
            </div>

            {/* Simple Bar Chart */}
            <div className="space-y-4">
              {chartData.map((item, index) => {
                const total = item.apiCosts + item.compute + item.storage + item.database
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground font-medium">{item.date}</span>
                      <span className="text-foreground font-semibold">${total}</span>
                    </div>
                    <div className="flex h-8 rounded-lg overflow-hidden">
                      <div
                        className="bg-info transition-all"
                        style={{ width: `${(item.apiCosts / total) * 100}%` }}
                        title={`API: $${item.apiCosts}`}
                      />
                      <div
                        className="bg-warning transition-all"
                        style={{ width: `${(item.compute / total) * 100}%` }}
                        title={`Compute: $${item.compute}`}
                      />
                      <div
                        className="bg-primary transition-all"
                        style={{ width: `${(item.storage / total) * 100}%` }}
                        title={`Storage: $${item.storage}`}
                      />
                      <div
                        className="bg-success transition-all"
                        style={{ width: `${(item.database / total) * 100}%` }}
                        title={`Database: $${item.database}`}
                      />
                    </div>
                  </div>
                )
              })}

              {/* Legend */}
              <div className="flex flex-wrap gap-6 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-info" />
                  <span className="text-xs text-muted-foreground font-medium">API Costs</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-warning" />
                  <span className="text-xs text-muted-foreground font-medium">Compute</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-primary" />
                  <span className="text-xs text-muted-foreground font-medium">Storage</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-success" />
                  <span className="text-xs text-muted-foreground font-medium">Database</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Top Cost Drivers / Recommendations Sidebar */}
        <div className="lg:col-span-1">
          <Card className="p-6 bg-card">
            {/* Tab Toggle */}
            <div className="flex gap-2 mb-6 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setActiveTab('drivers')}
                className={cn(
                  'flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors',
                  activeTab === 'drivers'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Cost Drivers
              </button>
              <button
                onClick={() => setActiveTab('recommendations')}
                className={cn(
                  'flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors',
                  activeTab === 'recommendations'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Recommendations
              </button>
            </div>

            {/* Content */}
            {activeTab === 'drivers' ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">Top Cost Drivers</h3>
                {costDrivers.map((driver) => (
                  <div key={driver.rank} className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-info/10 flex items-center justify-center">
                          <span className="text-xs font-semibold text-success">
                            {driver.rank}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground mb-1">
                            {driver.service}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {driver.percentage}% of total
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-foreground">
                          ${driver.cost}
                        </div>
                        <div
                          className={cn(
                            'text-xs font-medium flex items-center gap-0.5',
                            driver.trend > 0 ? 'text-destructive' : 'text-success'
                          )}
                        >
                          {driver.trend > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {Math.abs(driver.trend)}%
                        </div>
                      </div>
                    </div>
                    {driver.rank < costDrivers.length && (
                      <div className="h-px bg-border" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Optimization Recommendations
                </h3>
                {recommendations.map((rec, index) => (
                  <div key={rec.id} className="space-y-2">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-medium text-foreground flex-1">
                          {rec.title}
                        </h4>
                        <span className="text-xs font-semibold text-success whitespace-nowrap">
                          Save ${rec.potentialSavings}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{rec.description}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs bg-info/5 border-info/30 hover:bg-info/10"
                        onClick={() => toast.info('Not implemented: Learn More')}
                      >
                        Learn More
                      </Button>
                    </div>
                    {index < recommendations.length - 1 && (
                      <div className="h-px bg-border" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
