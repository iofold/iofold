'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertCircle,
  BookOpen,
  CheckCircle,
  Flag,
  Loader2,
  X,
  Zap
} from 'lucide-react'

interface ResolutionActionsProps {
  selectedCount: number
  onBulkResolve: () => Promise<void> | void
  onRefineEval: () => void
  onClearSelection: () => void
  onAddToTraining?: () => void
  onFlagReview?: () => void
}

export function ResolutionActions({
  selectedCount,
  onBulkResolve,
  onRefineEval,
  onClearSelection,
  onAddToTraining,
  onFlagReview
}: ResolutionActionsProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const handleBulkResolve = async () => {
    setIsProcessing(true)
    try {
      await onBulkResolve()
    } finally {
      setIsProcessing(false)
      setShowConfirmation(false)
    }
  }

  const resolutionOptions = [
    {
      id: 'refine-eval',
      title: 'Refine Evaluation',
      description: 'Create improved evaluation based on selected contradictions',
      icon: Zap,
      action: onRefineEval,
      primary: true
    },
    {
      id: 'bulk-resolve',
      title: 'Mark as Resolved',
      description: 'Mark contradictions as resolved without changes',
      icon: CheckCircle,
      action: () => setShowConfirmation(true),
      variant: 'outline' as const
    },
    {
      id: 'add-training',
      title: 'Add to Training',
      description: 'Include cases in next training cycle',
      icon: BookOpen,
      action: onAddToTraining || (() => console.log('Add to training')),
      variant: 'outline' as const
    },
    {
      id: 'flag-review',
      title: 'Flag for Review',
      description: 'Mark for manual expert review',
      icon: Flag,
      action: onFlagReview || (() => console.log('Flag for review')),
      variant: 'outline' as const
    }
  ]

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-foreground">Bulk Resolution Actions</h3>
              <p className="text-sm text-muted-foreground">
                {selectedCount} contradiction{selectedCount !== 1 ? 's' : ''} selected for resolution
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
            >
              <X size={16} />
              <span className="ml-2">Clear Selection</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {resolutionOptions.map((option) => {
              const Icon = option.icon
              return (
                <Button
                  key={option.id}
                  variant={option.primary ? 'default' : option.variant}
                  size="sm"
                  onClick={option.action}
                  disabled={isProcessing}
                  className="h-auto p-4 flex flex-col items-start text-left space-y-2"
                >
                  <div className="flex items-center space-x-2 w-full">
                    <Icon size={18} />
                    <span className="font-medium">{option.title}</span>
                  </div>
                  <span className="text-xs opacity-80">
                    {option.description}
                  </span>
                </Button>
              )
            })}
          </div>

          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-4 text-muted-foreground">
                <span>Impact Analysis:</span>
                <span>Estimated accuracy improvement: +5-8%</span>
                <span>Contradiction reduction: 60-80%</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-600 text-xs">Ready for processing</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-6">
              <div className="flex items-start space-x-3 mb-4">
                <AlertCircle size={24} className="text-yellow-600 mt-1" />
                <div>
                  <h3 className="font-semibold text-foreground">Confirm Bulk Resolution</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Are you sure you want to mark {selectedCount} contradiction{selectedCount !== 1 ? 's' : ''} as resolved?
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 p-3 rounded border border-yellow-200 mb-4">
                <div className="text-sm text-yellow-800">
                  <div className="font-medium mb-1">What this does:</div>
                  <ul className="text-xs space-y-1">
                    <li>• Removes contradictions from active monitoring</li>
                    <li>• Maintains historical records for audit</li>
                    <li>• Does not change evaluation behavior</li>
                    <li>• Updates contradiction statistics</li>
                  </ul>
                </div>
              </div>

              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmation(false)}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkResolve}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span className="ml-2">Processing...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      <span className="ml-2">Confirm Resolution</span>
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
