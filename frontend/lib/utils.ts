import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(d)
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(d)
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
    case 'active':
    case 'success':
      return 'text-green-600 bg-green-50'
    case 'failed':
    case 'error':
      return 'text-red-600 bg-red-50'
    case 'running':
    case 'in_progress':
      return 'text-blue-600 bg-blue-50'
    case 'queued':
    case 'pending':
      return 'text-yellow-600 bg-yellow-50'
    case 'cancelled':
      return 'text-gray-600 bg-gray-50'
    default:
      return 'text-gray-600 bg-gray-50'
  }
}

export function getRatingColor(rating: 'positive' | 'negative' | 'neutral'): string {
  switch (rating) {
    case 'positive':
      return 'text-green-600 bg-green-50'
    case 'negative':
      return 'text-red-600 bg-red-50'
    case 'neutral':
      return 'text-gray-600 bg-gray-50'
  }
}

export function getRatingEmoji(rating: 'positive' | 'negative' | 'neutral'): string {
  switch (rating) {
    case 'positive':
      return '👍'
    case 'negative':
      return '👎'
    case 'neutral':
      return '😐'
  }
}
