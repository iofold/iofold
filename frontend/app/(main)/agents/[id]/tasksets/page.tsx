'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@/hooks/use-router-with-progress'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Badge } from '@/components/ui/badge'
import { Skeleton, CardSkeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ArrowLeft, Plus, Archive, CheckCircle, ListChecks, Activity, Layers, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { formatRelativeTime } from '@/lib/utils'
import { CreateTasksetModal } from '@/components/modals/create-taskset-modal'

export default function TasksetsPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const agentId = params.id as string
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // Fetch agent details
  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => apiClient.getAgent(agentId),
  })

  // Fetch tasksets
  const { data: tasksetsData, isLoading: tasksetsLoading, error: tasksetsError } = useQuery({
    queryKey: ['agent-tasksets', agentId],
    queryFn: () => apiClient.listTasksets(agentId, { include_archived: false }),
  })

  // Archive taskset mutation
  const archiveTasksetMutation = useMutation({
    mutationFn: (tasksetId: string) => apiClient.archiveTaskset(agentId, tasksetId),
    onSuccess: () => {
      toast.success('Taskset archived successfully')
      queryClient.invalidateQueries({ queryKey: ['agent-tasksets', agentId] })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to archive taskset')
    },
  })

  if (agentLoading || tasksetsLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-16 w-full max-w-2xl" />
          <div className="grid gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-full max-w-lg" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-9 w-28" />
                      <Skeleton className="h-9 w-9" />
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (tasksetsError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState message="Failed to load tasksets" />
      </div>
    )
  }

  const tasksets = tasksetsData?.tasksets || []

  // Calculate stats
  const totalTasksets = tasksets.length
  const totalTasks = tasksets.reduce((sum, ts) => sum + ts.task_count, 0)
  const activeTasksets = tasksets.filter(ts => ts.status === 'active').length

  return (
    <TooltipProvider>
      <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="mb-8">
          <Link href={`/agents/${agentId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Agent
            </Button>
          </Link>
        </div>

        {/* Page Header with improved spacing */}
        <div className="mb-8 pb-6 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                {agent?.name} - Tasksets
              </h1>
              <p className="text-muted-foreground">
                Manage and organize test case collections for systematic agent evaluation
              </p>
            </div>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Taskset
            </Button>
          </div>
        </div>

        {/* Stats Section */}
        {tasksets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Layers className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Tasksets</p>
                  <p className="text-2xl font-bold">{totalTasksets}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ListChecks className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Tasks</p>
                  <p className="text-2xl font-bold">{totalTasks}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold">{activeTasksets}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Empty State */}
        {tasksets.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="py-16">
              <div className="text-center space-y-6 max-w-md mx-auto">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 bg-primary/5 rounded-full" />
                  </div>
                  <ListChecks className="w-16 h-16 mx-auto text-muted-foreground relative z-10" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">No tasksets yet</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Start organizing your agent evaluation by creating a taskset.
                    Tasksets help you group related test cases together for systematic testing.
                  </p>
                </div>
                <Button onClick={() => setCreateModalOpen(true)} size="lg">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Taskset
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Taskset List */
          <div className="grid gap-4">
            {tasksets.map((taskset) => (
              <Link
                key={taskset.id}
                href={`/agents/${agentId}/tasksets/${taskset.id}`}
                className="block group"
              >
                <Card className="shadow-sm hover:shadow-md hover:border-primary/50 transition-all duration-200 cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-xl group-hover:text-primary transition-colors">
                            {taskset.name}
                          </CardTitle>
                          <Badge variant="secondary" className="text-xs">
                            <ListChecks className="w-3 h-3 mr-1" />
                            {taskset.task_count} tasks
                          </Badge>
                          {taskset.status === 'active' && (
                            <Badge variant="secondary" className="bg-success/10 text-success text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Active
                            </Badge>
                          )}
                        </div>
                        {taskset.description && (
                          <CardDescription className="mt-2 line-clamp-2">
                            {taskset.description}
                          </CardDescription>
                        )}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
                          <Clock className="w-4 h-4" />
                          <span>Created {formatRelativeTime(taskset.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4" onClick={(e) => e.preventDefault()}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (confirm(`Archive taskset "${taskset.name}"?`)) {
                                  archiveTasksetMutation.mutate(taskset.id)
                                }
                              }}
                              disabled={archiveTasksetMutation.isPending}
                              aria-label="Archive taskset"
                            >
                              <Archive className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Archive this taskset</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <CreateTasksetModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          agentId={agentId}
        />
      </div>
    </TooltipProvider>
  )
}
