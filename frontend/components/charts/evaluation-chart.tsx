'use client'

import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  TooltipProps
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, ZoomOut } from 'lucide-react'

interface EvaluationDataPoint {
  date: string
  success_rate?: number
  performance_score?: number
  latency?: number
  cost_per_run?: number
  accuracy?: number
  [key: string]: string | number | undefined
}

interface EvaluationChartProps {
  data: EvaluationDataPoint[]
  selectedMetrics: string[]
  onMetricToggle: (metric: string) => void
  title?: string
  subtitle?: string
  baselineValue?: number
}

const metricColors: Record<string, string> = {
  success_rate: 'var(--chart-primary)',
  performance_score: 'var(--chart-primary-dark)',
  latency: 'var(--chart-secondary)',
  cost_per_run: 'var(--chart-secondary-dark)',
  accuracy: 'var(--chart-quaternary)'
}

const CustomTooltip = ({
  active,
  payload,
  label
}: { active?: boolean; payload?: any[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-elevation-2">
        <p className="text-sm font-medium text-foreground mb-2">{`Date: ${label}`}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center space-x-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium text-foreground">{entry.value}%</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

const formatMetricLabel = (metric: string): string => {
  return metric
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

export function EvaluationChart({
  data,
  selectedMetrics,
  onMetricToggle,
  title = 'Evaluation Metrics Trend',
  subtitle = 'Performance metrics over time with confidence intervals',
  baselineValue = 85
}: EvaluationChartProps) {
  const [zoomDomain, setZoomDomain] = useState<{
    start: string
    end?: string
  } | null>(null)
  const [showConfidenceInterval, setShowConfidenceInterval] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Delay rendering until after hydration to prevent SSR dimension issues
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleZoomReset = () => {
    setZoomDomain(null)
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-elevation-1">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfidenceInterval(!showConfidenceInterval)}
          >
            {showConfidenceInterval ? (
              <EyeOff size={16} className="mr-2" />
            ) : (
              <Eye size={16} className="mr-2" />
            )}
            Confidence
          </Button>
          {zoomDomain && (
            <Button variant="outline" size="sm" onClick={handleZoomReset}>
              <ZoomOut size={16} className="mr-2" />
              Reset Zoom
            </Button>
          )}
        </div>
      </div>

      {/* Metric Toggles */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-2">
          {Object.keys(metricColors).map((metric) => (
            <button
              key={metric}
              onClick={() => onMetricToggle(metric)}
              className={`
                flex items-center space-x-2 px-3 py-1 rounded-md text-sm font-medium transition-smooth
                ${
                  selectedMetrics.includes(metric)
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }
              `}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: metricColors[metric] }}
              />
              <span>{formatMetricLabel(metric)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-80">
        {!mounted ? (
          <div className="w-full h-full flex items-center justify-center bg-muted/20 rounded-lg">
            <div className="animate-pulse text-muted-foreground">Loading chart...</div>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            onMouseDown={(e) => {
              if (e && e.activeLabel) {
                setZoomDomain({ start: e.activeLabel as string })
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              stroke="var(--color-muted-foreground)"
              fontSize={12}
              domain={
                zoomDomain
                  ? [zoomDomain.start, zoomDomain.end || 'dataMax']
                  : ['dataMin', 'dataMax']
              }
            />
            <YAxis
              stroke="var(--color-muted-foreground)"
              fontSize={12}
              domain={[0, 100]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            {/* Baseline reference line */}
            {showConfidenceInterval && (
              <ReferenceLine
                y={baselineValue}
                stroke="var(--chart-secondary-dark)"
                strokeDasharray="5 5"
                label="Baseline"
              />
            )}

            {selectedMetrics.map((metric) => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={metricColors[metric]}
                strokeWidth={2.5}
                dot={{ fill: metricColors[metric], strokeWidth: 2, r: 4 }}
                activeDot={{
                  r: 6,
                  stroke: metricColors[metric],
                  strokeWidth: 2
                }}
                name={formatMetricLabel(metric)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
