'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Play,
  Save,
  Plus,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatPercentage } from '@/lib/utils'
import type { PlaygroundResult } from '@/types/api'

// Dynamic import for Monaco to avoid SSR issues
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-[400px] bg-muted animate-pulse rounded" /> }
)

export default function EvalPlaygroundPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const evalId = params.id as string

  // State
  const [code, setCode] = useState('')
  const [selectedTraceIds, setSelectedTraceIds] = useState<string[]>([])
  const [results, setResults] = useState<PlaygroundResult[] | null>(null)
  const [summary, setSummary] = useState<{
    total: number
    matches: number
    contradictions: number
    avg_time_ms: number
  } | null>(null)

  // Fetch eval
  const { data: evalData, isLoading: loadingEval } = useQuery({
    queryKey: ['eval', evalId],
    queryFn: () => apiClient.getEval(evalId),
  })

  // Set code when eval data loads
  useState(() => {
    if (evalData && !code) {
      setCode(evalData.code)
    }
  })

  // Fetch traces for the eval's agent
  const { data: tracesData, isLoading: loadingTraces } = useQuery({
    queryKey: ['traces', evalData?.agent_id],
    queryFn: () =>
      apiClient.listTraces({
        agent_id: evalData!.agent_id,
        limit: 50,
      }),
    enabled: !!evalData?.agent_id,
  })

  // Run mutation
  const runMutation = useMutation({
    mutationFn: () =>
      apiClient.playgroundRun(evalId, {
        code,
        trace_ids: selectedTraceIds,
      }),
    onSuccess: (data) => {
      setResults(data.results)
      setSummary(data.summary)
      toast.success('Eval executed successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to run eval')
    },
  })

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.updateEval(evalId, { code }),
    onSuccess: () => {
      toast.success('Eval saved')
      queryClient.invalidateQueries({ queryKey: ['eval', evalId] })
    },
    onError: () => {
      toast.error('Failed to save eval')
    },
  })

  // Toggle trace selection
  const toggleTrace = useCallback((traceId: string) => {
    setSelectedTraceIds((prev) =>
      prev.includes(traceId)
        ? prev.filter((id) => id !== traceId)
        : [...prev, traceId]
    )
  }, [])

  // Select all / clear all
  const selectAll = useCallback(() => {
    if (tracesData?.traces) {
      setSelectedTraceIds(tracesData.traces.map((t) => t.id))
    }
  }, [tracesData])

  const clearSelection = useCallback(() => {
    setSelectedTraceIds([])
  }, [])

  if (loadingEval) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">Loading...</div>
      </div>
    )
  }

  if (!evalData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12 text-muted-foreground">
          Eval not found
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Link href="/evals">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Evals
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">{evalData.name}</h1>
          <Badge variant="outline">Playground</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
          <Button variant="outline" onClick={() => toast.info('Save As New not implemented')}>
            <Plus className="w-4 h-4 mr-2" />
            Save As New
          </Button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Code Editor */}
        <div>
          <h3 className="text-sm font-medium mb-2">Eval Code</h3>
          <div className="border rounded-lg overflow-hidden">
            <MonacoEditor
              height="400px"
              language="python"
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        {/* Trace Picker */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">Select Traces</h3>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>
          <div className="border rounded-lg h-[400px] overflow-y-auto p-2 space-y-1">
            {loadingTraces ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading traces...
              </div>
            ) : !tracesData?.traces?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No traces found for this agent
              </div>
            ) : (
              tracesData.traces.map((trace) => (
                <div
                  key={trace.id}
                  className={cn(
                    'flex items-center gap-3 p-2 rounded cursor-pointer transition-colors',
                    selectedTraceIds.includes(trace.id)
                      ? 'bg-accent'
                      : 'hover:bg-muted'
                  )}
                  onClick={() => toggleTrace(trace.id)}
                >
                  <Checkbox
                    checked={selectedTraceIds.includes(trace.id)}
                    onCheckedChange={() => toggleTrace(trace.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono truncate">
                      {trace.id.slice(0, 16)}...
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {trace.summary?.input_preview || 'No preview'}
                    </div>
                  </div>
                  {trace.feedback && (
                    <Badge
                      variant={
                        trace.feedback.rating === 'positive'
                          ? 'default'
                          : trace.feedback.rating === 'negative'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="text-xs"
                    >
                      {trace.feedback.rating}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Run Button */}
      <div className="mb-6">
        <Button
          onClick={() => runMutation.mutate()}
          disabled={selectedTraceIds.length === 0 || runMutation.isPending}
          className="w-full"
          size="lg"
        >
          {runMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Run on {selectedTraceIds.length} Selected Trace{selectedTraceIds.length !== 1 ? 's' : ''}
        </Button>
      </div>

      {/* Results */}
      {results && (
        <>
          <div className="border rounded-lg overflow-hidden mb-4">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium">Trace ID</th>
                  <th className="text-left px-4 py-3 text-sm font-medium">Human</th>
                  <th className="text-left px-4 py-3 text-sm font-medium">Predicted</th>
                  <th className="text-center px-4 py-3 text-sm font-medium">Match</th>
                  <th className="text-left px-4 py-3 text-sm font-medium">Reason</th>
                  <th className="text-right px-4 py-3 text-sm font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr
                    key={result.trace_id}
                    className={cn(
                      'border-t',
                      result.is_contradiction && 'bg-red-50/50'
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-sm">
                      {result.trace_id.slice(0, 12)}...
                    </td>
                    <td className="px-4 py-3">
                      {result.human_feedback ? (
                        <Badge
                          variant={
                            result.human_feedback === 'positive'
                              ? 'default'
                              : result.human_feedback === 'negative'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {result.human_feedback}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {result.error ? (
                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                      ) : result.predicted ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {result.is_match === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : result.is_match ? (
                        <CheckCircle className="w-4 h-4 text-green-600 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-[300px] truncate">
                      {result.error || result.reason}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                      {result.execution_time_ms}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          {summary && (
            <Card className="p-4">
              <div className="flex justify-between items-center">
                <div className="flex gap-6">
                  <div>
                    <span className="text-muted-foreground text-sm">Total:</span>{' '}
                    <span className="font-medium">{summary.total}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-sm">Matches:</span>{' '}
                    <span className="font-medium text-green-600">{summary.matches}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-sm">Contradictions:</span>{' '}
                    <span className="font-medium text-red-600">{summary.contradictions}</span>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Avg: {summary.avg_time_ms}ms
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
