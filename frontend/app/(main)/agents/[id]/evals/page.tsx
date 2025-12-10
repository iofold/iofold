'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, CheckCircle, AlertCircle, Loader2, Trophy, FileCheck, Zap } from 'lucide-react'
import { formatPercentage } from '@/lib/utils'
import { toast } from 'sonner'

type Step = 1 | 2 | 3 | 4

interface EvalCandidate {
  id: string
  variation_type: string
  code: string
  created_at: string
  test_result?: {
    accuracy: number
    kappa: number
    f1_score: number
    test_results: {
      correct: number
      incorrect: number
      errors: number
      total: number
    }
  }
}

export default function EvalGenerationPage() {
  const params = useParams()
  const agentId = params.id as string
  const router = useRouter()
  const queryClient = useQueryClient()

  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [extractedTasks, setExtractedTasks] = useState<string[]>([])
  const [candidates, setCandidates] = useState<EvalCandidate[]>([])
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null)

  // Fetch agent details
  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => apiClient.getAgent(agentId),
  })

  // Fetch existing tasks
  const { data: tasksData } = useQuery({
    queryKey: ['agent-tasks', agentId],
    queryFn: () => apiClient.getTasks(agentId),
    retry: false,
  })

  // Fetch active eval
  const { data: activeEval, refetch: refetchActiveEval } = useQuery({
    queryKey: ['agent-active-eval', agentId],
    queryFn: () => apiClient.getActiveEval(agentId),
    retry: false,
  })

  // Step 1: Extract tasks
  const extractTasksMutation = useMutation({
    mutationFn: () => apiClient.extractTasks(agentId, { force: false }),
    onSuccess: (data) => {
      setExtractedTasks(data.tasks)
      queryClient.invalidateQueries({ queryKey: ['agent-tasks', agentId] })
      toast.success(`Extracted ${data.tasks.length} tasks`)
      setCurrentStep(2)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to extract tasks')
    },
  })

  // Step 2: Generate candidates
  const generateCandidatesMutation = useMutation({
    mutationFn: () => apiClient.generateEvalCandidates(agentId, { num_candidates: 5 }),
    onSuccess: (data) => {
      setCandidates(data.candidates.map(c => ({ ...c, test_result: undefined })))
      toast.success(`Generated ${data.candidates.length} eval candidates`)
      setCurrentStep(3)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to generate candidates')
    },
  })

  // Step 3: Test candidates
  const testCandidatesMutation = useMutation({
    mutationFn: () => apiClient.testEvalCandidates(agentId, candidates.map(c => c.id)),
    onSuccess: (data) => {
      const updatedCandidates = candidates.map(candidate => {
        const result = data.results.find(r => r.candidate_id === candidate.id)
        return {
          ...candidate,
          test_result: result ? {
            accuracy: result.accuracy,
            kappa: result.kappa,
            f1_score: result.f1_score,
            test_results: result.test_results,
          } : undefined,
        }
      })
      setCandidates(updatedCandidates)

      // Auto-select best candidate
      const best = updatedCandidates.reduce((prev, curr) => {
        if (!prev.test_result) return curr
        if (!curr.test_result) return prev
        return curr.test_result.accuracy > prev.test_result.accuracy ? curr : prev
      })
      setSelectedWinner(best.id)

      toast.success('Testing complete')
      setCurrentStep(4)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to test candidates')
    },
  })

  // Step 4: Activate winner
  const activateWinnerMutation = useMutation({
    mutationFn: (candidateId: string) => apiClient.selectEvalWinner(agentId, candidateId, { activate: true }),
    onSuccess: () => {
      toast.success('Eval activated successfully!')
      refetchActiveEval()
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
      setTimeout(() => router.push(`/agents/${agentId}`), 1500)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to activate eval')
    },
  })

  if (agentLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState
          title="Agent not found"
          message="The requested agent could not be loaded."
          onRetry={() => router.push('/agents')}
        />
      </div>
    )
  }

  const positiveFeedback = agent.metrics.positive_feedback_count
  const negativeFeedback = agent.metrics.negative_feedback_count
  const totalFeedback = agent.metrics.feedback_count
  const minRequired = 5
  const hasEnoughFeedback = positiveFeedback >= minRequired && negativeFeedback >= minRequired

  const stepProgress = (currentStep / 4) * 100

  const bestCandidate = candidates.find(c => c.id === selectedWinner)

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/agents/${agentId}`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Agent
          </Button>
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Eval Generation</h1>
            <p className="text-muted-foreground">Generate and test eval candidates for {agent.name}</p>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Step {currentStep} of 4</span>
              <span className="text-sm text-muted-foreground">{Math.round(stepProgress)}% Complete</span>
            </div>
            <Progress value={stepProgress} />

            <div className="grid grid-cols-4 gap-4 mt-6">
              {[
                { step: 1, label: 'Extract Tasks', icon: FileCheck },
                { step: 2, label: 'Generate Candidates', icon: Zap },
                { step: 3, label: 'Test Candidates', icon: CheckCircle },
                { step: 4, label: 'Select Winner', icon: Trophy },
              ].map(({ step, label, icon: Icon }) => (
                <div
                  key={step}
                  className={`flex flex-col items-center text-center p-3 rounded-lg transition-colors ${
                    currentStep === step
                      ? 'bg-primary/10 text-primary'
                      : currentStep > step
                      ? 'bg-success/10 text-success'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-2" />
                  <span className="text-xs font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Task Extraction */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">
              1
            </span>
            Extract Tasks
          </CardTitle>
          <CardDescription>
            Analyze traces to extract the tasks your agent performs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Trace Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Total Traces</div>
                <div className="text-2xl font-bold">{agent.metrics.trace_count}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Labeled Traces</div>
                <div className="text-2xl font-bold">{totalFeedback}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Required</div>
                <div className="text-2xl font-bold">{minRequired}</div>
              </div>
            </div>

            {/* Feedback Breakdown */}
            <div className="flex gap-4">
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                {positiveFeedback} Positive
              </Badge>
              <Badge variant="error" className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {negativeFeedback} Negative
              </Badge>
            </div>

            {!hasEnoughFeedback && (
              <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-warning">Need more labeled traces</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      You need at least {minRequired} positive and {minRequired} negative examples.
                      Current: {positiveFeedback} positive, {negativeFeedback} negative.
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={() => extractTasksMutation.mutate()}
              disabled={!hasEnoughFeedback || extractTasksMutation.isPending}
              className="w-full"
            >
              {extractTasksMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extracting Tasks...
                </>
              ) : (
                'Extract Tasks'
              )}
            </Button>

            {/* Extracted Tasks */}
            {(extractedTasks.length > 0 || tasksData?.tasks?.length) && (
              <div className="mt-4">
                <h4 className="font-medium mb-2">Extracted Tasks</h4>
                <div className="space-y-2">
                  {(extractedTasks.length > 0 ? extractedTasks : tasksData?.tasks || []).map((task: any, idx) => (
                    <div key={task.id || idx} className="p-3 bg-muted rounded-lg text-sm">
                      {typeof task === 'string' ? task : task.task?.user_message || JSON.stringify(task)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Generate Candidates */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">
              2
            </span>
            Generate Eval Candidates
          </CardTitle>
          <CardDescription>
            Generate multiple eval function variations using different prompting strategies
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {currentStep < 2 && (
              <div className="text-sm text-muted-foreground">
                Complete Step 1 to unlock this step
              </div>
            )}

            {currentStep >= 2 && (
              <>
                <Button
                  onClick={() => generateCandidatesMutation.mutate()}
                  disabled={generateCandidatesMutation.isPending}
                  className="w-full"
                >
                  {generateCandidatesMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating Candidates...
                    </>
                  ) : (
                    'Generate 5 Candidates'
                  )}
                </Button>

                {candidates.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Generated Candidates</h4>
                    <div className="space-y-2">
                      {candidates.map((candidate, idx) => (
                        <div key={candidate.id} className="p-3 bg-muted rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Candidate {idx + 1}</span>
                            <Badge variant="outline">{candidate.variation_type}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Test Candidates */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">
              3
            </span>
            Test Candidates
          </CardTitle>
          <CardDescription>
            Run all candidates against labeled traces to measure performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {currentStep < 3 && (
              <div className="text-sm text-muted-foreground">
                Complete Step 2 to unlock this step
              </div>
            )}

            {currentStep >= 3 && candidates.length > 0 && (
              <>
                <Button
                  onClick={() => testCandidatesMutation.mutate()}
                  disabled={testCandidatesMutation.isPending || currentStep > 3}
                  className="w-full"
                >
                  {testCandidatesMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing All Candidates...
                    </>
                  ) : (
                    'Test All Candidates'
                  )}
                </Button>

                {currentStep >= 4 && candidates.some(c => c.test_result) && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-3">Test Results</h4>
                    <div className="space-y-3">
                      {candidates
                        .filter(c => c.test_result)
                        .sort((a, b) => (b.test_result?.accuracy || 0) - (a.test_result?.accuracy || 0))
                        .map((candidate, idx) => (
                          <div
                            key={candidate.id}
                            className={`p-4 rounded-lg border-2 transition-all ${
                              candidate.id === selectedWinner
                                ? 'border-success bg-success/5'
                                : 'border-border bg-muted/50'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Candidate {candidates.indexOf(candidate) + 1}</span>
                                {idx === 0 && (
                                  <Badge variant="success" className="flex items-center gap-1">
                                    <Trophy className="w-3 h-3" />
                                    Best
                                  </Badge>
                                )}
                                <Badge variant="outline">{candidate.variation_type}</Badge>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-sm">
                              <div>
                                <div className="text-muted-foreground">Accuracy</div>
                                <div className="font-bold text-lg">
                                  {formatPercentage(candidate.test_result!.accuracy)}
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Kappa</div>
                                <div className="font-bold text-lg">
                                  {candidate.test_result!.kappa.toFixed(3)}
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">F1 Score</div>
                                <div className="font-bold text-lg">
                                  {candidate.test_result!.f1_score.toFixed(3)}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 text-xs text-muted-foreground">
                              {candidate.test_result!.test_results.correct} correct, {candidate.test_result!.test_results.incorrect} incorrect, {candidate.test_result!.test_results.errors} errors
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 4: Select Winner */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">
              4
            </span>
            Select Winner
          </CardTitle>
          <CardDescription>
            Review the best candidate and activate it as your agent&apos;s eval
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {currentStep < 4 && (
              <div className="text-sm text-muted-foreground">
                Complete Step 3 to unlock this step
              </div>
            )}

            {currentStep >= 4 && bestCandidate && bestCandidate.test_result && (
              <>
                <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Trophy className="w-6 h-6 text-success flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <div className="font-medium text-success mb-1">Recommended Winner</div>
                      <div className="text-sm text-muted-foreground mb-3">
                        Candidate {candidates.indexOf(bestCandidate) + 1} ({bestCandidate.variation_type})
                        achieved the highest accuracy of {formatPercentage(bestCandidate.test_result.accuracy)}
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <div className="text-muted-foreground">Accuracy</div>
                          <div className="font-bold">
                            {formatPercentage(bestCandidate.test_result.accuracy)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Kappa</div>
                          <div className="font-bold">
                            {bestCandidate.test_result.kappa.toFixed(3)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">F1 Score</div>
                          <div className="font-bold">
                            {bestCandidate.test_result.f1_score.toFixed(3)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => selectedWinner && activateWinnerMutation.mutate(selectedWinner)}
                  disabled={!selectedWinner || activateWinnerMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {activateWinnerMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Activating...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Activate This Eval
                    </>
                  )}
                </Button>
              </>
            )}

            {/* Show active eval if exists */}
            {activeEval && (
              <div className="mt-6 p-4 bg-info/10 border border-info/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-info" />
                  <span className="font-medium text-info">Currently Active Eval</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  <div>{activeEval.name}</div>
                  <div className="mt-1">Accuracy: {formatPercentage(activeEval.accuracy)}</div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
