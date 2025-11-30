/**
 * Custom React hook for monitoring job status via SSE with polling fallback
 *
 * This hook manages the lifecycle of job monitoring:
 * 1. Attempts to establish SSE connection for real-time updates
 * 2. Falls back to polling if SSE fails or is not supported
 * 3. Automatically cleans up connections on unmount
 * 4. Provides type-safe job status updates
 *
 * Usage:
 * ```tsx
 * const { job, isStreaming, error } = useJobMonitor(jobId, {
 *   onCompleted: (result) => console.log('Done!', result),
 *   onFailed: (error) => console.error('Failed:', error)
 * })
 * ```
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { SSEClient, type SSEJobUpdate } from '@/lib/sse-client'
import type { Job } from '@/types/api'

export interface UseJobMonitorOptions {
  /**
   * Called on every progress update (both SSE and polling)
   */
  onProgress?: (update: SSEJobUpdate) => void

  /**
   * Called when job completes successfully
   */
  onCompleted?: (result: any) => void

  /**
   * Called when job fails
   */
  onFailed?: (error: string, details?: string) => void

  /**
   * Called on SSE connection errors (before falling back to polling)
   */
  onError?: (error: Event) => void

  /**
   * Called when SSE connection is successfully established
   */
  onOpen?: () => void

  /**
   * Whether to automatically start monitoring (default: true)
   */
  autoStart?: boolean

  /**
   * Custom API base URL (default: from env or localhost:8787/v1)
   */
  apiBaseUrl?: string
}

/**
 * Store callbacks in refs to avoid recreating start/stop functions
 * when callbacks change. This prevents the infinite loop caused by
 * useEffect re-running when callbacks are not memoized by the parent.
 */
interface CallbackRefs {
  onProgress?: (update: SSEJobUpdate) => void
  onCompleted?: (result: any) => void
  onFailed?: (error: string, details?: string) => void
  onError?: (error: Event) => void
  onOpen?: () => void
}

export interface UseJobMonitorReturn {
  /**
   * Current job state
   */
  job: Job | null

  /**
   * Whether actively streaming via SSE or polling
   */
  isStreaming: boolean

  /**
   * Whether using polling fallback
   */
  isPolling: boolean

  /**
   * Whether SSE connection is active
   */
  isSSEActive: boolean

  /**
   * Error message if connection failed
   */
  error: string | null

  /**
   * Manually start monitoring (if autoStart was false)
   */
  start: () => void

  /**
   * Stop monitoring and clean up connections
   */
  stop: () => void

  /**
   * Restart monitoring (stops and starts again)
   */
  restart: () => void
}

/**
 * Hook for monitoring job progress with SSE + polling fallback
 */
export function useJobMonitor(
  jobId: string | null,
  options: UseJobMonitorOptions = {}
): UseJobMonitorReturn {
  const {
    onProgress,
    onCompleted,
    onFailed,
    onError,
    onOpen,
    autoStart = true,
    apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/v1',
  } = options

  const [job, setJob] = useState<Job | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [isSSEActive, setIsSSEActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sseClientRef = useRef<SSEClient | null>(null)
  const isMonitoringRef = useRef(false)

  // Store callbacks in refs to prevent start/stop from being recreated
  // when callbacks change (which would cause infinite useEffect loops)
  const callbacksRef = useRef<CallbackRefs>({})
  callbacksRef.current = { onProgress, onCompleted, onFailed, onError, onOpen }

  /**
   * Stop monitoring and clean up
   */
  const stop = useCallback(() => {
    if (sseClientRef.current) {
      sseClientRef.current.close()
      sseClientRef.current = null
    }
    setIsStreaming(false)
    setIsPolling(false)
    setIsSSEActive(false)
    isMonitoringRef.current = false
  }, [])

  /**
   * Start monitoring via SSE with polling fallback
   */
  const start = useCallback(() => {
    if (!jobId || isMonitoringRef.current) return

    console.log('[useJobMonitor] Starting monitoring for job:', jobId)
    isMonitoringRef.current = true
    setIsStreaming(true)
    setError(null)

    try {
      // Create EventSource for SSE connection
      const eventSource = apiClient.streamJob(jobId)

      // Create SSE client with callbacks (using refs to avoid recreating on callback changes)
      const client = new SSEClient(eventSource, {
        jobId,
        apiBaseUrl,
        onProgress: (update) => {
          setIsSSEActive(true)
          setIsPolling(false)
          setJob((prev) => (prev ? { ...prev, ...update } : null))
          callbacksRef.current.onProgress?.(update)
        },
        onCompleted: (result) => {
          setJob((prev) => (prev ? { ...prev, status: 'completed', result } : null))
          setIsStreaming(false)
          setIsSSEActive(false)
          callbacksRef.current.onCompleted?.(result)
        },
        onFailed: (errorMsg, details) => {
          setJob((prev) => (prev ? { ...prev, status: 'failed', error: errorMsg } : null))
          setIsStreaming(false)
          setIsSSEActive(false)
          setError(errorMsg)
          callbacksRef.current.onFailed?.(errorMsg, details)
        },
        onError: (err) => {
          console.warn('[useJobMonitor] SSE connection error, may fall back to polling')
          setIsSSEActive(false)
          setIsPolling(true)
          callbacksRef.current.onError?.(err)
        },
        onOpen: () => {
          console.log('[useJobMonitor] SSE connection established')
          setIsSSEActive(true)
          setIsPolling(false)
          callbacksRef.current.onOpen?.()
        },
      })

      sseClientRef.current = client

      // Check if client fell back to polling
      setTimeout(() => {
        if (client.isOpen() && !isSSEActive) {
          setIsPolling(true)
        }
      }, 3500)
    } catch (err) {
      console.error('[useJobMonitor] Failed to start monitoring:', err)
      setError(err instanceof Error ? err.message : 'Failed to start monitoring')
      setIsStreaming(false)
      isMonitoringRef.current = false
    }
  }, [jobId, apiBaseUrl]) // Removed callback dependencies - using refs instead

  /**
   * Restart monitoring
   */
  const restart = useCallback(() => {
    stop()
    setTimeout(() => start(), 100)
  }, [stop, start])

  // Auto-start monitoring when jobId is provided
  useEffect(() => {
    if (jobId && autoStart && !isMonitoringRef.current) {
      start()
    }

    return () => {
      stop()
    }
  }, [jobId, autoStart, start, stop])

  return {
    job,
    isStreaming,
    isPolling,
    isSSEActive,
    error,
    start,
    stop,
    restart,
  }
}
