/**
 * SwipableTraceCard - Card-swiping interface with gesture detection
 * Features:
 * - Swipe right (>100px): Positive feedback (green glow)
 * - Swipe left (>100px): Negative feedback (red glow)
 * - Swipe down (>100px): Neutral feedback (gray glow)
 * - Keyboard shortcuts: 1/2/3 for positive/neutral/negative
 * - Smooth animations with framer-motion
 * - Mobile haptic feedback
 */

'use client'

import { useEffect, useRef, useCallback } from 'react'
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion'
import { parseTrace, getStatusEmoji, formatRelativeTime, formatDuration } from '@/lib/trace-parser'
import type { Trace } from '@/types/api'
import type { ParsedTrace } from '@/types/trace'

// ============================================================================
// Constants
// ============================================================================

const SWIPE_THRESHOLD = 100 // pixels
const SWIPE_VELOCITY_THRESHOLD = 500 // pixels/second
const ROTATION_MAX = 15 // degrees
const DRAG_ELASTIC = 0.2 // Resistance when dragging

// Animation durations (ms)
const ENTER_DURATION = 300
const EXIT_DURATION = 200
const SNAP_BACK_DURATION = 200

// Colors for feedback states
const COLORS = {
  positive: 'rgba(34, 197, 94, 0.15)', // green-500 at 15% opacity
  negative: 'rgba(239, 68, 68, 0.15)', // red-500 at 15% opacity
  neutral: 'rgba(100, 116, 139, 0.15)', // slate-500 at 15% opacity
  default: 'rgba(255, 255, 255, 1)',
}

const GLOW_COLORS = {
  positive: 'rgba(34, 197, 94, 0.5)',
  negative: 'rgba(239, 68, 68, 0.5)',
  neutral: 'rgba(100, 116, 139, 0.5)',
}

// ============================================================================
// Types
// ============================================================================

interface SwipableTraceCardProps {
  trace: Trace
  index: number
  onFeedback: (rating: 'positive' | 'negative' | 'neutral') => void
  onSkip?: () => void
  isTop?: boolean // Whether this card is on top of the stack
  className?: string
}

// ============================================================================
// Component
// ============================================================================

