import * as React from 'react'

interface ProgressProps {
  value: number // 0-100
  className?: string
  showLabel?: boolean
  label?: string // Descriptive label for the progress bar
}

export function Progress({ value, className = '', showLabel = false, label = 'Progress' }: ProgressProps) {
  const clampedValue = Math.min(Math.max(value, 0), 100)

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-sm text-muted-foreground">{Math.round(clampedValue)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${Math.round(clampedValue)}% complete`}
        className="w-full h-3 bg-muted rounded-full overflow-hidden"
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${clampedValue}%`,
            background: 'linear-gradient(to right, hsl(var(--success)), hsl(var(--info)))'
          }}
        />
      </div>
    </div>
  )
}
