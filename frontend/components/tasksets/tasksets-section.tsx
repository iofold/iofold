'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Database, Trash2, ChevronRight, Loader2, ExternalLink } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { CreateTasksetModal } from '@/components/modals/create-taskset-modal'
import type { Taskset } from '@/types/taskset'
import { formatRelativeTime } from '@/lib/utils'

interface TasksetsSectionProps {
  agentId: string
}

export function TasksetsSection({ agentId }: TasksetsSectionProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['agent-tasksets', agentId],
    queryFn: () => apiClient.listTasksets(agentId),
  })

  const archiveMutation = useMutation({
    mutationFn: (tasksetId: string) => apiClient.archiveTaskset(agentId, tasksetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-tasksets', agentId] })
      toast.success('Taskset archived')
    },
    onError: () => {
      toast.error('Failed to archive taskset')
    },
  })

  const handleArchive = (tasksetId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to archive this taskset?')) {
      archiveMutation.mutate(tasksetId)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Tasksets
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Manage evaluation tasks for this agent
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <Link href={`/agents/${agentId}/tasksets`}>
                  View All
                  <ExternalLink className="w-3 h-3 ml-2" />
                </Link>
              </Button>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Taskset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !data || data.tasksets.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-lg">
              <Database className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2 font-medium">
                No tasksets yet
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Create your first taskset to begin evaluating this agent
              </p>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Taskset
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {data.tasksets.map((taskset: Taskset) => (
                <Link
                  key={taskset.id}
                  href={`/agents/${agentId}/tasksets/${taskset.id}`}
                >
                  <Card className="p-5 cursor-pointer hover:bg-accent/50 hover:shadow-md transition-all duration-200 border border-border">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-base">{taskset.name}</h3>
                          {taskset.task_count > 0 && (
                            <Badge variant="default" className="text-xs bg-green-500 hover:bg-green-600">
                              Active
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {taskset.task_count} tasks
                          </Badge>
                        </div>
                        {taskset.description && (
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {taskset.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Created {formatRelativeTime(taskset.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleArchive(taskset.id, e)}
                          disabled={archiveMutation.isPending}
                          className="h-8 w-8 p-0"
                          aria-label="Archive taskset"
                        >
                          {archiveMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateTasksetModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        agentId={agentId}
      />
    </>
  )
}
