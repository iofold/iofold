'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import Link from 'next/link'
import { formatRelativeTime, formatPercentage } from '@/lib/utils'
import { Code2 } from 'lucide-react'
import { EvalListSkeleton } from '@/components/skeletons/eval-skeleton'

export default function EvalsPage() {
  const { data, isLoading, error, refetch } = useQuery({
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
        <EvalListSkeleton count={6} />
      ) : error ? (
        <ErrorState
          title="Failed to load evals"
          message="There was an error loading evals. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      ) : data?.evals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Code2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No evals yet</h3>
          <p className="text-muted-foreground text-center mb-6 max-w-sm">
            Create an eval set, add feedback to traces, and generate your first evaluation function.
          </p>
          <Link href="/eval-sets">
            <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
              Go to Eval Sets
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.evals.map((evalItem) => (
            <Link key={evalItem.id} href={`/evals/${evalItem.id}`}>
              <Card interactive className="p-6 group">
                <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors">{evalItem.name}</h3>
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
