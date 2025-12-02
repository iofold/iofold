'use client'

import { useState, useEffect } from 'react'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps
} from 'recharts'
import { Button } from '@/components/ui/button'
import { BarChart3, TrendingUp, Activity, Download, Info } from 'lucide-react'
import { toast } from 'sonner'

interface TrendDataPoint {
  time: string
  passRate: number
  evaluationVolume: number
  date?: string
}

interface PassRateTrendChartProps {
  data: TrendDataPoint[]
  onDrillDown?: (data: { timePoint: string; data: TrendDataPoint }) => void
  title?: string
  subtitle?: string
}

type MetricType = 'both' | 'passRate' | 'volume'
type TimeRangeType = '24h' | '7d' | '30d'

const metricOptions = [
  { value: 'both' as const, label: 'Pass Rate & Volume', icon: BarChart3 },
  { value: 'passRate' as const, label: 'Pass Rate Only', icon: TrendingUp },
  { value: 'volume' as const, label: 'Volume Only', icon: Activity }
]

const timeRangeOptions = [
  { value: '24h' as const, label: '24 Hours' },
  { value: '7d' as const, label: '7 Days' },
  { value: '30d' as const, label: '30 Days' }
]

interface CustomTooltipData {
  name: string
  value: number
  color: string
}

const CustomTooltip = ({
  active,
  payload,
  label
}: { active?: boolean; payload?: any[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-lg shadow-elevation-2 p-3">
        <p className="text-sm font-medium text-foreground mb-2">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center space-x-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium text-foreground">
              {entry.name === 'Pass Rate' ? `${entry.value}%` : entry.value}
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export function PassRateTrendChart({
  data,
  onDrillDown,
  title = 'Pass Rate Trends',
  subtitle = 'Evaluation performance over time'
}: PassRateTrendChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('both')
  const [timeRange, setTimeRange] = useState<TimeRangeType>('7d')
  const [mounted, setMounted] = useState(false)

  // Delay rendering until after hydration to prevent SSR dimension issues
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleChartClick = (chartData: any) => {
    if (chartData?.activeLabel && onDrillDown && chartData.activePayload?.[0]) {
      onDrillDown({
        timePoint: String(chartData.activeLabel),
        data: chartData.activePayload[0].payload
      })
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-elevation-1">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Metric Toggle */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            {metricOptions.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  onClick={() => setSelectedMetric(option.value)}
                  className={`
                    flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-smooth
                    ${
                      selectedMetric === option.value
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }
                  `}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              )
            })}
          </div>

          {/* Time Range */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            {timeRangeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTimeRange(option.value)}
                className={`
                  px-3 py-1.5 rounded-md text-sm font-medium transition-smooth
                  ${
                    timeRange === option.value
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Button variant="ghost" size="sm" onClick={() => toast.info('Not implemented: Download chart')}>
            <Download size={16} />
          </Button>
        </div>
      </div>

      <div className="h-80">
        {!mounted ? (
          <div className="w-full h-full flex items-center justify-center bg-muted/20 rounded-lg">
            <div className="animate-pulse text-muted-foreground">Loading chart...</div>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            onClick={handleChartClick}
            className="cursor-pointer"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="time"
              stroke="var(--color-muted-foreground)"
              fontSize={12}
            />
            <YAxis
              yAxisId="left"
              stroke="var(--color-muted-foreground)"
              fontSize={12}
              domain={[0, 100]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="var(--color-muted-foreground)"
              fontSize={12}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: '#4B5563', fontSize: '14px', fontWeight: 500 }} />

            {(selectedMetric === 'both' || selectedMetric === 'volume') && (
              <Bar
                yAxisId="right"
                dataKey="evaluationVolume"
                name="Evaluation Volume"
                fill="var(--chart-tertiary)"
                opacity={0.5}
              />
            )}

            {(selectedMetric === 'both' || selectedMetric === 'passRate') && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="passRate"
                name="Pass Rate"
                stroke="var(--chart-primary)"
                strokeWidth={2.5}
                dot={{ fill: 'var(--chart-primary)', strokeWidth: 2, r: 4 }}
                activeDot={{
                  r: 6,
                  stroke: 'var(--chart-primary-dark)',
                  strokeWidth: 2,
                  fill: 'var(--chart-primary)'
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
          <span>Click any point to drill down</span>
          <div className="flex items-center space-x-1">
            <Info size={14} />
            <span>Real-time updates every 30s</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-success rounded-full animate-pulse-subtle" />
          <span className="text-sm text-muted-foreground">Live</span>
        </div>
      </div>
    </div>
  )
}
