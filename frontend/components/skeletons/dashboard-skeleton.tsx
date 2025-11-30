'use client'

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function KPICardSkeleton() {
  return (
    <Card className="p-6 shadow-elevation-1">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          {/* Icon skeleton */}
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-2">
            {/* Title skeleton */}
            <Skeleton className="h-3.5 w-24" />
            {/* Value skeleton */}
            <Skeleton className="h-7 w-16" />
          </div>
        </div>
        {/* Sparkline skeleton */}
        <Skeleton className="w-16 h-8 rounded" />
      </div>
      {/* Change indicator skeleton */}
      <div className="flex items-center space-x-1">
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-24" />
      </div>
    </Card>
  )
}

export function ChartSkeleton() {
  return (
    <Card className="p-6 h-full">
      <div className="mb-4">
        <Skeleton className="h-5 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-[350px] w-full rounded-lg" />
    </Card>
  )
}

export function ActivityFeedSkeleton() {
  return (
    <Card className="p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Skeleton className="h-5 w-28 mb-1" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-8 w-8 rounded" />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-md" />
        ))}
      </div>

      {/* Activity Items */}
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-3 rounded-lg border border-border">
            <div className="flex items-start gap-3">
              <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded" />
                </div>
                <Skeleton className="h-3 w-full" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="w-4 h-4 rounded flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>

      {/* View All Button */}
      <div className="mt-4 pt-4 border-t border-border">
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </Card>
  )
}

export function StatsCardSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="w-4 h-4 rounded" />
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </Card>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartSkeleton />
        </div>
        <div className="lg:col-span-1">
          <ActivityFeedSkeleton />
        </div>
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCardSkeleton />
        <StatsCardSkeleton />
        <StatsCardSkeleton />
      </div>
    </div>
  )
}
