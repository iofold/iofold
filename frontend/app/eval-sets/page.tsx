'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { formatRelativeTime } from '@/lib/utils'
import { EvalSetListSkeleton } from '@/components/skeletons/eval-set-skeleton'
import { CreateEvalSetModal } from '@/components/modals/create-eval-set-modal'

export default function EvalSetsPage() {
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['eval-sets'],
    queryFn: () => apiClient.listEvalSets(),
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Eval Sets</h1>
          <p className="text-muted-foreground">
            Organize feedback collections for generating evals
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Eval Set
        </Button>
      </div>

      {isLoading ? (
        <EvalSetListSkeleton count={6} />
      ) : error ? (
        <ErrorState
          title="Failed to load eval sets"
          message="There was an error loading eval sets. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.eval_sets.map((evalSet) => (
            <Link key={evalSet.id} href={`/eval-sets/${evalSet.id}`}>
              <Card className="p-6 hover:bg-accent transition-colors cursor-pointer">
                <h3 className="font-semibold mb-2">{evalSet.name}</h3>
                {evalSet.description && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {evalSet.description}
                  </p>
                )}
                <div className="flex gap-2 mb-4">
                  <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">
                    {evalSet.stats.positive_count} positive
                  </span>
                  <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">
                    {evalSet.stats.negative_count} negative
                  </span>
                  <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                    {evalSet.stats.neutral_count} neutral
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Updated {formatRelativeTime(evalSet.updated_at)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateEvalSetModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
    </div>
  )
}
