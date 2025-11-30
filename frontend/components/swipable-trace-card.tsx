/**
 * SwipableTraceCard - Enhanced card-swiping interface with gesture detection
 * Features:
 * - Swipe right (>100px): Positive feedback (green glow)
 * - Swipe left (>100px): Negative feedback (red glow)
 * - Swipe down (>100px): Neutral feedback (gray glow)
 * - Keyboard shortcuts: 1/2/3 for positive/neutral/negative
 * - Message rendering by role with color coding
 * - Tool call visualization with expandable sections
 * - Compact feedback buttons with selection state
 * - Loading state during feedback submission
 * - Optional notes field for detailed feedback
 * - Smooth animations with framer-motion
 * - Mobile haptic feedback
 */

'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion'
import { parseTrace, getStatusEmoji, formatRelativeTime, formatDuration } from '@/lib/trace-parser'
import { ThumbsUp, ThumbsDown, Minus, ChevronDown, ChevronUp, Clock, Calendar, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Trace, Message, ToolCall } from '@/types/api'
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
  onFeedback: (rating: 'positive' | 'negative' | 'neutral', notes?: string) => void
  onSkip?: () => void
  isTop?: boolean // Whether this card is on top of the stack
  isLoading?: boolean // Whether feedback is being submitted
  className?: string
}

// ============================================================================
// Helper Components
// ============================================================================

function MessageByRole({ message }: { message: Message }) {
  const roleColors = {
    user: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-900',
      label: 'text-blue-700',
      icon: '👤',
    },
    assistant: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-900',
      label: 'text-green-700',
      icon: '🤖',
    },
    system: {
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      text: 'text-gray-900',
      label: 'text-gray-700',
      icon: '⚙️',
    },
  }

  const colors = roleColors[message.role]

  return (
    <div className={cn('rounded-lg border p-3', colors.bg, colors.border)}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{colors.icon}</span>
        <span className={cn('text-xs font-bold uppercase tracking-wide', colors.label)}>
          {message.role}
        </span>
      </div>
      <p className={cn('text-sm leading-relaxed whitespace-pre-wrap', colors.text)}>
        {message.content}
      </p>
    </div>
  )
}

