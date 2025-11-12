'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { MatrixTable } from '@/components/matrix-table'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function MatrixPage({ params }: { params: { eval_set_id: string } }) {
  const [selectedEvalIds, setSelectedEvalIds] = useState<string[]>([])
  const [filter, setFilter] = useState<'all' | 'contradictions_only' | 'errors_only'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['matrix', params.eval_set_id, selectedEvalIds.join(','), filter],
    queryFn: () => {
      if (selectedEvalIds.length === 0) return null
      return apiClient.getMatrix(params.eval_set_id, {
        eval_ids: selectedEvalIds.join(','),
        filter,
        limit: 50,
      })
    },
    enabled: selectedEvalIds.length > 0,
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href={`/eval-sets/${params.eval_set_id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Eval Set
          </Button>
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Comparison Matrix</h1>
        <p className="text-muted-foreground">
          Compare eval predictions with human feedback
        </p>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            variant={filter === 'contradictions_only' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('contradictions_only')}
          >
            Contradictions Only
          </Button>
          <Button
            variant={filter === 'errors_only' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('errors_only')}
          >
            Errors Only
          </Button>
        </div>
      </div>

      {selectedEvalIds.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Select evals to compare
        </div>
      ) : isLoading ? (
        <div className="text-center py-12">Loading matrix...</div>
      ) : !data ? (
        <div className="text-center py-12 text-muted-foreground">
          No data available
        </div>
      ) : (
        <MatrixTable data={data} />
      )}
    </div>
  )
}
