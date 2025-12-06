'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KPICard } from '@/components/ui/kpi-card'
import { EvaluationChart } from '@/components/charts/evaluation-chart'
import { Target, Activity, AlertTriangle, TrendingUp } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import Link from 'next/link'

const scoreDistribution = [
  { range: '0-20', value: 2, color: '#D84315' },
  { range: '21-40', value: 5, color: '#FF8A8A' },
  { range: '41-60', value: 12, color: '#8B949E' },
  { range: '61-80', value: 28, color: '#B2DFDB' },
  { range: '81-90', value: 35, color: '#4ECDC4' },
  { range: '91-100', value: 18, color: '#4CAF50' },
]

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('7d')
  const [selectedMetrics, setSelectedMetrics] = useState(['success_rate', 'accuracy'])

  // Fetch evals for analytics
  const { data: evalsData, isLoading } = useQuery({
    queryKey: ['evals'],
    queryFn: () => apiClient.listEvals({ limit: 100 }),
  })

  // Calculate aggregate metrics
  const evals = evalsData?.evals || []
  const avgAccuracy =
    evals.length > 0
      ? evals.reduce((sum, e) => sum + (e.accuracy || 0), 0) / evals.length
      : 0
  const totalExecutions = evals.reduce((sum, e) => sum + e.execution_count, 0)
  const totalContradictions = evals.reduce((sum, e) => sum + e.contradiction_count, 0)

  // Mock trend data (in real impl, fetch from API)
  const mockTrendData = [
    { date: '2025-11-24', success_rate: 84.2, accuracy: 86.1 },
    { date: '2025-11-25', success_rate: 85.8, accuracy: 87.3 },
    { date: '2025-11-26', success_rate: 86.5, accuracy: 88.2 },
    { date: '2025-11-27', success_rate: 85.3, accuracy: 86.9 },
    { date: '2025-11-28', success_rate: 87.1, accuracy: 89.1 },
    { date: '2025-11-29', success_rate: 87.8, accuracy: 89.7 },
    { date: '2025-11-30', success_rate: 87.3, accuracy: 89.2 },
  ]

  // Generate sparkline data for KPI cards
  const accuracySparkline = [82, 84, 83, 85, 86, 87, 87]
  const executionsSparkline = [50, 60, 55, 70, 78, 90, 100]
  const contradictionsSparkline = [60, 55, 52, 48, 50, 45, 47]
  const evalsSparkline = [67, 75, 75, 83, 83, 92, 100]

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Evaluation performance overview and trends
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <KPICard
          title="Avg Accuracy"
          value={`${(avgAccuracy * 100).toFixed(1)}%`}
          change="+2.1%"
          changeType="positive"
          icon={<Target className="w-5 h-5" />}
          sparklineData={accuracySparkline}
          status="success"
        />
        <KPICard
          title="Total Executions"
          value={totalExecutions.toLocaleString()}
          change="+156"
          changeType="positive"
          icon={<Activity className="w-5 h-5" />}
          sparklineData={executionsSparkline}
          status="success"
        />
        <KPICard
          title="Contradictions"
          value={totalContradictions}
          change="-8"
          changeType="positive"
          icon={<AlertTriangle className="w-5 h-5" />}
          sparklineData={contradictionsSparkline}
          status="warning"
        />
        <KPICard
          title="Active Evals"
          value={evals.length}
          change="+2"
          changeType="positive"
          icon={<TrendingUp className="w-5 h-5" />}
          sparklineData={evalsSparkline}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Trend Chart */}
        <Card className="col-span-2 p-6">
          <h3 className="text-lg font-medium mb-4">Accuracy Trend</h3>
          <EvaluationChart
            data={mockTrendData}
            selectedMetrics={selectedMetrics}
            onMetricToggle={(metric) =>
              setSelectedMetrics((prev) =>
                prev.includes(metric)
                  ? prev.filter((m) => m !== metric)
                  : [...prev, metric]
              )
            }
          />
        </Card>

        {/* Score Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-4">Score Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={scoreDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                dataKey="value"
                label
              >
                {scoreDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {scoreDistribution.map((entry) => (
              <div key={entry.range} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: entry.color }}
                />
                <span>{entry.range}: {entry.value}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Top Contradictions */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Top Contradictions</h3>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-muted-foreground">
                <th className="pb-3">Eval Name</th>
                <th className="pb-3">Agent</th>
                <th className="pb-3 text-right">Contradictions</th>
                <th className="pb-3 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {evals
                .filter((e) => e.contradiction_count > 0)
                .sort((a, b) => b.contradiction_count - a.contradiction_count)
                .slice(0, 5)
                .map((evalItem) => (
                  <tr key={evalItem.id} className="border-t">
                    <td className="py-3">
                      <Link
                        href={`/evals?selected=${evalItem.id}`}
                        className="hover:underline font-medium"
                      >
                        {evalItem.name}
                      </Link>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {evalItem.agent_id.replace('agent_', '')}
                    </td>
                    <td className="py-3 text-right text-red-600 font-medium">
                      {evalItem.contradiction_count}
                    </td>
                    <td className="py-3 text-right">
                      {(evalItem.accuracy * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        {!isLoading && evals.filter((e) => e.contradiction_count > 0).length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No contradictions found
          </div>
        )}
      </Card>
    </div>
  )
}
