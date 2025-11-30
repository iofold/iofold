'use client'

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function TraceRowSkeleton() {
  return (
    <tr className="border-b">
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-4 rounded" /> {/* checkbox */}
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-4 rounded" /> {/* expand icon */}
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-32" /> {/* timestamp */}
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-6 w-40 rounded" /> {/* trace ID */}
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-48" /> {/* input preview */}
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-6 w-24 rounded-full" /> {/* status badge */}
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-8" /> {/* step count */}
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-16 rounded" /> {/* source */}
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-16 rounded" /> {/* feedback */}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Skeleton className="h-6 w-6 rounded" /> {/* action button */}
          <Skeleton className="h-6 w-6 rounded" /> {/* action button */}
        </div>
      </td>
    </tr>
  )
}

export function TracesTableSkeleton({ count = 10 }: { count?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="w-10 px-4 py-3 text-left">
                <Skeleton className="h-4 w-4 rounded" />
              </th>
              <th className="w-10 px-4 py-3"></th>
              <th className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-20" />
              </th>
              <th className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-16" />
              </th>
              <th className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-24" />
              </th>
              <th className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-12" />
              </th>
              <th className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-10" />
              </th>
              <th className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-12" />
              </th>
              <th className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-16" />
              </th>
              <th className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-14" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...Array(count)].map((_, i) => (
              <TraceRowSkeleton key={i} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
