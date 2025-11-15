'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { formatRelativeTime, formatPercentage } from '@/lib/utils'

export default function EvalsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['evals'],
    queryFn: () => apiClient.listEvals({ limit: 50 }),
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Evals</h1>
        <p className="text-muted-foreground">
          View and manage generated eval functions
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading...</div>
      ) : data?.evals.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No evals found. Create an eval set and generate your first eval.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.evals.map((evalItem) => (
            <Link key={evalItem.id} href={`/evals/${evalItem.id}`}>
              <Card className="p-6 hover:bg-accent transition-colors cursor-pointer">
                <h3 className="font-semibold mb-2">{evalItem.name}</h3>
                {evalItem.description && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {evalItem.description}
                  </p>
                )}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Accuracy</span>
                    <span className="font-medium">{formatPercentage(evalItem.accuracy)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Executions</span>
                    <span className="font-medium">{evalItem.execution_count}</span>
                  </div>
                  {evalItem.contradiction_count > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Contradictions</span>
                      <span className="font-medium text-red-600">
                        {evalItem.contradiction_count}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Updated {formatRelativeTime(evalItem.updated_at)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
