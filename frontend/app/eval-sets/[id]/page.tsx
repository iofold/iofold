'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { Sparkles } from 'lucide-react'
import { GenerateEvalModal } from '@/components/modals/generate-eval-modal'
import { EvalSetDetailSkeleton } from '@/components/skeletons/eval-set-skeleton'

export default function EvalSetDetailPage({ params }: { params: { id: string } }) {
  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['eval-sets', params.id],
    queryFn: () => apiClient.getEvalSet(params.id),
  })

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EvalSetDetailSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState
          title="Failed to load eval set"
          message="There was an error loading this eval set. Please try again."
          error={error as Error}
          onRetry={() => refetch()}
          showHomeButton={true}
        />
      </div>
    )
  }

  if (!data) return <div>Eval set not found</div>

  const positiveFeedback = data.stats?.positive_count || 0
  const negativeFeedback = data.stats?.negative_count || 0
  const totalFeedback = positiveFeedback + negativeFeedback + (data.stats?.neutral_count || 0)
  const canGenerate = totalFeedback >= 5 && positiveFeedback >= 1 && negativeFeedback >= 1

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{data.name}</h1>
        {data.description && (
          <p className="text-muted-foreground mt-2">{data.description}</p>
        )}
      </div>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Feedback Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Positive</p>
            <p className="text-2xl font-bold text-green-600">{positiveFeedback}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Neutral</p>
            <p className="text-2xl font-bold">{data.stats?.neutral_count || 0}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Negative</p>
            <p className="text-2xl font-bold text-red-600">{negativeFeedback}</p>
          </div>
        </div>
        <div className="mt-6">
          <Button
            disabled={!canGenerate}
            onClick={() => setGenerateModalOpen(true)}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {canGenerate ? 'Generate Eval' : `Need ${5 - totalFeedback} more feedback`}
          </Button>
          {!canGenerate && totalFeedback >= 5 && (
            <p className="text-sm text-muted-foreground mt-2">
              Need at least 1 positive and 1 negative example
            </p>
          )}
        </div>
      </Card>

      {data.evals && data.evals.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Generated Evals</h2>
          <div className="space-y-4">
            {data.evals.map((evalItem) => (
              <div key={evalItem.id} className="border rounded p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{evalItem.name}</h3>
                    {evalItem.accuracy && (
                      <p className="text-sm text-muted-foreground">
                        Accuracy: {(evalItem.accuracy * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="outline">View</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Generate Eval Modal */}
      <GenerateEvalModal
        open={generateModalOpen}
        onOpenChange={setGenerateModalOpen}
        evalSetId={params.id}
      />
    </div>
  )
}
