'use client'

import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export function KPICardSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <Skeleton className="h-4 w-24 mb-2" /> {/* title */}
          <Skeleton className="h-8 w-20 mb-2" /> {/* value */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-12" /> {/* trend */}
            <Skeleton className="h-3 w-20" /> {/* vs baseline */}
          </div>
        </div>
        <Skeleton className="h-10 w-10 rounded-lg" /> {/* icon */}
      </div>
      <Skeleton className="h-12 w-full mb-3" /> {/* sparkline */}
    </Card>
  )
}

export function EvalsResultsSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <Skeleton className="h-10 w-64 mb-2" /> {/* title */}
              <Skeleton className="h-5 w-96" /> {/* description */}
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-32" /> {/* button */}
              <Skeleton className="h-9 w-24" /> {/* button */}
              <Skeleton className="h-9 w-28" /> {/* button */}
              <Skeleton className="h-9 w-32" /> {/* button */}
            </div>
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-2" /> {/* label */}
              <Skeleton className="h-10 w-full rounded-lg" /> {/* select */}
            </div>
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-2" /> {/* label */}
              <Skeleton className="h-10 w-full rounded-lg" /> {/* select */}
            </div>
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-2" /> {/* label */}
              <Skeleton className="h-10 w-full rounded-lg" /> {/* select */}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <KPICardSkeleton key={i} />
          ))}
        </div>

        {/* Main Content: Chart and Score Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <Skeleton className="h-6 w-48 mb-2" /> {/* title */}
              <Skeleton className="h-4 w-64 mb-6" /> {/* subtitle */}
              <Skeleton className="h-80 w-full" /> {/* chart */}
            </Card>
          </div>

          {/* Score Distribution */}
          <div className="lg:col-span-1">
            <Card className="p-6 h-full">
              <Skeleton className="h-6 w-40 mb-2" /> {/* title */}
              <Skeleton className="h-4 w-56 mb-6" /> {/* description */}
              <Skeleton className="h-64 w-full mb-6 rounded-full" /> {/* pie chart */}

              {/* Legend */}
              <div className="space-y-3">
                <div className="border-t border-[var(--color-border)] pt-4">
                  <Skeleton className="h-4 w-32 mb-3" /> {/* label */}
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-3 w-3 rounded-full" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <Skeleton className="h-3 w-12" />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
