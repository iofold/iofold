'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Taskset Run Details Page - Redirects to Job Details
 *
 * This page redirects to the job details page (/resources/[jobId])
 * since the runId is actually the jobId and the job details page
 * already shows all the information about the taskset run including
 * logs, results, and status.
 */
export default function RunDetailPage() {
  const params = useParams()
  const router = useRouter()
  const runId = params.runId as string

  useEffect(() => {
    // runId is actually the jobId, redirect to job details page
    router.replace(`/resources/${runId}`)
  }, [runId, router])

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting to job details...</p>
        </div>
      </div>
    </div>
  )
}
