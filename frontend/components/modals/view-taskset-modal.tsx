'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Plus, ExternalLink, FileText } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import Link from 'next/link'
import type { TasksetTask } from '@/types/taskset'

const sourceColors: Record<string, string> = {
  trace: 'bg-blue-100 text-blue-800',
  manual: 'bg-green-100 text-green-800',
  imported: 'bg-purple-100 text-purple-800',
}

interface ViewTasksetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
  tasksetId: string | null
}

export function ViewTasksetModal({
  open,
  onOpenChange,
  agentId,
  tasksetId,
}: ViewTasksetModalProps) {
  const { data: taskset, isLoading } = useQuery({
    queryKey: ['taskset', agentId, tasksetId],
    queryFn: () => apiClient.getTaskset(agentId, tasksetId!),
    enabled: open && !!tasksetId,
  })

  const truncateText = (text: string, maxLength: number = 100) => {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'archived':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Taskset Details</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 flex-1">
            <div className="space-y-2">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-24" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        ) : taskset ? (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Metadata Section */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{taskset.name}</h3>
                  {taskset.description && (
                    <p className="text-sm text-gray-600 mt-1">
                      {taskset.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(taskset.status)}>
                    {taskset.status}
                  </Badge>
                  <Badge variant="outline">
                    {taskset.tasks?.length || 0} tasks
                  </Badge>
                </div>
                {taskset.created_at && (
                  <span>Created {formatDate(taskset.created_at)}</span>
                )}
              </div>
            </div>

            {/* Tasks List */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <h4 className="text-sm font-medium mb-2">Tasks</h4>
              {!taskset.tasks || taskset.tasks.length === 0 ? (
                <div className="flex items-center justify-center h-32 border rounded-lg bg-gray-50">
                  <div className="text-center text-gray-500">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No tasks in this taskset</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 border rounded-lg overflow-y-auto max-h-[300px]">
                  <div className="p-4 space-y-3">
                    {taskset.tasks.map((task: TasksetTask, index: number) => (
                      <Card key={task.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono text-gray-500">
                                #{index + 1}
                              </span>
                              <Badge
                                className={
                                  sourceColors[task.source] ||
                                  'bg-gray-100 text-gray-800'
                                }
                              >
                                {task.source}
                              </Badge>
                            </div>
                            <div className="space-y-1">
                              <div>
                                <span className="text-xs font-medium text-gray-600">
                                  Input:
                                </span>
                                <p className="text-sm mt-0.5">
                                  {truncateText(task.user_message, 150)}
                                </p>
                              </div>
                              {task.expected_output && (
                                <div>
                                  <span className="text-xs font-medium text-gray-600">
                                    Expected:
                                  </span>
                                  <p className="text-sm text-gray-600 mt-0.5">
                                    {truncateText(task.expected_output, 100)}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                          {task.source_trace_id && (
                            <Link
                              href={`/agents/${agentId}/traces/${task.source_trace_id}`}
                              target="_blank"
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-32">
            <p className="text-gray-500">Taskset not found</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={!taskset}>
            <Plus className="h-4 w-4 mr-2" />
            Add Tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
