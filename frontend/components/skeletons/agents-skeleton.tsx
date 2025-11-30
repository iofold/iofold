'use client'

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function AgentCardSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="h-6 w-32" /> {/* title */}
        <Skeleton className="h-5 w-20 rounded-full" /> {/* status badge */}
      </div>

      <div className="mb-4 space-y-2">
        <Skeleton className="h-4 w-full" /> {/* description line 1 */}
        <Skeleton className="h-4 w-3/4" /> {/* description line 2 */}
      </div>

      <div className="mb-4 space-y-1">
        <Skeleton className="h-4 w-40" /> {/* active version */}
        <Skeleton className="h-4 w-32" /> {/* accuracy */}
      </div>

      <Skeleton className="h-3 w-28" /> {/* updated at */}
    </Card>
  )
}

export function AgentsGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(count)].map((_, i) => (
        <AgentCardSkeleton key={i} />
      ))}
    </div>
  )
}
