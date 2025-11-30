'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EvaluationChart } from '@/components/charts/evaluation-chart'
import {
  Radio,
  Filter,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Target,
  Activity
} from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { EvalsResultsSkeleton } from '@/components/skeletons/evals-results-skeleton'

// Mock data for the enhanced visualization
const mockTrendData = [
  { date: '2025-11-24', success_rate: 84.2, performance_score: 89.5, latency: 245, cost_per_run: 0.12, accuracy: 86.1 },
  { date: '2025-11-25', success_rate: 85.8, performance_score: 90.2, latency: 238, cost_per_run: 0.13, accuracy: 87.3 },
  { date: '2025-11-26', success_rate: 86.5, performance_score: 91.1, latency: 242, cost_per_run: 0.11, accuracy: 88.2 },
  { date: '2025-11-27', success_rate: 85.3, performance_score: 89.8, latency: 251, cost_per_run: 0.14, accuracy: 86.9 },
  { date: '2025-11-28', success_rate: 87.1, performance_score: 92.3, latency: 235, cost_per_run: 0.12, accuracy: 89.1 },
  { date: '2025-11-29', success_rate: 87.8, performance_score: 92.8, latency: 229, cost_per_run: 0.13, accuracy: 89.7 },
  { date: '2025-11-30', success_rate: 87.3, performance_score: 92.1, latency: 233, cost_per_run: 0.13, accuracy: 89.2 }
]

const scoreDistribution = [
  { range: '0-20', value: 2, color: '#D4705A' }, // Coral Dark - error
  { range: '21-40', value: 5, color: '#F2B8A2' }, // Coral Light - warning
  { range: '41-60', value: 12, color: '#6B7280' }, // Gray - neutral
  { range: '61-80', value: 28, color: '#8EDCC4' }, // Mint Light
  { range: '81-90', value: 35, color: '#4ECFA5' }, // Mint
  { range: '91-100', value: 18, color: '#2D9B78' } // Mint Dark
]

