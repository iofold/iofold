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
  if (!date || (typeof date === 'string' && date.trim() === '')) {
    return 'N/A'
  }
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) {
    return 'N/A'
  }
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
      return 'text-success bg-success/10'
    case 'failed':
    case 'error':
      return 'text-error bg-error/10'
    case 'running':
    case 'in_progress':
      return 'text-primary bg-primary/10'
    case 'queued':
    case 'pending':
      return 'text-warning bg-warning/10'
    case 'cancelled':
      return 'text-muted-foreground bg-muted'
    default:
      return 'text-muted-foreground bg-muted'
  }
}

export function getRatingColor(rating: 'positive' | 'negative' | 'neutral'): string {
  switch (rating) {
    case 'positive':
      return 'text-success bg-success/10'
    case 'negative':
      return 'text-error bg-error/10'
    case 'neutral':
      return 'text-muted-foreground bg-muted'
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
