import { Skeleton } from '@/components/ui/skeleton'

export function EvalSetSkeleton() {
  return (
    <div className="rounded-lg border bg-white p-6 space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded" />
        <Skeleton className="h-6 w-20 rounded" />
        <Skeleton className="h-6 w-20 rounded" />
      </div>
      <Skeleton className="h-4 w-32" />
    </div>
  )
}

export function EvalSetListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <EvalSetSkeleton key={i} />
      ))}
    </div>
  )
}

export function EvalSetDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-white p-6 space-y-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-white p-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-24 mt-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
