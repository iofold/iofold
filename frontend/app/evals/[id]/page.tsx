'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { CodeViewer } from '@/components/code-viewer'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowLeft, Play, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { formatPercentage } from '@/lib/utils'

export default function EvalDetailPage({ params }: { params: { id: string } }) {
  const { data: evalData, isLoading } = useQuery({
    queryKey: ['eval', params.id],
    queryFn: () => apiClient.getEval(params.id),
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
              <Button>
                <Play className="w-4 h-4 mr-2" />
                Execute
              </Button>
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
              <div className="text-2xl font-bold text-red-600 mb-1">
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
                  <div className="text-lg font-bold text-green-600">
                    {evalData.test_results.correct}
                  </div>
                  <div className="text-sm text-muted-foreground">Correct</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-red-600">
                    {evalData.test_results.incorrect}
                  </div>
                  <div className="text-sm text-muted-foreground">Incorrect</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-yellow-600">
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

          <div>
            <h2 className="text-xl font-semibold mb-4">Generated Code</h2>
            <CodeViewer code={evalData.code} language="python" />
          </div>
        </>
      )}
    </div>
  )
}
