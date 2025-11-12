'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { TraceCard } from '@/components/trace-card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

export default function TracesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['traces'],
    queryFn: () => apiClient.listTraces({ limit: 50 }),
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Traces</h1>
          <p className="text-muted-foreground">
            Browse and annotate imported traces
          </p>
        </div>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Import Traces
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading traces...</div>
      ) : data?.traces.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No traces found. Import traces from your integrations to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {data?.traces.map((trace) => (
            <TraceCard key={trace.id} trace={trace} />
          ))}
        </div>
      )}
    </div>
  )
}
