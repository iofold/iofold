'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FeedbackButtons } from '@/components/feedback-buttons'
import { Feedback } from '@/types/api'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuickFeedbackBarProps {
  traceId: string
  currentFeedback?: Feedback
  onFeedbackSubmit?: () => void
}

export function QuickFeedbackBar({
  traceId,
  currentFeedback,
  onFeedbackSubmit,
}: QuickFeedbackBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  // Hide bar on scroll down, show on scroll up
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY

      if (currentScrollY < lastScrollY) {
        // Scrolling up
        setIsVisible(true)
      } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // Scrolling down and past 100px
        setIsVisible(false)
        setIsExpanded(false)
      }

      setLastScrollY(currentScrollY)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [lastScrollY])

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300',
        isVisible ? 'translate-y-0' : 'translate-y-full'
      )}
    >
      <Card className="mx-auto max-w-4xl mb-4 shadow-lg border-2">
        <div className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                Quick Feedback
              </div>

              {/* Feedback Buttons */}
              <div className="flex-1 flex justify-center">
                <FeedbackButtons
                  traceId={traceId}
                  currentFeedback={currentFeedback}
                  onFeedbackSubmit={onFeedbackSubmit}
                  showNotesButton={isExpanded}
                  size="sm"
                  showLabels={isExpanded}
                />
              </div>
            </div>

            {/* Expand/Collapse Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Expanded content with notes preview */}
          {isExpanded && currentFeedback?.notes && (
            <div className="mt-3 pt-3 border-t">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Notes:
              </div>
              <div className="text-sm bg-muted/50 p-2 rounded max-h-20 overflow-auto">
                {currentFeedback.notes}
              </div>
            </div>
          )}

          {/* Keyboard shortcuts hint */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t text-xs text-muted-foreground text-center">
              Keyboard shortcuts: 1 (Good) • 2 (Neutral) • 3 (Bad)
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
