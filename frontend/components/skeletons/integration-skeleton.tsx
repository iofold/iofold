import { Skeleton } from '@/components/ui/skeleton'

export function IntegrationSkeleton() {
  return (
    <div className="rounded-lg border bg-white p-6 space-y-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-48" />
    </div>
  )
}

export function IntegrationListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <IntegrationSkeleton key={i} />
      ))}
    </div>
  )
}
