'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Database, Trash2, ChevronRight, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { CreateTasksetModal } from '@/components/modals/create-taskset-modal'
import { ViewTasksetModal } from '@/components/modals/view-taskset-modal'
import type { Taskset } from '@/types/taskset'

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString()
}

interface TasksetsSectionProps {
  agentId: string
}

export function TasksetsSection({ agentId }: TasksetsSectionProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [selectedTasksetId, setSelectedTasksetId] = useState<string | null>(null)
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

  const handleViewTaskset = (tasksetId: string) => {
    setSelectedTasksetId(tasksetId)
    setViewModalOpen(true)
  }

  const handleArchive = (tasksetId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to archive this taskset?')) {
      archiveMutation.mutate(tasksetId)
    }
  }

  const truncateText = (text: string | null, maxLength: number = 100): string => {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Tasksets
            </CardTitle>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Taskset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !data || data.tasksets.length === 0 ? (
            <div className="text-center py-8">
              <Database className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">
                No tasksets yet. Create one to start training your agent.
              </p>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Taskset
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {data.tasksets.map((taskset: Taskset) => (
                <Card
                  key={taskset.id}
                  className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => handleViewTaskset(taskset.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm">{taskset.name}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {taskset.task_count} tasks
                        </Badge>
                      </div>
                      {taskset.description && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {truncateText(taskset.description, 120)}
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

      <ViewTasksetModal
        open={viewModalOpen}
        onOpenChange={setViewModalOpen}
        agentId={agentId}
        tasksetId={selectedTasksetId}
      />
    </>
  )
}
