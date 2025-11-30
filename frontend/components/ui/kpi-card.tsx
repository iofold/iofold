'use client'

import * as React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KPICardProps {
  title: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  icon?: React.ReactNode
  sparklineData?: number[]
  status?: 'success' | 'warning' | 'error'
}

export function KPICard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon,
  sparklineData,
  status,
}: KPICardProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'text-success'
      case 'warning':
        return 'text-warning'
      case 'error':
        return 'text-error'
      default:
        return 'text-muted-foreground'
    }
  }

  const getStatusBgColor = () => {
    switch (status) {
      case 'success':
        return 'bg-success/10'
      case 'warning':
        return 'bg-warning/10'
      case 'error':
        return 'bg-error/10'
      default:
        return 'bg-muted'
    }
  }

  const getChangeColor = () => {
    if (changeType === 'positive') return 'text-success'
    if (changeType === 'negative') return 'text-error'
    return 'text-muted-foreground'
  }

  const getChangeIcon = () => {
    if (changeType === 'positive') return <TrendingUp className="h-3.5 w-3.5" />
    if (changeType === 'negative') return <TrendingDown className="h-3.5 w-3.5" />
    return <Minus className="h-3.5 w-3.5" />
  }

  const getSparklineColor = () => {
    switch (status) {
      case 'success':
        return 'hsl(var(--success))'
      case 'warning':
        return 'hsl(var(--warning))'
      case 'error':
        return 'hsl(var(--error))'
      default:
        return 'hsl(var(--muted-foreground))'
    }
  }

  const generateSparklinePoints = () => {
    if (!sparklineData || sparklineData.length === 0) {
      return '0,16 64,16' // Flat line if no data
    }

    return sparklineData
      .map((point, index) => {
        const x = (index / (sparklineData.length - 1)) * 60
        const y = 32 - (point / 100) * 28
        return `${x},${y}`
      })
      .join(' ')
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-elevation-1">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          {icon && (
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                getStatusBgColor()
              )}
            >
              <div className={getStatusColor()}>{icon}</div>
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
            <p className="text-2xl font-semibold text-foreground">{value}</p>
          </div>
        </div>

        {/* Sparkline */}
        <div className="w-16 h-8">
          <svg
            width="64"
            height="32"
            viewBox="0 0 64 32"
            className="overflow-visible"
            aria-label="Trend sparkline"
          >
            <polyline
              fill="none"
              stroke={getSparklineColor()}
              strokeWidth="2"
              points={generateSparklinePoints()}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>

      {change && (
        <div className="flex items-center space-x-1">
          <span className={getChangeColor()}>{getChangeIcon()}</span>
          <span className={cn('text-sm font-medium', getChangeColor())}>
            {change}
          </span>
          <span className="text-sm text-muted-foreground">vs last period</span>
        </div>
      )}
    </div>
  )
}
