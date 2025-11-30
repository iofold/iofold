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
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className="text-sm text-gray-500">{Math.round(clampedValue)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${Math.round(clampedValue)}% complete`}
        className="w-full h-3 bg-gray-200 rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-300"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  )
}