export function SwipableTraceCard({
  trace,
  index,
  onFeedback,
  onSkip,
  isTop = true,
  className = '',
}: SwipableTraceCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  // Parse trace data
  const parsed: ParsedTrace = parseTrace(trace, index + 1, {
    maxMessageLength: 200,
    includeMetadata: false,
  })

  const { header, lastExchange, toolCalls } = parsed

  // Motion values for drag animation
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)

  // Transform drag position to rotation (tilt effect)
  const rotateZ = useTransform(dragX, [-200, 0, 200], [-ROTATION_MAX, 0, ROTATION_MAX])

  // Transform drag to background color (visual feedback)
  const backgroundColor = useTransform(
    [dragX, dragY],
    ([x, y]) => {
      const absX = Math.abs(x as number)
      const absY = Math.abs(y as number)

      // Determine direction based on dominant axis
      if (absX > absY) {
        // Horizontal swipe
        if (x as number > SWIPE_THRESHOLD) {
          return COLORS.positive
        } else if (x as number < -SWIPE_THRESHOLD) {
          return COLORS.negative
        }
      } else if (absY > SWIPE_THRESHOLD) {
        // Vertical swipe (down)
        if (y as number > 0) {
          return COLORS.neutral
        }
      }

      return COLORS.default
    }
  )

  // Transform drag to glow effect
  const boxShadow = useTransform(
    [dragX, dragY],
    ([x, y]) => {
      const absX = Math.abs(x as number)
      const absY = Math.abs(y as number)

      // Determine direction and intensity
      if (absX > absY && absX > 50) {
        const intensity = Math.min(absX / SWIPE_THRESHOLD, 1)
        const color = x as number > 0 ? GLOW_COLORS.positive : GLOW_COLORS.negative
        return `0 0 ${30 * intensity}px ${color}`
      } else if (absY > 50 && y as number > 0) {
        const intensity = Math.min(absY / SWIPE_THRESHOLD, 1)
        return `0 0 ${30 * intensity}px ${GLOW_COLORS.neutral}`
      }

      return '0 4px 6px rgba(0, 0, 0, 0.1)'
    }
  )

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const triggerHapticFeedback = (style: 'light' | 'medium' | 'heavy' = 'light') => {
    if ('vibrate' in navigator) {
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [30, 10, 30],
      }
      navigator.vibrate(patterns[style])
    }
  }

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset, velocity } = info
    const swipeX = offset.x
    const swipeY = offset.y
    const absX = Math.abs(swipeX)
    const absY = Math.abs(swipeY)
    const velocityX = Math.abs(velocity.x)
    const velocityY = Math.abs(velocity.y)

    // Determine if swipe was intentional (past threshold or high velocity)
    const isIntentionalSwipe =
      absX > SWIPE_THRESHOLD ||
      absY > SWIPE_THRESHOLD ||
      velocityX > SWIPE_VELOCITY_THRESHOLD ||
      velocityY > SWIPE_VELOCITY_THRESHOLD

    if (!isIntentionalSwipe) {
      // Snap back - no feedback
      return
    }

    // Determine direction based on dominant axis and threshold
    if (absX > absY) {
      // Horizontal swipe
      if (swipeX > 0) {
        // Right swipe - Positive
        triggerHapticFeedback('medium')
        onFeedback('positive')
      } else {
        // Left swipe - Negative
        triggerHapticFeedback('medium')
        onFeedback('negative')
      }
    } else if (absY > SWIPE_THRESHOLD && swipeY > 0) {
      // Down swipe - Neutral
      triggerHapticFeedback('light')
      onFeedback('neutral')
    }
  }

  const handleDragStart = () => {
    triggerHapticFeedback('light')
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle keys if this is the top card
    if (!isTop) return

    switch (e.key) {
      case '1':
        e.preventDefault()
        triggerHapticFeedback('medium')
        onFeedback('positive')
        break
      case '2':
        e.preventDefault()
        triggerHapticFeedback('light')
        onFeedback('neutral')
        break
      case '3':
        e.preventDefault()
        triggerHapticFeedback('medium')
        onFeedback('negative')
        break
      case ' ':
        e.preventDefault()
        onSkip?.()
        break
    }
  }, [isTop, onFeedback, onSkip])

  // Keyboard shortcuts
  useEffect(() => {
    if (!isTop) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isTop, handleKeyDown])

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <motion.div
      ref={cardRef}
      className={`relative bg-white rounded-lg shadow-lg overflow-hidden ${className}`}
      style={{
        width: 'min(600px, 90vw)',
        maxHeight: '70vh',
        touchAction: 'none',
        cursor: 'grab',
        backgroundColor,
        boxShadow,
        rotateZ,
      }}
      // Entry animation
      initial={{
        opacity: 0,
        x: 300,
        scale: 0.9
      }}
      animate={{
        opacity: 1,
        x: 0,
        scale: 1
      }}
      exit={{
        opacity: 0,
        x: dragX.get() > 0 ? 500 : dragX.get() < 0 ? -500 : 0,
        y: dragY.get() > SWIPE_THRESHOLD ? 500 : 0,
        scale: 0.8,
        transition: { duration: EXIT_DURATION / 1000 }
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        duration: ENTER_DURATION / 1000,
      }}
      // Drag configuration
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={DRAG_ELASTIC}
      dragSnapToOrigin
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      whileHover={isTop ? { scale: 1.02, y: -4 } : {}}
      whileTap={isTop ? { cursor: 'grabbing', scale: 1.0 } : {}}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-2xl" role="img" aria-label={`Status: ${header.status}`}>
              {getStatusEmoji(header.status)}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  Trace #{header.traceNumber}
                </span>
                <span className="text-xs text-gray-500">
                  {formatRelativeTime(header.timestamp)}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {header.stepCount} {header.stepCount === 1 ? 'step' : 'steps'}
                {header.duration && ` · ${formatDuration(header.duration)}`}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-4 mb-6 max-h-[45vh] overflow-y-auto">
          {/* Last Exchange */}
          {lastExchange.human && (
            <div className="space-y-1">
              <div className="flex items-start gap-2">
                <span className="text-lg" role="img" aria-label="Human">
                  👤
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-700 mb-1">Human:</div>
                  <div className="text-sm text-gray-900 leading-relaxed">
                    {lastExchange.human.content}
                  </div>
                  {lastExchange.human.truncated && (
                    <button
                      className="text-xs text-blue-600 hover:text-blue-700 mt-1"
                      title={lastExchange.human.fullContent}
                    >
                      Show more...
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {lastExchange.assistant && (
            <div className="space-y-1">
              <div className="flex items-start gap-2">
                <span className="text-lg" role="img" aria-label="Assistant">
                  🤖
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-700 mb-1">Assistant:</div>
                  <div className="text-sm text-gray-900 leading-relaxed">
                    {lastExchange.assistant.content}
                  </div>
                  {lastExchange.assistant.truncated && (
                    <button
                      className="text-xs text-blue-600 hover:text-blue-700 mt-1"
                      title={lastExchange.assistant.fullContent}
                    >
                      Show more...
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tool Calls */}
          {toolCalls.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              {toolCalls.map((tool, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-base" role="img" aria-label="Tool">
                    🔧
                  </span>
                  <div className="flex-1 font-mono">
                    <div className="text-gray-700">
                      <span className="font-medium">Used tool:</span>{' '}
                      {tool.module && <span className="text-gray-500">{tool.module}.</span>}
                      {tool.name}
                    </div>
                    {tool.result !== undefined && (
                      <div className="text-xs text-gray-600 mt-1 pl-4">
                        → Result: {JSON.stringify(tool.result).substring(0, 100)}
                        {JSON.stringify(tool.result).length > 100 && '...'}
                      </div>
                    )}
                    {tool.error && (
                      <div className="text-xs text-red-600 mt-1 pl-4 flex items-center gap-1">
                        <span role="img" aria-label="Error">
                          ⚠️
                        </span>
                        Error: {tool.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!lastExchange.human && !lastExchange.assistant && toolCalls.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No messages or tool calls in this trace</p>
              <p className="text-xs mt-1">This trace may be incomplete or still processing</p>
            </div>
          )}
        </div>

        {/* Action Hints */}
        <div className="border-t border-gray-200 pt-4">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <span role="img" aria-label="Swipe left">
                  👈
                </span>
                Swipe left for{' '}
                <span role="img" aria-label="Negative">
                  👎
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span role="img" aria-label="Swipe right">
                  👉
                </span>
                Swipe right for{' '}
                <span role="img" aria-label="Positive">
                  👍
                </span>
              </span>
            </div>
            <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
              <span role="img" aria-label="Swipe down">
                ↓
              </span>
              Swipe down for{' '}
              <span role="img" aria-label="Neutral">
                😐
              </span>
            </div>
            <div className="text-xs text-gray-500">
              Or press: <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border">1</kbd> Positive{' '}
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border">2</kbd> Neutral{' '}
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border">3</kbd> Negative
            </div>
          </div>
        </div>
      </div>

      {/* Drag direction indicators (shown while dragging) */}
      <motion.div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        style={{
          opacity: useTransform(
            dragX,
            [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
            [0, 0, 1]
          ),
        }}
      >
        <div className="text-6xl">
          <motion.span
            style={{
              opacity: useTransform(dragX, [0, SWIPE_THRESHOLD], [0, 1]),
            }}
            role="img"
            aria-label="Positive"
          >
            👍
          </motion.span>
        </div>
      </motion.div>

      <motion.div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        style={{
          opacity: useTransform(
            dragX,
            [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
            [1, 0, 0]
          ),
        }}
      >
        <div className="text-6xl">
          <motion.span
            style={{
              opacity: useTransform(dragX, [-SWIPE_THRESHOLD, 0], [1, 0]),
            }}
            role="img"
            aria-label="Negative"
          >
            👎
          </motion.span>
        </div>
      </motion.div>

      <motion.div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        style={{
          opacity: useTransform(dragY, [0, SWIPE_THRESHOLD], [0, 1]),
        }}
      >
        <div className="text-6xl">
          <motion.span
            style={{
              opacity: useTransform(dragY, [0, SWIPE_THRESHOLD], [0, 1]),
            }}
            role="img"
            aria-label="Neutral"
          >
            😐
          </motion.span>
        </div>
      </motion.div>
    </motion.div>
  )
}
