'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowLeft, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { formatRelativeTime } from '@/lib/utils'

export default function EvalSetDetailPage({ params }: { params: { id: string } }) {
  const { data: evalSet, isLoading } = useQuery({
    queryKey: ['eval-set', params.id],
    queryFn: () => apiClient.getEvalSet(params.id),
  })

  const canGenerate = evalSet && evalSet.stats.total_count >= evalSet.minimum_examples

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/eval-sets">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Eval Sets
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading...</div>
      ) : !evalSet ? (
        <div className="text-center py-12 text-muted-foreground">
          Eval set not found
        </div>
      ) : (
        <>
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{evalSet.name}</h1>
              {evalSet.description && (
                <p className="text-muted-foreground">{evalSet.description}</p>
              )}
            </div>
            <Button disabled={!canGenerate}>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Eval
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <Card className="p-6">
              <div className="text-2xl font-bold text-green-600 mb-1">
                {evalSet.stats.positive_count}
              </div>
              <div className="text-sm text-muted-foreground">Positive Examples</div>
            </Card>
            <Card className="p-6">
              <div className="text-2xl font-bold text-red-600 mb-1">
                {evalSet.stats.negative_count}
              </div>
              <div className="text-sm text-muted-foreground">Negative Examples</div>
            </Card>
            <Card className="p-6">
              <div className="text-2xl font-bold text-gray-600 mb-1">
                {evalSet.stats.neutral_count}
              </div>
              <div className="text-sm text-muted-foreground">Neutral Examples</div>
            </Card>
          </div>

          {!canGenerate && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800">
                Collect at least {evalSet.minimum_examples} examples to generate an eval.
                Currently: {evalSet.stats.total_count}/{evalSet.minimum_examples}
              </p>
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4">Generated Evals</h2>
            {evalSet.evals.length === 0 ? (
              <p className="text-muted-foreground">
                No evals generated yet. Collect feedback and click "Generate Eval" when ready.
              </p>
            ) : (
              <div className="space-y-2">
                {evalSet.evals.map((eval) => (
                  <Link key={eval.id} href={`/evals/${eval.id}`}>
                    <Card className="p-4 hover:bg-accent transition-colors cursor-pointer">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-semibold">{eval.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            Accuracy: {Math.round(eval.accuracy * 100)}%
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatRelativeTime(eval.created_at)}
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
