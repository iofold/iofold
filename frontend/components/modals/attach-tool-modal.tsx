'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { Check, Loader2 } from 'lucide-react'
import type { Tool } from '@/types/agent'

interface AttachToolModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
  attachedToolIds: string[]
}

// Category badge color mapping (same as agent detail page)
const categoryColors: Record<string, 'default' | 'secondary' | 'outline' | 'success' | 'warning'> = {
  general: 'secondary',
  code: 'default',
  filesystem: 'warning',
  email: 'success',
}

export function AttachToolModal({
  open,
  onOpenChange,
  agentId,
  attachedToolIds,
}: AttachToolModalProps) {
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Query all tools
  const { data: toolsData, isLoading: loadingTools } = useQuery({
    queryKey: ['tools'],
    queryFn: () => apiClient.listTools(),
    enabled: open,
  })

  // Filter out already attached tools
  const availableTools = toolsData?.tools.filter(
    (tool) => !attachedToolIds.includes(tool.id)
  ) || []

  // Attach mutation
  const attachMutation = useMutation({
    mutationFn: (toolId: string) =>
      apiClient.attachToolToAgent(agentId, toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
      toast.success('Tool attached successfully')
      setSelectedToolId(null)
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to attach tool')
    },
  })

  const handleAttach = () => {
    if (selectedToolId) {
      attachMutation.mutate(selectedToolId)
    }
  }

  const handleCancel = () => {
    setSelectedToolId(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Attach Tool to Agent</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[400px] overflow-y-auto py-4 px-6">
          {loadingTools ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableTools.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {attachedToolIds.length > 0
                ? 'All available tools are already attached to this agent.'
                : 'No tools available to attach.'}
            </div>
          ) : (
            <div className="space-y-2">
              {availableTools.map((tool) => (
                <Card
                  key={tool.id}
                  className={`p-4 cursor-pointer transition-all hover:border-primary ${
                    selectedToolId === tool.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border'
                  }`}
                  onClick={() => setSelectedToolId(tool.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm">{tool.name}</h4>
                        <Badge
                          variant={categoryColors[tool.category] || 'secondary'}
                          className="text-xs"
                        >
                          {tool.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {tool.description}
                      </p>
                    </div>
                    {selectedToolId === tool.id && (
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={attachMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAttach}
            disabled={!selectedToolId || attachMutation.isPending}
          >
            {attachMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Attaching...
              </>
            ) : (
              'Attach'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
