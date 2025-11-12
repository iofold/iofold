'use client'

import { Card } from '@/components/ui/card'
import { MatrixResponse } from '@/types/api'
import { getRatingEmoji, truncate } from '@/lib/utils'
import { Check, X, AlertCircle } from 'lucide-react'

interface MatrixTableProps {
  data: MatrixResponse
}

export function MatrixTable({ data }: MatrixTableProps) {
  const evalIds = Object.keys(data.stats.per_eval)

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Statistics</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold">{data.stats.total_traces}</div>
            <div className="text-sm text-muted-foreground">Total Traces</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{data.stats.traces_with_feedback}</div>
            <div className="text-sm text-muted-foreground">With Feedback</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">
              {Object.values(data.stats.per_eval).reduce(
                (sum, stat) => sum + stat.contradiction_count,
                0
              )}
            </div>
            <div className="text-sm text-muted-foreground">Total Contradictions</div>
          </div>
        </div>
      </Card>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-semibold">Trace</th>
              <th className="text-left p-3 font-semibold">Human</th>
              {evalIds.map((evalId) => (
                <th key={evalId} className="text-left p-3 font-semibold">
                  {data.stats.per_eval[evalId].eval_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.trace_id} className="border-b hover:bg-accent">
                <td className="p-3">
                  <div className="max-w-xs">
                    <div className="text-sm font-mono text-muted-foreground mb-1">
                      {row.trace_id.slice(0, 8)}
                    </div>
                    <div className="text-sm">
                      {truncate(row.trace_summary.input_preview, 50)}
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  {row.human_feedback ? (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">
                        {getRatingEmoji(row.human_feedback.rating)}
                      </span>
                      <span className="text-sm capitalize">
                        {row.human_feedback.rating}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </td>
                {evalIds.map((evalId) => {
                  const prediction = row.predictions[evalId]
                  if (!prediction) {
                    return (
                      <td key={evalId} className="p-3">
                        <span className="text-sm text-muted-foreground">-</span>
                      </td>
                    )
                  }

                  return (
                    <td key={evalId} className="p-3">
                      <div className="flex items-center gap-2">
                        {prediction.error ? (
                          <AlertCircle className="w-5 h-5 text-yellow-600" />
                        ) : prediction.result ? (
                          <Check className="w-5 h-5 text-green-600" />
                        ) : (
                          <X className="w-5 h-5 text-red-600" />
                        )}
                        <div>
                          <div className="text-sm">
                            {prediction.error ? 'Error' : prediction.result ? 'Pass' : 'Fail'}
                          </div>
                          {prediction.is_contradiction && (
                            <div className="text-xs text-red-600 font-medium">
                              Contradiction
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.has_more && (
        <div className="text-center py-4">
          <button className="text-sm text-primary hover:underline">
            Load more traces
          </button>
        </div>
      )}
    </div>
  )
}
