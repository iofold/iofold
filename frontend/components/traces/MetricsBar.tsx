'use client'

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity, MessageSquare, AlertTriangle, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Metric {
  label: string
  value: string | number
  icon: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
  color?: 'default' | 'success' | 'warning' | 'error'
}

interface MetricsBarProps {
  totalTraces: number
  feedbackCount: number
  errorCount: number
  isLoading?: boolean
  className?: string
}

const colorClasses = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
}

function MetricCard({ metric, isLoading }: { metric: Metric; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 p-3">
      <div className={cn(
        "flex h-10 w-10 items-center justify-center rounded-lg bg-muted",
        metric.color && colorClasses[metric.color]
      )}>
        {metric.icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{metric.label}</p>
        <div className="flex items-center gap-2">
          <p className={cn("text-xl font-semibold", metric.color && colorClasses[metric.color])}>
            {metric.value}
          </p>
          {metric.trend && (
            <span className={cn(
              "text-xs font-medium",
              metric.trend.isPositive ? "text-success" : "text-error"
            )}>
              {metric.trend.isPositive ? '+' : ''}{metric.trend.value}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function MetricsBar({
  totalTraces,
  feedbackCount,
  errorCount,
  isLoading = false,
  className,
}: MetricsBarProps) {
  const feedbackRate = totalTraces > 0 ? Math.round((feedbackCount / totalTraces) * 100) : 0
  const errorRate = totalTraces > 0 ? Math.round((errorCount / totalTraces) * 100) : 0

  const metrics: Metric[] = [
    {
      label: 'Total Traces',
      value: totalTraces.toLocaleString(),
      icon: <Activity className="h-5 w-5" />,
      color: 'default',
    },
    {
      label: 'With Feedback',
      value: `${feedbackRate}%`,
      icon: <MessageSquare className="h-5 w-5" />,
      color: feedbackRate >= 50 ? 'success' : feedbackRate >= 25 ? 'warning' : 'default',
    },
    {
      label: 'Feedback Count',
      value: feedbackCount.toLocaleString(),
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'success',
    },
    {
      label: 'Error Rate',
      value: `${errorRate}%`,
      icon: <AlertTriangle className="h-5 w-5" />,
      color: errorRate > 10 ? 'error' : errorRate > 5 ? 'warning' : 'success',
    },
  ]

  return (
    <Card className={cn("mb-6", className)} data-testid="metrics-bar">
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0">
        {metrics.map((metric, index) => (
          <MetricCard key={index} metric={metric} isLoading={isLoading} />
        ))}
      </div>
    </Card>
  )
}
