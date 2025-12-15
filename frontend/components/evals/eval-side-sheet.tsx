'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { CodeViewer } from '@/components/code-viewer'
import { ExecuteEvalModal } from '@/components/modals/execute-eval-modal'
import {
  Play,
  FlaskConical,
  Grid3X3,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { formatPercentage, formatRelativeTime, cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Eval, EvalSummary } from '@/types/api'

interface EvalSideSheetProps {
  evalItem: EvalSummary | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete?: (id: string) => void
}

export function EvalSideSheet({
  evalItem,
  open,
  onOpenChange,
  onDelete,
}: EvalSideSheetProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'executions'>('details')

  // Fetch full eval details (including code) when sheet is open
  const { data: evalDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ['eval-details', evalItem?.id],
    queryFn: () => apiClient.getEval(evalItem!.id),
    enabled: open && !!evalItem,
  })

  // Fetch executions when tab is active
  const { data: executionsData, isLoading: loadingExecutions } = useQuery({
    queryKey: ['eval-executions', evalItem?.id],
    queryFn: () => apiClient.getEvalExecutions(evalItem!.id, { limit: 20 }),
    enabled: open && !!evalItem && activeTab === 'executions',
  })

  if (!evalItem) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">{evalItem.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <Badge variant="outline">{evalItem.agent_id.replace('agent_', '')}</Badge>
            <span className="text-muted-foreground">
              Created {formatRelativeTime(evalItem.created_at)}
            </span>
          </SheetDescription>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex gap-1 mt-6 border-b">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'details'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('executions')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'executions'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Executions
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {activeTab === 'details' ? (
            <>
              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3 text-center">
                  <div
                    className={cn(
                      'text-xl font-bold',
                      evalItem.accuracy >= 0.8
                        ? 'text-green-600'
                        : evalItem.accuracy >= 0.6
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    )}
                  >
                    {formatPercentage(evalItem.accuracy)}
                  </div>
                  <div className="text-xs text-muted-foreground">Accuracy</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-xl font-bold">{evalItem.execution_count}</div>
                  <div className="text-xs text-muted-foreground">Executions</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-xl font-bold text-red-600">
                    {evalItem.contradiction_count}
                  </div>
                  <div className="text-xs text-muted-foreground">Contradictions</div>
                </Card>
              </div>

              {/* Advanced Metrics */}
              {(evalItem.cohen_kappa !== null && evalItem.cohen_kappa !== undefined) ||
               (evalItem.f1_score !== null && evalItem.f1_score !== undefined) ? (
                <div className="grid grid-cols-2 gap-3">
                  {evalItem.cohen_kappa !== null && evalItem.cohen_kappa !== undefined && (
                    <Card className="p-3 text-center">
                      <div
                        className={cn(
                          'text-xl font-bold',
                          evalItem.cohen_kappa >= 0.6
                            ? 'text-green-600'
                            : evalItem.cohen_kappa >= 0.4
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        )}
                      >
                        {evalItem.cohen_kappa.toFixed(3)}
                      </div>
                      <div className="text-xs text-muted-foreground">Cohen&apos;s Kappa</div>
                    </Card>
                  )}
                  {evalItem.f1_score !== null && evalItem.f1_score !== undefined && (
                    <Card className="p-3 text-center">
                      <div
                        className={cn(
                          'text-xl font-bold',
                          evalItem.f1_score >= 0.8
                            ? 'text-green-600'
                            : evalItem.f1_score >= 0.6
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        )}
                      >
                        {formatPercentage(evalItem.f1_score)}
                      </div>
                      <div className="text-xs text-muted-foreground">F1 Score</div>
                    </Card>
                  )}
                  {evalItem.precision !== null && evalItem.precision !== undefined && (
                    <Card className="p-3 text-center">
                      <div className="text-xl font-bold">
                        {formatPercentage(evalItem.precision)}
                      </div>
                      <div className="text-xs text-muted-foreground">Precision</div>
                    </Card>
                  )}
                  {evalItem.recall !== null && evalItem.recall !== undefined && (
                    <Card className="p-3 text-center">
                      <div className="text-xl font-bold">
                        {formatPercentage(evalItem.recall)}
                      </div>
                      <div className="text-xs text-muted-foreground">Recall</div>
                    </Card>
                  )}
                </div>
              ) : null}

              {/* Description */}
              {evalItem.description && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Description</h4>
                  <p className="text-sm text-muted-foreground">{evalItem.description}</p>
                </div>
              )}

              {/* Code Preview */}
              <div>
                <h4 className="text-sm font-medium mb-2">Eval Code</h4>
                <div className="max-h-[300px] overflow-auto rounded border">
                  {loadingDetails ? (
                    <div className="p-4 flex items-center justify-center text-muted-foreground">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading code...
                    </div>
                  ) : evalDetails?.code ? (
                    <CodeViewer code={evalDetails.code} language="python" />
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      No code available
                    </div>
                  )}
                </div>
              </div>

              {/* Model Used */}
              {evalDetails?.model_used && (
                <div className="text-sm text-muted-foreground">
                  Model: {evalDetails.model_used}
                </div>
              )}
            </>
          ) : (
            <>
              {loadingExecutions ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading executions...
                </div>
              ) : !executionsData?.executions?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  No executions yet. Run the eval to see results.
                </div>
              ) : (
                <div className="space-y-2">
                  {executionsData.executions.map((exec: any) => (
                    <Card
                      key={exec.id}
                      className={cn(
                        'p-3',
                        exec.is_contradiction && 'border-red-200 bg-red-50/50'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {exec.error ? (
                            <AlertTriangle className="w-4 h-4 text-yellow-600" />
                          ) : exec.predicted_result ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                          <Link
                            href={`/traces/${exec.trace_id}`}
                            className="text-sm font-mono hover:underline"
                          >
                            {exec.trace_id.slice(0, 12)}...
                          </Link>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {exec.execution_time_ms}ms
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {exec.predicted_reason}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 pt-4 border-t space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/evals/${evalItem.id}/playground`}>
              <Button variant="outline" className="w-full">
                <FlaskConical className="w-4 h-4 mr-2" />
                Playground
              </Button>
            </Link>
            <Link href={`/matrix/${evalItem.agent_id}?eval_ids=${evalItem.id}`}>
              <Button variant="outline" className="w-full">
                <Grid3X3 className="w-4 h-4 mr-2" />
                Matrix
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ExecuteEvalModal evalId={evalItem.id} agentId={evalItem.agent_id}>
              <Button className="w-full">
                <Play className="w-4 h-4 mr-2" />
                Execute
              </Button>
            </ExecuteEvalModal>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                if (confirm('Are you sure you want to delete this eval?')) {
                  onDelete?.(evalItem.id)
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
