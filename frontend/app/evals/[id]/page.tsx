'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { CodeViewer } from '@/components/code-viewer'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { ExecuteEvalModal } from '@/components/modals/execute-eval-modal'
import { ArrowLeft, Play, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { formatPercentage, formatRelativeTime } from '@/lib/utils'

export default function EvalDetailPage() {
  const params = useParams()
  const evalId = params.id as string

  const { data: evalData, isLoading, error, refetch } = useQuery({
    queryKey: ['eval', evalId],
    queryFn: () => apiClient.getEval(evalId),
  })

  // Fetch execution results
  const { data: executionsData, isLoading: loadingExecutions } = useQuery({
    queryKey: ['eval-executions', evalId],
    queryFn: () => apiClient.getEvalExecutions(evalId, { limit: 100 }),
    enabled: !!evalData,
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/evals">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Evals
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading...</div>
      ) : error ? (
        <ErrorState
          title="Failed to load eval"
          message="There was an error loading this eval. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
          showHomeButton={true}
        />
      ) : !evalData ? (
        <div className="text-center py-12 text-muted-foreground">
          Eval not found
        </div>
      ) : (
        <>
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{evalData.name}</h1>
              {evalData.description && (
                <p className="text-muted-foreground">{evalData.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refine
              </Button>
              <ExecuteEvalModal evalId={evalId} agentId={evalData.agent_id}>
                <Button>
                  <Play className="w-4 h-4 mr-2" />
                  Execute
                </Button>
              </ExecuteEvalModal>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4 mb-8">
            <Card className="p-4">
              <div className="text-2xl font-bold mb-1">
                {formatPercentage(evalData.accuracy)}
              </div>
              <div className="text-sm text-muted-foreground">Accuracy</div>
            </Card>
            <Card className="p-4">
              <div className="text-2xl font-bold mb-1">
                {evalData.execution_count}
              </div>
              <div className="text-sm text-muted-foreground">Executions</div>
            </Card>
            <Card className="p-4">
              <div className="text-2xl font-bold text-destructive mb-1">
                {evalData.contradiction_count}
              </div>
              <div className="text-sm text-muted-foreground">Contradictions</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium mb-1 truncate">
                {evalData.model_used}
              </div>
              <div className="text-sm text-muted-foreground">Model</div>
            </Card>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            <Card className="p-6">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-lg font-bold text-success">
                    {evalData.test_results.correct}
                  </div>
                  <div className="text-sm text-muted-foreground">Correct</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-destructive">
                    {evalData.test_results.incorrect}
                  </div>
                  <div className="text-sm text-muted-foreground">Incorrect</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-warning">
                    {evalData.test_results.errors}
                  </div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
                <div>
                  <div className="text-lg font-bold">
                    {evalData.test_results.total}
                  </div>
                  <div className="text-sm text-muted-foreground">Total</div>
                </div>
              </div>
            </Card>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Generated Code</h2>
            <CodeViewer code={evalData.code} language="python" />
          </div>

          {/* Execution Results */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Execution Results</h2>
            {loadingExecutions ? (
              <Card className="p-6">
                <div className="text-center text-muted-foreground">Loading execution results...</div>
              </Card>
            ) : !executionsData?.executions || executionsData.executions.length === 0 ? (
              <Card className="p-6">
                <div className="text-center text-muted-foreground">
                  No execution results yet. Click Execute to run this eval on traces.
                </div>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr className="border-b">
                        <th className="px-4 py-3 text-left text-sm font-medium">Trace ID</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Predicted</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Expected</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Match</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Reason</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Time (ms)</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Executed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {executionsData.executions.map((execution) => {
                        const isContradiction = execution.is_contradiction
                        const hasError = !!execution.error
                        const expectedResult = execution.human_feedback
                          ? execution.human_feedback.rating === 'positive'
                          : null
                        const match = expectedResult !== null
                          ? execution.predicted_result === expectedResult
                          : null

                        return (
                          <tr
                            key={execution.id}
                            className={`border-b hover:bg-accent ${
                              isContradiction ? 'bg-destructive/10' : hasError ? 'bg-warning/10' : ''
                            }`}
                          >
                            <td className="px-4 py-3 text-sm font-mono">
                              <Link
                                href={`/traces/${execution.trace_id}`}
                                className="text-info hover:underline"
                              >
                                {execution.trace_summary?.trace_id?.slice(0, 12) || execution.trace_id.slice(0, 12)}...
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {hasError ? (
                                <span className="text-destructive flex items-center gap-1">
                                  <XCircle className="w-4 h-4" aria-hidden="true" />
                                  Error
                                </span>
                              ) : (
                                <span className={execution.predicted_result ? 'text-success' : 'text-destructive'}>
                                  {execution.predicted_result ? 'Pass' : 'Fail'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {expectedResult === null ? (
                                <span className="text-muted-foreground">-</span>
                              ) : (
                                <span className={expectedResult ? 'text-success' : 'text-destructive'}>
                                  {expectedResult ? 'Pass' : 'Fail'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {hasError ? (
                                <XCircle className="w-5 h-5 text-destructive" aria-hidden="true" />
                              ) : match === null ? (
                                <span className="text-muted-foreground">-</span>
                              ) : match ? (
                                <CheckCircle className="w-5 h-5 text-success" aria-hidden="true" />
                              ) : (
                                <AlertTriangle className="w-5 h-5 text-destructive" aria-hidden="true" />
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm max-w-xs truncate">
                              {hasError ? (
                                <span className="text-destructive" title={execution.error}>
                                  {execution.error}
                                </span>
                              ) : (
                                <span title={execution.predicted_reason}>
                                  {execution.predicted_reason}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {execution.execution_time_ms}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {formatRelativeTime(execution.executed_at)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}
