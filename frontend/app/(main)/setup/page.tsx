'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  X,
  Settings,
  ArrowRight,
  Check,
  HelpCircle,
  Database,
  Users,
  FileText,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Step configuration
const TOTAL_STEPS = 5

interface StepConfig {
  id: number
  title: string
  description: string
  icon: React.ReactNode
}

const STEPS: StepConfig[] = [
  {
    id: 1,
    title: 'Connect Your Integration',
    description: 'Connect to your observability platform to start importing traces',
    icon: <Settings className="w-6 h-6" />,
  },
  {
    id: 2,
    title: 'Select Agent',
    description: 'Choose an existing agent or create a new one',
    icon: <Users className="w-6 h-6" />,
  },
  {
    id: 3,
    title: 'Import Traces',
    description: 'Import traces from your integration',
    icon: <Database className="w-6 h-6" />,
  },
  {
    id: 4,
    title: 'Review Sample',
    description: 'Preview a sample trace to verify the import',
    icon: <FileText className="w-6 h-6" />,
  },
  {
    id: 5,
    title: 'Complete',
    description: 'Your setup is complete and ready to use',
    icon: <CheckCircle2 className="w-6 h-6" />,
  },
]

export default function SetupPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [isClosing, setIsClosing] = useState(false)

  // Form state for Step 1
  const [platform, setPlatform] = useState<string>('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  // Form state for Step 2
  const [agentSelection, setAgentSelection] = useState<string>('')

  // Form state for Step 3
  const [importOption, setImportOption] = useState<string>('')

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        if (currentStep < TOTAL_STEPS) {
          handleContinue()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStep])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      window.location.href = '/'
    }, 300)
  }

  const handleContinue = () => {
    // Validate current step before proceeding
    if (currentStep === 1 && (!platform || !apiKey)) {
      return
    }
    if (currentStep === 2 && !agentSelection) {
      return
    }
    if (currentStep === 3 && !importOption) {
      return
    }

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1)
    } else {
      // Complete setup
      window.location.href = '/'
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const getProgressPercentage = () => {
    return (currentStep / TOTAL_STEPS) * 100
  }

  const isStepComplete = (step: number) => {
    return step < currentStep
  }

  const isStepActive = (step: number) => {
    return step === currentStep
  }

  const canContinue = () => {
    if (currentStep === 1) {
      return platform && apiKey
    }
    if (currentStep === 2) {
      return agentSelection
    }
    if (currentStep === 3) {
      return importOption
    }
    return true
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            {/* Step Icon and Header */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Settings className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {STEPS[0].title}
                </h2>
                <p className="text-muted-foreground">{STEPS[0].description}</p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-6 max-w-md mx-auto">
              {/* Platform Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Platform <span className="text-destructive">*</span>
                </label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="langfuse">Langfuse</SelectItem>
                    <SelectItem value="langsmith">Langsmith</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* API Key Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  API Key <span className="text-destructive">*</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {/* Base URL Input (Optional) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Base URL <span className="text-muted-foreground text-xs">(Optional)</span>
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://cloud.langfuse.com"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the default URL
                </p>
              </div>
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            {/* Step Icon and Header */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {STEPS[1].title}
                </h2>
                <p className="text-muted-foreground">{STEPS[1].description}</p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-6 max-w-md mx-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Agent <span className="text-destructive">*</span>
                </label>
                <Select value={agentSelection} onValueChange={setAgentSelection}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose or create an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Create New Agent</SelectItem>
                    <SelectItem value="agent-1">Customer Support Agent v1.0</SelectItem>
                    <SelectItem value="agent-2">Sales Assistant v2.1</SelectItem>
                    <SelectItem value="agent-3">Technical Helper v1.5</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select an existing agent or create a new one
                </p>
              </div>
            </div>
          </div>
        )

      case 3:
        return (
          <div className="space-y-6">
            {/* Step Icon and Header */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Database className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {STEPS[2].title}
                </h2>
                <p className="text-muted-foreground">{STEPS[2].description}</p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-6 max-w-md mx-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Import Method <span className="text-destructive">*</span>
                </label>
                <Select value={importOption} onValueChange={setImportOption}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select import method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Import Recent Traces (Last 7 days)</SelectItem>
                    <SelectItem value="range">Import Date Range</SelectItem>
                    <SelectItem value="manual">Select Specific Traces</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose how you want to import your traces
                </p>
              </div>
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-6">
            {/* Step Icon and Header */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {STEPS[3].title}
                </h2>
                <p className="text-muted-foreground">{STEPS[3].description}</p>
              </div>
            </div>

            {/* Sample Trace Preview */}
            <div className="max-w-2xl mx-auto">
              <div className="rounded-lg border border-border bg-muted/50 p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div>
                    <h3 className="font-semibold text-foreground">Sample Trace</h3>
                    <p className="text-xs text-muted-foreground">TRC-2024-001</p>
                  </div>
                  <div className="px-2 py-1 rounded bg-success/10 text-success text-xs font-medium">
                    Connected
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Input</div>
                    <div className="text-sm text-foreground bg-background rounded p-3 font-mono">
                      What is the weather today?
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Output</div>
                    <div className="text-sm text-foreground bg-background rounded p-3 font-mono">
                      I&apos;ll help you check the weather. Could you please tell me your location?
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Timestamp
                      </div>
                      <div className="text-sm text-foreground">2024-11-30 10:32:45</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Duration
                      </div>
                      <div className="text-sm text-foreground">1.2s</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-4 bg-info/10 border border-info/20 rounded-lg flex items-start gap-3">
                <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
                <div className="text-sm text-foreground">
                  This is a sample trace from your integration. Click continue to complete the
                  setup and start reviewing all your traces.
                </div>
              </div>
            </div>
          </div>
        )

      case 5:
        return (
          <div className="space-y-6">
            {/* Success Icon and Header */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-success" />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-foreground mb-2">Setup Complete!</h2>
                <p className="text-muted-foreground text-lg">
                  Your integration is ready to use
                </p>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-border bg-card text-center">
                <div className="text-2xl font-bold text-primary mb-1">1</div>
                <div className="text-sm text-muted-foreground">Integration Connected</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card text-center">
                <div className="text-2xl font-bold text-primary mb-1">1</div>
                <div className="text-sm text-muted-foreground">Agent Selected</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card text-center">
                <div className="text-2xl font-bold text-primary mb-1">Ready</div>
                <div className="text-sm text-muted-foreground">Import Configured</div>
              </div>
            </div>

            {/* Next Steps */}
            <div className="max-w-2xl mx-auto space-y-3">
              <h3 className="font-semibold text-foreground text-center mb-4">Next Steps</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                    1
                  </div>
                  <span className="text-sm text-foreground">Review imported traces</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                    2
                  </div>
                  <span className="text-sm text-foreground">Provide feedback on trace quality</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                    3
                  </div>
                  <span className="text-sm text-foreground">
                    Generate your first evaluation function
                  </span>
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background Overlay */}
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />

      {/* Setup Modal */}
      <Card
        className={cn(
          'relative w-full max-w-4xl bg-card shadow-elevation-3 transition-all duration-300',
          isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        )}
      >
        {/* Header */}
        <div className="border-b border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-foreground">First-Time Setup</h1>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">
                Step {currentStep} of {TOTAL_STEPS}
              </span>
              <span className="text-muted-foreground font-medium">
                {Math.round(getProgressPercentage())}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="border-b border-border px-6 py-8">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            {STEPS.map((step, index) => (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center gap-2 relative">
                  {/* Circle */}
                  <div
                    className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300 relative z-10',
                      isStepComplete(step.id)
                        ? 'bg-primary text-white'
                        : isStepActive(step.id)
                          ? 'bg-primary text-white ring-4 ring-primary/20'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {isStepComplete(step.id) ? (
                      <Check className="w-6 h-6" />
                    ) : (
                      step.id
                    )}
                  </div>
                  {/* Label */}
                  <div
                    className={cn(
                      'text-xs font-medium text-center max-w-[80px] transition-colors',
                      isStepActive(step.id) ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {step.title}
                  </div>
                </div>

                {/* Connecting Line */}
                {index < STEPS.length - 1 && (
                  <div className="flex-1 h-0.5 bg-muted mx-2 relative -mt-12">
                    <div
                      className={cn(
                        'h-full bg-primary transition-all duration-300',
                        isStepComplete(step.id + 1) ? 'w-full' : 'w-0'
                      )}
                    />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-8 min-h-[400px]">{renderStepContent()}</div>

        {/* Footer */}
        <div className="border-t border-border p-6">
          <div className="flex items-center justify-between">
            {/* Help Button */}
            <Button variant="ghost" size="sm">
              <HelpCircle className="w-4 h-4 mr-2" />
              Help
            </Button>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-3">
              {currentStep > 1 && currentStep < TOTAL_STEPS && (
                <Button variant="outline" onClick={handleBack}>
                  Back
                </Button>
              )}
              <Button
                onClick={handleContinue}
                disabled={!canContinue()}
                className="min-w-[120px]"
              >
                {currentStep === TOTAL_STEPS ? 'Get Started' : 'Continue'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* Keyboard Shortcut Tip */}
          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Tip: Use <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd>{' '}
              to continue, <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Escape</kbd>{' '}
              to cancel
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
