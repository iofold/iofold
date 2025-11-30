'use client'

import { useState, useEffect } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  TooltipProps
} from 'recharts'

interface DistributionDataPoint {
  name: string
  value: number
  color?: string
}

interface DistributionChartProps {
  data: DistributionDataPoint[]
  title?: string
  subtitle?: string
  height?: number
  colors?: string[]
}

const defaultColors = [
  'var(--chart-primary)',
  'var(--chart-secondary)',
  'var(--chart-tertiary)',
  'var(--chart-quaternary)',
  'var(--chart-quinary)'
]

const CustomTooltip = ({
  active,
  payload,
  label
}: { active?: boolean; payload?: any[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-elevation-2">
        <p className="text-sm font-medium text-foreground mb-1">{label}</p>
        <p className="text-sm text-muted-foreground">
          Count: <span className="font-medium text-foreground">{payload[0].value}</span>
        </p>
      </div>
    )
  }
  return null
}

export function DistributionChart({
  data,
  title = 'Distribution',
  subtitle,
  height = 300,
  colors = defaultColors
}: DistributionChartProps) {
  const [mounted, setMounted] = useState(false)

  // Delay rendering until after hydration to prevent SSR dimension issues
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-elevation-1">
      {title && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      )}

      <div style={{ height }}>
        {!mounted ? (
          <div className="w-full h-full flex items-center justify-center bg-muted/20 rounded-lg">
            <div className="animate-pulse text-muted-foreground">Loading chart...</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="name"
                stroke="var(--color-muted-foreground)"
                fontSize={12}
              />
              <YAxis
                stroke="var(--color-muted-foreground)"
                fontSize={12}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color || colors[index % colors.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
