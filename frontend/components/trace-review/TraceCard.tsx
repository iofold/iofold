'use client'

/**
 * TraceCard Component
 *
 * Main card component for trace review with:
 * - Swipe gestures (desktop: drag, mobile: touch)
 * - Keyboard shortcuts (1/2/3, arrows, space, E)
 * - Expandable details
 * - Smooth animations
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, PanInfo, useMotionValue, useTransform } from 'framer-motion'
import { ParsedTrace } from '@/types/trace'
import { TraceHeader } from './TraceHeader'
import { MessageDisplay } from './MessageDisplay'
import { ToolCallsList } from './ToolCallsList'
import { ActionBar } from './ActionBar'
import { PreviousSteps } from './PreviousSteps'

interface TraceCardProps {
  trace: ParsedTrace
  onFeedback: (rating: 'positive' | 'neutral' | 'negative') => void
  onNext?: () => void
  onPrevious?: () => void
  onSkip?: () => void
}

export function TraceCard({
  trace,
  onFeedback,
  onNext,
  onPrevious,
  onSkip,
}: TraceCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Motion values for drag animation
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // Transform motion values to rotation and opacity
  const rotateZ = useTransform(x, [-200, 0, 200], [-15, 0, 15])
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5])

  // Box shadow colors based on drag direction
  const boxShadow = useTransform(x, (value) => {
    if (value > 100) {
      // Right swipe - positive (green)
      return '0 0 30px rgba(34, 197, 94, 0.5)'
    } else if (value < -100) {
      // Left swipe - negative (red)
      return '0 0 30px rgba(239, 68, 68, 0.5)'
    }
    return '0 4px 6px rgba(0, 0, 0, 0.1)'
  })

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      setIsDragging(false)

      const swipeThreshold = 100
      const swipeVelocityThreshold = 500

      // Check horizontal swipe
      if (
        Math.abs(info.offset.x) > swipeThreshold ||
        Math.abs(info.velocity.x) > swipeVelocityThreshold
      ) {
        if (info.offset.x > 0) {
          // Right swipe - positive
          onFeedback('positive')
        } else {
          // Left swipe - negative
          onFeedback('negative')
        }
        return
      }

      // Check vertical swipe (down only)
      if (
        info.offset.y > swipeThreshold ||
        info.velocity.y > swipeVelocityThreshold
      ) {
        // Down swipe - neutral
        onFeedback('neutral')
        return
      }

      // Reset position if no action taken
      x.set(0)
      y.set(0)
    },
    [onFeedback, x, y]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      switch (e.key) {
        case '1':
          e.preventDefault()
          onFeedback('positive')
          break
        case '2':
          e.preventDefault()
          onFeedback('neutral')
          break
        case '3':
          e.preventDefault()
          onFeedback('negative')
          break
        case ' ':
          e.preventDefault()
          if (onSkip) {
            onSkip()
          } else if (onNext) {
            onNext()
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (onNext) {
            onNext()
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (onPrevious) {
            onPrevious()
          }
          break
        case 'e':
        case 'E':
          e.preventDefault()
          setExpanded((prev) => !prev)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [onFeedback, onNext, onPrevious, onSkip])

  // Handle expand button in message display
  const handleExpand = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  return (
    <motion.div
      ref={cardRef}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      style={{
        x,
        y,
        rotateZ,
        opacity,
        boxShadow,
      }}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`bg-white rounded-lg overflow-hidden w-full max-w-2xl mx-auto ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      role="region"
      aria-label="Trace review card"
      aria-describedby="trace-instructions"
    >
      {/* Screen reader instructions */}
      <div id="trace-instructions" className="sr-only">
        Press 1 for positive, 2 for neutral, 3 for negative feedback. Use arrow
        keys to navigate between traces. Press E to expand details.
      </div>

      {/* Header */}
      <TraceHeader header={trace.header} />

      {/* Main Content */}
      <div className="max-h-[60vh] overflow-y-auto">
        <MessageDisplay
          lastExchange={trace.lastExchange}
          onExpand={handleExpand}
        />

        <ToolCallsList toolCalls={trace.toolCalls} />

        {/* Expand/Collapse Button */}
        {trace.previousSteps && trace.previousSteps.length > 2 && (
          <div className="px-4 pb-3">
            <button
              onClick={handleExpand}
              className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded border border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
              aria-label={
                expanded ? 'Collapse previous messages' : 'Expand previous messages'
              }
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <span role="img" aria-hidden="true">▲</span> Hide Previous Messages
                </>
              ) : (
                <>
                  <span role="img" aria-hidden="true">▼</span> Show{' '}
                  {trace.previousSteps.length - 2} Previous Messages
                </>
              )}
            </button>
          </div>
        )}

        {/* Previous Steps (expanded) */}
        {expanded && <PreviousSteps steps={trace.previousSteps} />}
      </div>

      {/* Action Bar */}
      <ActionBar onFeedback={onFeedback} onSkip={onSkip} />
    </motion.div>
  )
}