const SparklineChart = ({ data, color }: { data: number[], color: string }) => {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 100
    return `${x},${y}`
  }).join(' ')

  return (
    <svg className="w-full h-12" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

const KPICard = ({
  title,
  value,
  unit,
  trend,
  trendValue,
  vsBaseline,
  icon: Icon,
  sparklineData,
  sparklineColor,
  subtitle
}: {
  title: string
  value: string | number
  unit?: string
  trend: 'up' | 'down'
  trendValue: string
  vsBaseline?: string
  icon: any
  sparklineData: number[]
  sparklineColor: string
  subtitle?: string
}) => (
  <Card className="p-6 bg-white border-[var(--color-border)] shadow-[var(--shadow-elevation-1)]">
    <div className="flex items-start justify-between mb-4">
      <div>
        <p className="text-sm font-medium text-[var(--color-muted-foreground)] mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-[var(--color-foreground)]">{value}</span>
          {unit && <span className="text-sm text-[var(--color-muted-foreground)]">{unit}</span>}
        </div>
      </div>
      <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-[var(--color-primary)]" />
      </div>
    </div>

    {subtitle && (
      <p className="text-xs text-[var(--color-muted-foreground)] mb-3">{subtitle}</p>
    )}

    <div className="mb-3">
      <SparklineChart data={sparklineData} color={sparklineColor} />
    </div>

    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-1">
        {trend === 'up' ? (
          <TrendingUp className="w-4 h-4 text-[var(--color-success)]" />
        ) : (
          <TrendingDown className="w-4 h-4 text-[var(--color-error)]" />
        )}
        <span className={trend === 'up' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
          {trendValue}
        </span>
      </div>
      {vsBaseline && (
        <span className="text-[var(--color-muted-foreground)]">{vsBaseline}</span>
      )}
    </div>
  </Card>
)

export default function EvalsPage() {
  const [liveStream, setLiveStream] = useState(false)
  const [selectedMetrics, setSelectedMetrics] = useState(['success_rate', 'performance_score'])
  const [selectedEvalFunction, setSelectedEvalFunction] = useState('all')
  const [selectedEnvironment, setSelectedEnvironment] = useState('all')
  const [baselineComparison, setBaselineComparison] = useState('previous')
  const [mounted, setMounted] = useState(false)

  // Delay rendering charts until after hydration to prevent SSR dimension issues
  useEffect(() => {
    setMounted(true)
  }, [])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['evals'],
    queryFn: () => apiClient.listEvals({ limit: 50 }),
  })

  const handleMetricToggle = (metric: string) => {
    setSelectedMetrics(prev =>
      prev.includes(metric)
        ? prev.filter(m => m !== metric)
        : [...prev, metric]
    )
  }

  const handleExport = () => {
    // Export functionality would go here
    console.log('Exporting evaluation results...')
  }

  if (isLoading) {
    return <EvalsResultsSkeleton />
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-[var(--color-foreground)] mb-2">
                Evaluation Results
              </h1>
              <p className="text-base text-[var(--color-muted-foreground)]">
                Comprehensive results visualization with trend analysis
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant={liveStream ? "default" : "outline"}
                size="sm"
                onClick={() => setLiveStream(!liveStream)}
                className={liveStream ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]' : ''}
              >
                <Radio className={`w-4 h-4 mr-2 ${liveStream ? 'animate-pulse' : ''}`} />
                Live Stream
              </Button>

              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>

              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Data
              </Button>
            </div>
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[var(--color-foreground)] mb-2">
                Evaluation Function
              </label>
              <select
                value={selectedEvalFunction}
                onChange={(e) => setSelectedEvalFunction(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-colors"
              >
                <option value="all">All Evaluation Functions</option>
                <option value="response_quality">Response Quality Eval</option>
                <option value="latency_check">Latency Check Eval</option>
                <option value="accuracy_test">Accuracy Test Eval</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-[var(--color-foreground)] mb-2">
                Environment
              </label>
              <select
                value={selectedEnvironment}
                onChange={(e) => setSelectedEnvironment(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-colors"
              >
                <option value="all">All Environments</option>
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-[var(--color-foreground)] mb-2">
                Baseline Comparison
              </label>
              <select
                value={baselineComparison}
                onChange={(e) => setBaselineComparison(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-colors"
              >
                <option value="previous">Previous Run</option>
                <option value="last_week">Last Week</option>
                <option value="last_month">Last Month</option>
                <option value="baseline">Custom Baseline</option>
              </select>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard
            title="Success Rate"
            value="87.3"
            unit="%"
            trend="up"
            trendValue="+2.4%"
            vsBaseline="vs 84.9%"
            icon={Target}
            sparklineData={mockTrendData.map(d => d.success_rate)}
            sparklineColor="var(--chart-primary)"
          />

          <KPICard
            title="Regression Detection"
            value="3"
            unit="Issues"
            trend="down"
            trendValue="-2 from prev"
            subtitle="2 Critical, 1 Warning"
            icon={AlertTriangle}
            sparklineData={[5, 6, 4, 5, 4, 3, 3]}
            sparklineColor="#D4705A"
          />

          <KPICard
            title="Performance Score"
            value="92.1"
            trend="up"
            trendValue="+3.2%"
            vsBaseline="avg response quality"
            icon={Activity}
            sparklineData={mockTrendData.map(d => d.performance_score)}
            sparklineColor="var(--chart-primary-dark)"
          />

          <KPICard
            title="Cost Analysis"
            value="$127.45"
            trend="up"
            trendValue="+8.3%"
            vsBaseline="per 1K evaluations"
            icon={DollarSign}
            sparklineData={mockTrendData.map(d => d.cost_per_run * 1000)}
            sparklineColor="var(--chart-secondary-dark)"
          />
        </div>

        {/* Main Content: Chart and Score Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Evaluation Metrics Trend Chart */}
          <div className="lg:col-span-2">
            <EvaluationChart
              data={mockTrendData}
              selectedMetrics={selectedMetrics}
              onMetricToggle={handleMetricToggle}
              title="Evaluation Metrics Trend"
              subtitle="Performance metrics over time with confidence intervals"
              baselineValue={85}
            />
          </div>

          {/* Score Distribution */}
          <div className="lg:col-span-1">
            <Card className="p-6 bg-white border-[var(--color-border)] shadow-[var(--shadow-elevation-1)] h-full">
              <h3 className="text-lg font-semibold text-[var(--color-foreground)] mb-4">
                Score Distribution
              </h3>
              <p className="text-sm text-[var(--color-muted-foreground)] mb-6">
                Distribution of evaluation scores across all runs
              </p>

              <div className="h-64 mb-6">
                {!mounted ? (
                  <div className="w-full h-full flex items-center justify-center bg-muted/20 rounded-lg">
                    <div className="animate-pulse text-muted-foreground">Loading chart...</div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={scoreDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {scoreDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="bg-white border border-[var(--color-border)] rounded-lg p-3 shadow-lg">
                                <p className="text-sm font-medium text-[var(--color-foreground)] mb-1">
                                  Score: {data.range}
                                </p>
                                <p className="text-sm text-[var(--color-muted-foreground)]">
                                  Count: {data.value}
                                </p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Score Distribution Legend and Stats */}
              <div className="space-y-3">
                <div className="border-t border-[var(--color-border)] pt-4">
                  <h4 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
                    Summary Statistics
                  </h4>

                  {scoreDistribution.map((item) => (
                    <div key={item.range} className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm text-[var(--color-foreground)]">
                          {item.range}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-[var(--color-foreground)]">
                          {item.value}
                        </span>
                        <span className="text-xs text-[var(--color-muted-foreground)] w-12 text-right">
                          {Math.round((item.value / scoreDistribution.reduce((sum, d) => sum + d.value, 0)) * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-[var(--color-border)] pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-[var(--color-muted-foreground)]">Total Evaluations</span>
                    <span className="text-sm font-semibold text-[var(--color-foreground)]">
                      {scoreDistribution.reduce((sum, d) => sum + d.value, 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-[var(--color-muted-foreground)]">Mean Score</span>
                    <span className="text-sm font-semibold text-[var(--color-foreground)]">
                      78.4
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--color-muted-foreground)]">Median Score</span>
                    <span className="text-sm font-semibold text-[var(--color-foreground)]">
                      82.0
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Additional Information Notice */}
        {data?.evals && data.evals.length > 0 && (
          <div className="mt-8 p-4 bg-[var(--color-accent)]/20 border border-[var(--color-primary)]/20 rounded-lg">
            <p className="text-sm text-[var(--color-foreground)]">
              <strong>Note:</strong> This visualization shows aggregated results across all evaluation functions.
              For detailed individual eval results, visit the{' '}
              <Link href="/evals" className="text-[var(--color-primary)] hover:underline font-medium">
                Evals Management
              </Link>{' '}
              page.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
