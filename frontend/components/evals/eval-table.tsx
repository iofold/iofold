'use client'

import { formatPercentage, formatRelativeTime, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { Eval } from '@/types/api'

interface EvalTableProps {
  evals: Eval[]
  selectedId: string | null
  onSelect: (evalItem: Eval) => void
  isLoading?: boolean
}

export function EvalTable({ evals, selectedId, onSelect, isLoading }: EvalTableProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded" />
        ))}
      </div>
    )
  }

  if (evals.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No evals found. Generate an eval from an agent to get started.
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium">Name</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Agent</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Accuracy</th>
            <th className="text-right px-4 py-3 text-sm font-medium" title="Cohen's Kappa: Agreement accounting for chance">Kappa</th>
            <th className="text-right px-4 py-3 text-sm font-medium" title="F1 Score: Harmonic mean of precision and recall">F1</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Executions</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Contradictions</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Last Run</th>
          </tr>
        </thead>
        <tbody>
          {evals.map((evalItem) => (
            <tr
              key={evalItem.id}
              onClick={() => onSelect(evalItem)}
              className={cn(
                'border-t cursor-pointer transition-colors',
                selectedId === evalItem.id
                  ? 'bg-accent'
                  : 'hover:bg-muted/50'
              )}
            >
              <td className="px-4 py-3">
                <span className="font-medium">{evalItem.name}</span>
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className="text-xs">
                  {evalItem.agent_id.replace('agent_', '')}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={cn(
                    'font-medium',
                    evalItem.accuracy >= 0.8
                      ? 'text-green-600'
                      : evalItem.accuracy >= 0.6
                      ? 'text-yellow-600'
                      : 'text-red-600'
                  )}
                >
                  {formatPercentage(evalItem.accuracy)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {evalItem.cohen_kappa !== null && evalItem.cohen_kappa !== undefined ? (
                  <span
                    className={cn(
                      'font-medium text-sm',
                      evalItem.cohen_kappa >= 0.6
                        ? 'text-green-600'
                        : evalItem.cohen_kappa >= 0.4
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    )}
                  >
                    {evalItem.cohen_kappa.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {evalItem.f1_score !== null && evalItem.f1_score !== undefined ? (
                  <span
                    className={cn(
                      'font-medium text-sm',
                      evalItem.f1_score >= 0.8
                        ? 'text-green-600'
                        : evalItem.f1_score >= 0.6
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    )}
                  >
                    {formatPercentage(evalItem.f1_score)}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground">
                {evalItem.execution_count}
              </td>
              <td className="px-4 py-3 text-right">
                {evalItem.contradiction_count > 0 ? (
                  <span className="text-red-600 font-medium">
                    {evalItem.contradiction_count}
                  </span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground text-sm">
                {formatRelativeTime(evalItem.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