function ToolCallItem({ tool, index, isExpanded, onToggle }: {
  tool: ToolCall
  index: number
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🔧</span>
          <span className="text-sm font-medium text-gray-900">
            {tool.tool_name}
          </span>
          {tool.error && (
            <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">
              Error
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-200 bg-gray-50"
          >
            <div className="p-3 space-y-3">
              {/* Arguments */}
              {tool.arguments && Object.keys(tool.arguments).length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Arguments:</div>
                  <pre className="text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto">
                    {JSON.stringify(tool.arguments, null, 2)}
                  </pre>
                </div>
              )}

              {/* Result */}
              {tool.result !== undefined && (
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Result:</div>
                  <pre className="text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto">
                    {JSON.stringify(tool.result, null, 2)}
                  </pre>
                </div>
              )}

              {/* Error */}
              {tool.error && (
                <div>
                  <div className="text-xs font-semibold text-red-600 mb-1">Error:</div>
                  <div className="text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200">
                    {tool.error}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
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
  isLoading = false,
  className = '',
}: SwipableTraceCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  // Local state
  const [notes, setNotes] = useState('')
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set())
  const [selectedRating, setSelectedRating] = useState<'positive' | 'negative' | 'neutral' | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Parse trace data
  const parsed: ParsedTrace = parseTrace(trace, index + 1, {
    maxMessageLength: 500,
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

  const toggleToolExpansion = (index: number) => {
    setExpandedTools((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const handleFeedbackSubmit = (rating: 'positive' | 'negative' | 'neutral') => {
    setSelectedRating(rating)
    triggerHapticFeedback('medium')
    onFeedback(rating, notes.trim() || undefined)
  }

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false)
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
        handleFeedbackSubmit('positive')
      } else {
        // Left swipe - Negative
        handleFeedbackSubmit('negative')
      }
    } else if (absY > SWIPE_THRESHOLD && swipeY > 0) {
      // Down swipe - Neutral
      handleFeedbackSubmit('neutral')
    }
  }

  const handleDragStart = () => {
    setIsDragging(true)
    triggerHapticFeedback('light')
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle keys if this is the top card and not in textarea
    if (!isTop || (e.target as HTMLElement).tagName === 'TEXTAREA') return

    switch (e.key) {
      case '1':
        e.preventDefault()
        handleFeedbackSubmit('positive')
        break
      case '2':
        e.preventDefault()
        handleFeedbackSubmit('neutral')
        break
      case '3':
        e.preventDefault()
        handleFeedbackSubmit('negative')
        break
      case ' ':
        e.preventDefault()
        onSkip?.()
        break
    }
  }, [isTop, onSkip, notes])

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
      drag={isTop && !isLoading}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={DRAG_ELASTIC}
      dragSnapToOrigin
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      whileHover={isTop && !isLoading ? { scale: 1.02, y: -4 } : {}}
      whileTap={isTop && !isLoading ? { cursor: 'grabbing', scale: 1.0 } : {}}
    >
      {/* Loading Overlay */}
      {isLoading && (
        <motion.div
          className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">Submitting feedback...</p>
          </div>
        </motion.div>
      )}

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
          {/* Messages by Role */}
          {trace.steps.length > 0 && (
            <div className="space-y-3">
              {trace.steps.map((step, stepIdx) => (
                <div key={stepIdx} className="space-y-2">
                  {step.messages_added?.map((message, msgIdx) => (
                    <MessageByRole key={`${stepIdx}-${msgIdx}`} message={message} />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Tool Calls */}
          {trace.steps.some(s => s.tool_calls?.length > 0) && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-600 mb-2">Tool Calls:</div>
              {trace.steps.map((step, stepIdx) =>
                step.tool_calls?.map((tool, toolIdx) => {
                  const globalIdx = stepIdx * 100 + toolIdx
                  return (
                    <ToolCallItem
                      key={globalIdx}
                      tool={tool}
                      index={globalIdx}
                      isExpanded={expandedTools.has(globalIdx)}
                      onToggle={() => toggleToolExpansion(globalIdx)}
                    />
                  )
                })
              )}
            </div>
          )}

          {/* Empty state */}
          {trace.steps.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No messages or tool calls in this trace</p>
              <p className="text-xs mt-1">This trace may be incomplete or still processing</p>
            </div>
          )}
        </div>

        {/* Notes Section */}
        <div className="mb-4 border-t border-gray-200 pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any observations or context..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
            rows={2}
            maxLength={500}
            disabled={isLoading}
          />
          <div className="flex justify-between items-center mt-1">
            <div className="text-xs text-gray-500">
              {notes.length} / 500 characters
            </div>
            {notes.length > 0 && (
              <button
                onClick={() => setNotes('')}
                className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                disabled={isLoading}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Compact Feedback Buttons */}
        <div className="flex justify-center gap-3 mb-4">
          <Button
            onClick={() => handleFeedbackSubmit('positive')}
            variant={selectedRating === 'positive' ? 'success' : 'outline'}
            size="lg"
            disabled={isLoading}
            loading={isLoading && selectedRating === 'positive'}
            className={cn(
              'flex-1 max-w-[140px]',
              selectedRating === 'positive' && 'ring-2 ring-green-500 ring-offset-2'
            )}
          >
            <ThumbsUp className="w-4 h-4" />
            Good
          </Button>

          <Button
            onClick={() => handleFeedbackSubmit('neutral')}
            variant={selectedRating === 'neutral' ? 'secondary' : 'outline'}
            size="lg"
            disabled={isLoading}
            loading={isLoading && selectedRating === 'neutral'}
            className={cn(
              'flex-1 max-w-[140px]',
              selectedRating === 'neutral' && 'ring-2 ring-gray-500 ring-offset-2'
            )}
          >
            <Minus className="w-4 h-4" />
            Okay
          </Button>

          <Button
            onClick={() => handleFeedbackSubmit('negative')}
            variant={selectedRating === 'negative' ? 'danger' : 'outline'}
            size="lg"
            disabled={isLoading}
            loading={isLoading && selectedRating === 'negative'}
            className={cn(
              'flex-1 max-w-[140px]',
              selectedRating === 'negative' && 'ring-2 ring-red-500 ring-offset-2'
            )}
          >
            <ThumbsDown className="w-4 h-4" />
            Bad
          </Button>
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
