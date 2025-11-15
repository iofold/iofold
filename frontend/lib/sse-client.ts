/**
 * Minimal SSE Client for Job Progress Streaming
 *
 * Wraps the EventSource API with typed event handlers and basic error handling.
 * Falls back to polling if SSE connection fails.
 */

import type { Job } from '@/types/api'

export interface SSEJobUpdate {
  status: Job['status']
  progress?: number
  result?: any
  error?: string
  details?: string
}

export interface SSEClientOptions {
  onProgress?: (update: SSEJobUpdate) => void
  onCompleted?: (result: any) => void
  onFailed?: (error: string, details?: string) => void
  onError?: (error: Event) => void
  onOpen?: () => void
  jobId?: string // Optional: for polling fallback
  apiBaseUrl?: string // Optional: for polling fallback
}

/**
 * Simple SSE client for streaming job updates
 *
 * Usage:
 * ```ts
 * const client = new SSEClient(eventSource, {
 *   onProgress: (update) => console.log('Progress:', update),
 *   onCompleted: (result) => console.log('Done:', result),
 *   onFailed: (error) => console.error('Failed:', error)
 * })
 *
 * // Clean up when done
 * client.close()
 * ```
 */
export class SSEClient {
  private eventSource: EventSource | null
  private options: SSEClientOptions
  private pollingInterval: NodeJS.Timeout | null = null
  private isPolling = false
  private hasReceivedData = false

  constructor(eventSource: EventSource, options: SSEClientOptions = {}) {
    this.eventSource = eventSource
    this.options = options

    this.setupListeners()

    // Start fallback polling after 3 seconds if no data received
    setTimeout(() => {
      if (!this.hasReceivedData && !this.isPolling && this.options.jobId) {
        console.warn('SSE connection timeout, falling back to polling')
        this.fallbackToPolling()
      }
    }, 3000)
  }

  private setupListeners() {
    if (!this.eventSource) return

    // Handle 'progress' events
    this.eventSource.addEventListener('progress', (event: MessageEvent) => {
      try {
        this.hasReceivedData = true
        const data = JSON.parse(event.data)
        this.options.onProgress?.(data)
      } catch (error) {
        console.error('Failed to parse progress event:', error)
      }
    })

    // Handle 'completed' events
    this.eventSource.addEventListener('completed', (event: MessageEvent) => {
      try {
        this.hasReceivedData = true
        const data = JSON.parse(event.data)
        this.options.onCompleted?.(data.result)
        this.close()
      } catch (error) {
        console.error('Failed to parse completed event:', error)
      }
    })

    // Handle 'failed' events
    this.eventSource.addEventListener('failed', (event: MessageEvent) => {
      try {
        this.hasReceivedData = true
        const data = JSON.parse(event.data)
        this.options.onFailed?.(data.error, data.details)
        this.close()
      } catch (error) {
        console.error('Failed to parse failed event:', error)
      }
    })

    // Handle connection opened
    this.eventSource.addEventListener('open', () => {
      this.hasReceivedData = true
      this.options.onOpen?.()
    })

    // Handle connection errors
    this.eventSource.addEventListener('error', (error: Event) => {
      console.error('SSE connection error:', error)
      this.options.onError?.(error)

      // Fall back to polling if we have the necessary info
      if (!this.hasReceivedData && this.options.jobId && !this.isPolling) {
        console.warn('SSE connection failed, falling back to polling')
        this.fallbackToPolling()
      } else {
        this.close()
      }
    })
  }

  /**
   * Fall back to polling if SSE fails
   */
  private fallbackToPolling() {
    if (this.isPolling || !this.options.jobId) return

    console.log('Starting polling fallback for job:', this.options.jobId)
    this.isPolling = true

    // Close EventSource if still open
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    // Start polling every 2 seconds
    this.pollingInterval = setInterval(() => {
      this.pollJobStatus()
    }, 2000)

    // Do first poll immediately
    this.pollJobStatus()
  }

  /**
   * Poll job status via REST API
   */
  private async pollJobStatus() {
    if (!this.options.jobId || !this.options.apiBaseUrl) return

    try {
      const response = await fetch(`${this.options.apiBaseUrl}/api/jobs/${this.options.jobId}`, {
        headers: {
          'X-Workspace-Id': 'workspace_default',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch job status: ${response.statusText}`)
      }

      const job: Job = await response.json()

      // Send progress update
      this.options.onProgress?.({
        status: job.status,
        progress: job.progress,
      })

      // Check if job is done
      if (job.status === 'completed') {
        this.options.onCompleted?.(job.result)
        this.close()
      } else if (job.status === 'failed') {
        this.options.onFailed?.(job.error || 'Job failed', '')
        this.close()
      } else if (job.status === 'cancelled') {
        this.options.onFailed?.('Job cancelled', '')
        this.close()
      }
    } catch (error) {
      console.error('Polling error:', error)
      // Don't close on polling errors, keep trying
    }
  }

  /**
   * Close the SSE connection and stop polling
   */
  close() {
    // Close EventSource
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
      this.eventSource.close()
    }

    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    this.isPolling = false
  }

  /**
   * Check if connection is open
   */
  isOpen(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN || this.isPolling
  }

  /**
   * Get the current ready state
   */
  getReadyState(): number {
    return this.eventSource?.readyState ?? EventSource.CLOSED
  }
}
