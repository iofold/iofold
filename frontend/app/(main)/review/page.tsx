/**
 * Daily Quick Review Page - Enhanced card-style interface for rapid trace evaluation
 *
 * Features:
 * - Lightning bolt icon header with "Daily Quick Review" title
 * - Auto mode toggle with remaining time indicator
 * - Progress bar with Good/Okay/Bad counters
 * - Styled trace review cards with USER INPUT and AGENT RESPONSE sections
 * - Quick notes textarea with character counter
 * - Three large feedback buttons (Bad/Okay/Good)
 * - Mock trace data for demonstration
 * - IOFold brand colors (Mint, Coral, Cream)
 * - Keyboard shortcuts for rapid reviewing
 */

'use client'

import { useState, useEffect, Suspense, useCallback, useRef, useMemo } from 'react'
import { useRouter } from '@/hooks/use-router-with-progress'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { TableSkeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import {
  ArrowLeft,
  RefreshCw,
  Play,
  Pause,
  Zap,
  Clock,
  TrendingUp,
  Calendar
} from 'lucide-react'
import { toast } from 'sonner'
import type { Trace } from '@/types/api'
import { cn } from '@/lib/utils'
import { ConversationThread } from '@/components/review/ConversationThread'
import { TraceExplorer } from '@/components/review/TraceExplorer'

// ============================================================================
// Mock Data for Demonstration
// ============================================================================

const MOCK_TRACES = [
  {
    id: 'trace-demo-1',
    agent_id: 'agent-demo',
    input: 'What are the best practices for writing unit tests in TypeScript?',
    output: 'Here are the key best practices for writing unit tests in TypeScript:\n\n1. Use a testing framework like Jest or Vitest\n2. Follow the AAA pattern (Arrange, Act, Assert)\n3. Keep tests isolated and independent\n4. Use descriptive test names\n5. Mock external dependencies\n6. Test edge cases and error conditions\n7. Maintain good test coverage (70-80%)\n8. Use type-safe mocks with TypeScript',
    score: 0.85,
    timestamp: '2025-11-30T12:00:00.000Z',
    duration_ms: 2340,
    metadata: { model: 'gpt-4', tokens: 245 }
  },
  {
    id: 'trace-demo-2',
    agent_id: 'agent-demo',
    input: 'How do I center a div in CSS?',
    output: 'To center a div in CSS, you can use flexbox:\n\n```css\n.container {\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  height: 100vh;\n}\n```\n\nOr use CSS Grid:\n\n```css\n.container {\n  display: grid;\n  place-items: center;\n  height: 100vh;\n}\n```',
    score: 0.92,
    timestamp: '2025-11-30T11:55:00.000Z',
    duration_ms: 1850,
    metadata: { model: 'gpt-4', tokens: 180 }
  },
  {
    id: 'trace-demo-3',
    agent_id: 'agent-demo',
    input: 'Explain the difference between var, let, and const in JavaScript',
    output: 'Here\'s the difference:\n\n- var: Function-scoped, can be redeclared, hoisted\n- let: Block-scoped, cannot be redeclared, not hoisted\n- const: Block-scoped, cannot be reassigned or redeclared\n\nBest practice: Use const by default, let when you need to reassign, avoid var.',
    score: 0.78,
    timestamp: '2025-11-30T11:50:00.000Z',
    duration_ms: 1920,
    metadata: { model: 'gpt-3.5-turbo', tokens: 156 }
  },
  {
    id: 'trace-demo-4',
    agent_id: 'agent-demo',
    input: 'What is the purpose of async/await in JavaScript?',
    output: 'async/await is syntactic sugar for working with Promises in JavaScript. It makes asynchronous code look and behave more like synchronous code, improving readability.\n\nKey points:\n- async functions always return a Promise\n- await pauses execution until the Promise resolves\n- Error handling uses try/catch blocks\n- Makes code more maintainable than .then() chains',
    score: 0.88,
    timestamp: '2025-11-30T11:45:00.000Z',
    duration_ms: 2100,
    metadata: { model: 'gpt-4', tokens: 198 }
  },
  {
    id: 'trace-demo-5',
    agent_id: 'agent-demo',
    input: 'How do I handle errors in React components?',
    output: 'In React, you can handle errors using:\n\n1. Error Boundaries (class components)\n2. Try/catch in async functions\n3. Error states in hooks\n4. Global error handlers\n\nExample with Error Boundary:\n```jsx\nclass ErrorBoundary extends React.Component {\n  componentDidCatch(error, errorInfo) {\n    // Log error\n  }\n  render() {\n    if (this.state.hasError) {\n      return <h1>Something went wrong.</h1>;\n    }\n    return this.props.children;\n  }\n}\n```',
    score: 0.81,
    timestamp: '2025-11-30T11:40:00.000Z',
    duration_ms: 2650,
    metadata: { model: 'gpt-4', tokens: 267 }
  }
]

// ============================================================================
// Types
// ============================================================================

interface TraceData {
  id: string
  agent_id: string
  input: string
  output: string
  score: number
  timestamp: string
  duration_ms: number
  metadata: Record<string, any>
  toolCalls?: { name: string; args: string; result?: string }[]
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: ToolCall[]
}

interface ToolCall {
  id: string
  name: string
  arguments?: Record<string, any>
  result?: any
  error?: string
}

// Helper to extract user input from JSON messages format
function extractUserInput(inputPreview: string): string {
  if (!inputPreview) return '';
  // Try to parse JSON input and extract user message
  try {
    const parsed = JSON.parse(inputPreview);
    if (parsed.messages && Array.isArray(parsed.messages)) {
      const userMsg = parsed.messages.find((m: any) => m.role === 'user');
      if (userMsg?.content) return userMsg.content;
    }
    return inputPreview;
  } catch {
    return inputPreview;
  }
}

// Helper to extract ALL messages from trace steps for ConversationThread
// This handles multiple assistant turns with distinct tool calls for each turn
function extractMessagesFromSteps(steps: any[]): Message[] {
  const messages: Message[] = []
  if (!steps || !Array.isArray(steps)) return messages

  // Build maps for linking tool calls to their parent assistant messages
  // Map: span_id -> step data
  const stepsBySpanId = new Map<string, { stepIndex: number; step: any }>()
  // Map: parent_span_id -> list of child tool steps
  const childToolStepsByParentId = new Map<string, any[]>()

  // First pass: index steps by span_id and collect child tool steps
  steps.forEach((step, stepIndex) => {
    const spanId = step.metadata?.span_id
    if (spanId) {
      stepsBySpanId.set(spanId, { stepIndex, step })
    }

    // Check if this is a tool execution step (has toolName in input)
    let inputObj = step.input
    if (typeof step.input === 'string') {
      try {
        inputObj = JSON.parse(step.input)
      } catch {
        // Not valid JSON
      }
    }

    const toolName = inputObj?.toolName
    const parentSpanId = step.metadata?.parent_span_id

    // If this step has a parent and is a tool step, add it to the parent's children
    if (parentSpanId && toolName) {
      const existing = childToolStepsByParentId.get(parentSpanId) || []
      existing.push({ ...step, stepIndex, toolName })
      childToolStepsByParentId.set(parentSpanId, existing)
    }
  })

  // Second pass: extract messages and attach child tool calls
  steps.forEach((step, stepIndex) => {
    // Extract messages_added from each step
    if (step.messages_added && Array.isArray(step.messages_added)) {
      step.messages_added.forEach((msg: any, msgIndex: number) => {
        // Generate a unique ID for this message (use span_id if available)
        const messageId = step.metadata?.span_id || `step_${stepIndex}_msg_${msgIndex}`

        // For assistant messages, find tool calls from child steps
        let toolCalls: ToolCall[] | undefined = undefined

        if (msg.role === 'assistant') {
          // Get child tool steps for this assistant message's span
          const childToolSteps = childToolStepsByParentId.get(messageId) || []

          if (childToolSteps.length > 0) {
            toolCalls = childToolSteps.map((childStep: any) => {
              // Extract tool call details from the child step
              const tc = childStep.tool_calls?.[0] || {}
              const childStepId = childStep.step_id || childStep.metadata?.span_id || `step_${childStep.stepIndex}`

              return {
                id: childStepId,
                name: childStep.toolName || tc.tool_name || 'Tool',
                arguments: tc.arguments || childStep.input,
                result: tc.result ?? childStep.output,
                error: tc.error ?? childStep.error,
              }
            })
          }

          // Also check for tool calls embedded in the step itself
          const stepToolCalls = step.tool_calls || []
          const msgToolCalls = msg.tool_calls || []
          const embeddedToolCalls = [...stepToolCalls, ...msgToolCalls]

          if (embeddedToolCalls.length > 0) {
            const embedded = embeddedToolCalls.map((tc: any, tcIdx: number) => ({
              id: `${messageId}_tc_${tcIdx}`,
              name: tc.tool_name || tc.name || 'Tool',
              arguments: tc.arguments || tc.input,
              result: tc.result,
              error: tc.error,
            }))
            toolCalls = [...(toolCalls || []), ...embedded]
          }
        }

        messages.push({
          id: messageId,
          role: msg.role,
          content: msg.content || '',
          toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        })
      })
    }
  })

  return messages
}

// ============================================================================
// Component
// ============================================================================

function ReviewPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // Only use agent_id from URL params - don't default to demo value
  const agentId = searchParams.get('agent_id') || null

  // Core state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [feedbackCounts, setFeedbackCounts] = useState({
    good: 0,
    okay: 0,
    bad: 0,
  })
  const [notes, setNotes] = useState('')
  const [isAutoMode, setIsAutoMode] = useState(false)
  const [useMockData, setUseMockData] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [displayedTrace, setDisplayedTrace] = useState<TraceData | null>(null)
  // Track reviewed trace IDs locally to filter them out immediately
  const [reviewedTraceIds, setReviewedTraceIds] = useState<Set<string>>(new Set())
  // Track selected message/tool call ID for cross-pane selection
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const sessionStartTimeRef = useRef<Date | null>(null)

  // Initialize session start time on client only
  useEffect(() => {
    if (!sessionStartTimeRef.current) {
      sessionStartTimeRef.current = new Date()
    }
  }, [])

  // Fetch real traces without feedback (when not using mock data)
  const {
    data: tracesData,
    isLoading: isLoadingList,
    error: listError,
    refetch,
  } = useQuery({
    queryKey: ['traces', 'review'],
    queryFn: () =>
      apiClient.listTraces({
        has_feedback: false,
        limit: 50,
      }),
    retry: 2,
    enabled: !useMockData,
  })

  // Use mock data or real data - map TraceSummary to TraceData format
  // Filter out traces that have been reviewed in this session (to prevent seeing them again)
  const traces: TraceData[] = useMockData
    ? MOCK_TRACES.filter(t => !reviewedTraceIds.has(t.id))
    : (tracesData?.traces || [])
        .filter((trace: any) => !reviewedTraceIds.has(trace.id))
        .map((trace: any) => {
          const inputPreview = trace.summary?.input_preview || '';
          const outputPreview = trace.summary?.output_preview || '';
          return {
            id: trace.id,
            // Use trace's agent_id (from agent_version), or fallback to feedback's agent_id
            agent_id: trace.agent_id || trace.feedback?.agent_id || null,
            input: extractUserInput(inputPreview) || '(No input available)',
            output: outputPreview || '(No output available)',
            score: trace.feedback?.rating === 'positive' ? 1 : trace.feedback?.rating === 'negative' ? -1 : 0,
            timestamp: trace.timestamp,
            duration_ms: 0,
            metadata: { step_count: trace.step_count, has_errors: trace.summary?.has_errors, source: trace.source }
          };
        })

  // Reset currentIndex if it goes out of bounds (e.g., after filtering out reviewed traces)
  useEffect(() => {
    if (traces.length > 0 && currentIndex >= traces.length) {
      setCurrentIndex(Math.max(0, traces.length - 1))
    }
  }, [traces.length, currentIndex])

  const currentTraceId = traces[currentIndex]?.id

  // Fetch full trace details for current trace (to get output from observations)
  const { data: traceDetails } = useQuery({
    queryKey: ['trace-detail', currentTraceId],
    queryFn: () => apiClient.getTrace(currentTraceId!),
    enabled: !!currentTraceId && !useMockData,
    staleTime: 60000, // Cache for 1 minute
  })

  // Helper to extract output and tool calls from trace observations
  const extractFromObservations = useCallback((observations: any[]): { output: string; toolCalls: TraceData['toolCalls'] } => {
    if (!observations?.length) return { output: '', toolCalls: [] };

    let output = '';
    const toolCalls: TraceData['toolCalls'] = [];

    // Find output from various observation types
    for (const obs of observations) {
      // Try GENERATION type first
      if (obs.type === 'GENERATION' && obs.output) {
        const content = typeof obs.output === 'object' && 'content' in obs.output
          ? obs.output.content
          : typeof obs.output === 'string' ? obs.output : '';
        if (content && !output) {
          output = content;
        }
      }
      // Also try extracting from agent_response steps
      if (obs.type === 'agent_response' && obs.content) {
        if (!output) {
          output = typeof obs.content === 'string' ? obs.content : JSON.stringify(obs.content);
        }
      }
      // Extract tool calls from SPAN type
      if (obs.type === 'SPAN' && obs.input?.toolName) {
        toolCalls.push({
          name: obs.input.toolName,
          args: JSON.stringify(obs.input, null, 2),
          result: obs.output ? JSON.stringify(obs.output, null, 2) : undefined
        });
      }
      // Also check for tool_calls in step format
      if (obs.type === 'tool_call' && obs.tool_name) {
        toolCalls.push({
          name: obs.tool_name,
          args: obs.arguments ? JSON.stringify(obs.arguments, null, 2) : '{}',
          result: obs.result ? JSON.stringify(obs.result, null, 2) : undefined
        });
      }
    }

    return { output, toolCalls };
  }, []);

  // Enhance current trace with data from full trace details
  const currentTrace = useMemo(() => {
    const baseTrace = traces[currentIndex];
    if (!baseTrace || useMockData) return baseTrace;

    // If we have trace details, use the extracted output and tool calls
    // Cast to any since API returns more fields than type defines
    const details = traceDetails as any;
    if (details) {
      let enhancedOutput = baseTrace.output;
      let enhancedInput = baseTrace.input;
      let toolCalls: TraceData['toolCalls'] = undefined;

      // Extract from observations if available
      if (details.observations) {
        const extracted = extractFromObservations(details.observations);
        if (extracted.output) enhancedOutput = extracted.output;
        if (extracted.toolCalls?.length) toolCalls = extracted.toolCalls;
      }

      // Also try steps if observations didn't yield output
      if (enhancedOutput === '(No output available)' && details.steps?.length) {
        const extracted = extractFromObservations(details.steps);
        if (extracted.output) enhancedOutput = extracted.output;
        if (!toolCalls?.length && extracted.toolCalls?.length) toolCalls = extracted.toolCalls;
      }

      // Try to get input from trace details if missing
      if (enhancedInput === '(No input available)') {
        if (details.steps?.[0]?.input) {
          const stepInput = details.steps[0].input;
          if (typeof stepInput === 'string') {
            enhancedInput = stepInput;
          } else if (stepInput?.messages) {
            const userMsg = stepInput.messages.find((m: any) => m.role === 'user');
            if (userMsg?.content) enhancedInput = userMsg.content;
          }
        }
      }

      return {
        ...baseTrace,
        input: enhancedInput,
        output: enhancedOutput,
        toolCalls
      };
    }

    return baseTrace;
  }, [traces, currentIndex, traceDetails, useMockData, extractFromObservations])

  // Extract messages for ConversationThread from trace details
  // Prefer spans over steps for the new OpenInference format
  const messages = useMemo(() => {
    if (useMockData || !traceDetails) return []
    const details = traceDetails as any
    // Only extract from steps if spans are not available
    // ConversationThread will handle spans directly
    if (!details.spans || details.spans.length === 0) {
      return extractMessagesFromSteps(details.steps || [])
    }
    return [] // Let ConversationThread extract from spans
  }, [traceDetails, useMockData])

  // Clear selected ID when trace changes
  useEffect(() => {
    setSelectedId(null)
  }, [currentTraceId])
  const totalTraces = traces.length
  const reviewedCount = feedbackCounts.good + feedbackCounts.okay + feedbackCounts.bad
  const remainingCount = totalTraces - reviewedCount
  const progress = totalTraces > 0 ? (reviewedCount / totalTraces) * 100 : 0

  // Calculate remaining time (15 seconds per trace average)
  const estimatedSeconds = remainingCount * 15
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60)

  // Submit feedback mutation (only for real data)
  const submitFeedbackMutation = useMutation({
    mutationFn: async ({
      trace_id,
      rating,
      agent_id,
      notes,
    }: {
      trace_id: string
      rating: 'positive' | 'negative' | 'neutral'
      agent_id?: string  // Now optional
      notes?: string
    }) => {
      return apiClient.submitFeedback({
        trace_id,
        rating,
        agent_id,
        notes,
      })
    },
    onSuccess: (_, variables) => {
      const emoji = variables.rating === 'positive' ? '👍' : variables.rating === 'negative' ? '👎' : '😐'
      toast.success(`${emoji} Feedback submitted`, { duration: 1500 })
      queryClient.invalidateQueries({ queryKey: ['traces', 'review'] })
    },
    onError: () => {
      toast.error('Failed to submit feedback')
    },
  })

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleFeedback = useCallback((rating: 'good' | 'okay' | 'bad') => {
    if (!currentTrace) return

    const traceId = currentTrace.id

    // Update counts
    setFeedbackCounts(prev => ({
      ...prev,
      [rating]: prev[rating] + 1,
    }))

    // Add to reviewed set immediately to remove from display
    setReviewedTraceIds(prev => new Set(prev).add(traceId))

    // Submit to API if using real data
    // Use trace's agent_id (from agent_version), fallback to URL param, or omit if neither available
    const effectiveAgentId = currentTrace.agent_id || agentId || undefined
    if (!useMockData) {
      const apiRating = rating === 'good' ? 'positive' : rating === 'bad' ? 'negative' : 'neutral'
      submitFeedbackMutation.mutate({
        trace_id: traceId,
        rating: apiRating,
        agent_id: effectiveAgentId,  // Optional - will be undefined if no agent
        notes: notes.trim() || undefined,
      })
    } else {
      // Mock feedback toast
      const emoji = rating === 'good' ? '✅' : rating === 'bad' ? '❌' : '➖'
      toast.success(`${emoji} Marked as ${rating}`, { duration: 1500 })
    }

    // Clear notes
    setNotes('')

    // Trigger exit animation
    setIsTransitioning(true)

    setTimeout(() => {
      // Don't increment currentIndex - the trace is removed from the filtered list,
      // so the next trace will automatically appear at the current index.
      // Only adjust if currentIndex is now out of bounds (will be handled by the filtered list)
      // Trigger enter animation
      setTimeout(() => {
        setIsTransitioning(false)
      }, 50)
    }, 250)
  }, [currentTrace, notes, useMockData, agentId, submitFeedbackMutation])

  const toggleAutoMode = useCallback(() => {
    setIsAutoMode(prev => {
      const newValue = !prev
      toast.success(newValue ? '▶️ Auto mode enabled' : '⏸️ Auto mode paused', {
        duration: 1500,
      })
      return newValue
    })
  }, [])

  // ============================================================================
  // Effects
  // ============================================================================

  // Cleanup auto-advance timer
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current)
      }
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (e.key === '1') {
        e.preventDefault()
        handleFeedback('bad')
      } else if (e.key === '2') {
        e.preventDefault()
        handleFeedback('okay')
      } else if (e.key === '3') {
        e.preventDefault()
        handleFeedback('good')
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        toggleAutoMode()
      } else if (e.key === 'ArrowRight' && currentIndex < totalTraces - 1) {
        e.preventDefault()
        setCurrentIndex(prev => prev + 1)
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault()
        setCurrentIndex(prev => prev - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, totalTraces, handleFeedback, toggleAutoMode])

  // ============================================================================
  // Render States
  // ============================================================================

  // Loading state (only for real data)
  if (isLoadingList && !useMockData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Daily Quick Review</h1>
          <p className="text-muted-foreground">Loading traces...</p>
        </div>
        <TableSkeleton rows={3} />
      </div>
    )
  }

  // Error state
  if (listError && !useMockData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Daily Quick Review</h1>
        </div>
        <ErrorState
          title="Failed to load traces"
          message="There was an error loading traces for review. Please try again."
          error={listError as Error}
          onRetry={() => refetch()}
        />
      </div>
    )
  }

  // Completion state
  if (reviewedCount >= totalTraces) {
    const sessionDuration = sessionStartTimeRef.current
      ? Math.round((new Date().getTime() - sessionStartTimeRef.current.getTime()) / 1000)
      : 0
    const averageTimePerTrace = reviewedCount > 0 ? Math.round(sessionDuration / reviewedCount) : 0

    return (
      <div className="min-h-screen bg-card p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/agents')}
              className="bg-card"
            >
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Back
            </Button>
          </div>

          <div className="text-center bg-card rounded-xl shadow-elevation-2 p-12">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-foreground mb-2">Review Complete!</h2>
            <p className="text-muted-foreground mb-8">
              Great job! You have reviewed all {reviewedCount} traces
              {sessionDuration > 0 ? ` in ${Math.round(sessionDuration / 60)} minutes` : ''}
            </p>

            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-success/10 rounded-lg p-4 border-2 border-success/20">
                <div className="text-3xl mb-1">✅</div>
                <div className="text-2xl font-bold text-success">{feedbackCounts.good}</div>
                <div className="text-xs text-success">Good</div>
              </div>
              <div className="bg-warning/10 rounded-lg p-4 border-2 border-warning/20">
                <div className="text-3xl mb-1">➖</div>
                <div className="text-2xl font-bold text-warning">{feedbackCounts.okay}</div>
                <div className="text-xs text-warning">Okay</div>
              </div>
              <div className="bg-destructive/10 rounded-lg p-4 border-2 border-destructive/20">
                <div className="text-3xl mb-1">❌</div>
                <div className="text-2xl font-bold text-destructive">{feedbackCounts.bad}</div>
                <div className="text-xs text-destructive">Bad</div>
              </div>
              <div className="bg-info/10 rounded-lg p-4 border-2 border-info/20">
                <div className="text-3xl mb-1">⏱️</div>
                <div className="text-2xl font-bold text-info">{averageTimePerTrace}s</div>
                <div className="text-xs text-info">Avg/Trace</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4">
              <Button onClick={() => router.push('/agents')} className="bg-primary hover:bg-primary/80">
                View Agents
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()} className="bg-card">
                <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                Review More
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Main Review Interface
  // ============================================================================

  if (!currentTrace) {
    return (
      <div className="min-h-screen bg-card p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center bg-card rounded-xl shadow-elevation-2 p-12">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-bold text-foreground mb-2">No Traces Available</h2>
            <p className="text-muted-foreground mb-6">
              There are no traces to review at the moment.
            </p>
            <Button onClick={() => router.push('/agents')} className="bg-primary hover:bg-primary/80">
              Back to Agents
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const formatDate = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div className="h-screen bg-card flex flex-col overflow-hidden">
      {/* Compact Header - fixed height */}
      <div className="flex-none px-4 py-3 border-b bg-card/80 backdrop-blur">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/agents')}
                className="bg-card h-8 px-3"
              >
                <ArrowLeft className="w-3 h-3 mr-1" aria-hidden="true" />
                <span className="text-xs">Back</span>
              </Button>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                <h1 className="text-lg font-bold text-foreground">Daily Quick Review</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Progress Inline */}
              <div className="text-xs text-muted-foreground font-medium">
                <span className="text-primary font-bold">{reviewedCount}</span>/{totalTraces}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="bg-success/10 text-success px-2 py-0.5 rounded font-semibold">Good: {feedbackCounts.good}</span>
                <span className="bg-warning/10 text-warning px-2 py-0.5 rounded font-semibold">Okay: {feedbackCounts.okay}</span>
                <span className="bg-destructive/10 text-destructive px-2 py-0.5 rounded font-semibold">Bad: {feedbackCounts.bad}</span>
              </div>

              {/* Auto Mode Toggle */}
              <Button
                variant={isAutoMode ? "default" : "outline"}
                size="sm"
                onClick={toggleAutoMode}
                className={cn(
                  "h-8 px-3 text-xs",
                  isAutoMode && "bg-primary hover:bg-primary/80 text-white",
                  !isAutoMode && "bg-card"
                )}
              >
                {isAutoMode ? (
                  <>
                    <Pause className="w-3 h-3 mr-1" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 mr-1" aria-hidden="true" />
                    Auto
                  </>
                )}
              </Button>

              {/* Remaining Time */}
              <div className="bg-card px-3 py-1 rounded border border-border">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span className="font-semibold text-foreground">~{estimatedMinutes}m</span>
                </div>
              </div>

              {/* Mock Data Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUseMockData(!useMockData)}
                className={cn(
                  "bg-card text-xs h-8 px-3",
                  useMockData && "border-primary text-primary"
                )}
              >
                {useMockData ? 'Demo' : 'Live'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - flex container */}
      <div className="flex-1 overflow-auto px-4 py-3">
        <div className="max-w-5xl mx-auto h-full flex flex-col">
          {/* Trace Card with animation */}
          <div
            className={cn(
              "bg-card rounded-lg shadow-elevation-2 border border-border overflow-hidden transition-all duration-300 ease-out transform flex-1 flex flex-col",
              isTransitioning ? "opacity-0 scale-95 translate-x-4" : "opacity-100 scale-100 translate-x-0"
            )}
          >
            {/* Compact Card Header */}
            <div className="flex-none px-4 py-2 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span className="font-medium">{formatDate(currentTrace.timestamp)}</span>
                  <span>•</span>
                  <span>{formatDuration(currentTrace.duration_ms)}</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 bg-primary rounded-full">
                  <TrendingUp className="w-3 h-3 text-white" />
                  <span className="text-xs font-bold text-white">
                    {Math.round(currentTrace.score * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Card Body - Split Pane Layout */}
            <div className="flex-1 overflow-hidden p-4">
              <div className="grid grid-cols-12 gap-4 h-full">
                {/* Left Pane - Conversation Thread */}
                <div className="col-span-6 overflow-hidden flex flex-col">
                  <h2 className="text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Conversation</h2>
                  {(traceDetails?.spans && traceDetails.spans.length > 0) || messages.length > 0 ? (
                    <ConversationThread
                      spans={traceDetails?.spans}
                      messages={messages}
                      selectedId={selectedId || undefined}
                      onMessageClick={(id) => setSelectedId(id)}
                      onToolCallClick={(id) => setSelectedId(id)}
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center p-8">
                      <p className="text-sm text-muted-foreground text-center">
                        No conversation data available for this trace
                      </p>
                    </div>
                  )}
                </div>

                {/* Right Pane - Trace Explorer */}
                <div className="col-span-6 overflow-hidden">
                  <TraceExplorer
                    trace={traceDetails}
                    selectedId={selectedId || undefined}
                    onSelect={(id) => setSelectedId(id)}
                  />
                </div>
              </div>
            </div>

            {/* Quick Notes - collapsed at bottom */}
            <div className="flex-none px-4 py-2 border-t border-border bg-muted">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                placeholder="Quick notes (optional)..."
                className="w-full h-10 px-2 py-1 text-xs border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                maxLength={500}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Footer with Feedback Buttons */}
      <div className="flex-none px-4 py-2 border-t bg-card">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-3">
          <Button
            onClick={() => handleFeedback('bad')}
            disabled={submitFeedbackMutation.isPending}
            className="h-10 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            <kbd className="px-1.5 py-0.5 bg-black/20 rounded text-xs font-mono mr-2">1</kbd>
            Bad
          </Button>
          <Button
            onClick={() => handleFeedback('okay')}
            disabled={submitFeedbackMutation.isPending}
            className="h-10 bg-warning hover:bg-warning/90 text-warning-foreground"
          >
            <kbd className="px-1.5 py-0.5 bg-black/20 rounded text-xs font-mono mr-2">2</kbd>
            Okay
          </Button>
          <Button
            onClick={() => handleFeedback('good')}
            disabled={submitFeedbackMutation.isPending}
            className="h-10 bg-success hover:bg-success/90 text-success-foreground"
          >
            <kbd className="px-1.5 py-0.5 bg-black/20 rounded text-xs font-mono mr-2">3</kbd>
            Good
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main Export
// ============================================================================

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Daily Quick Review</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <TableSkeleton rows={3} />
      </div>
    }>
      <ReviewPageContent />
    </Suspense>
  )
}
