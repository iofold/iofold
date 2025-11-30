'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface CreateAgentVersionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
}

export function CreateAgentVersionModal({ open, onOpenChange, agentId }: CreateAgentVersionModalProps) {
  const [promptTemplate, setPromptTemplate] = useState('')
  const [variablesInput, setVariablesInput] = useState('')
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: { prompt_template: string; variables?: string[] }) =>
      apiClient.createAgentVersion(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
      toast.success('Version created')
      onOpenChange(false)
      setPromptTemplate('')
      setVariablesInput('')
    },
    onError: () => {
      toast.error('Failed to create version')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Parse variables from comma-separated input
    const variables = variablesInput
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)

    createMutation.mutate({
      prompt_template: promptTemplate,
      variables: variables.length > 0 ? variables : undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Version</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="prompt_template">Prompt Template</Label>
              <Textarea
                id="prompt_template"
                name="prompt_template"
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                placeholder="Enter your prompt template here..."
                rows={10}
                required
                autoFocus
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use variables like {'{variable_name}'} in your prompt
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="variables">Variables (optional)</Label>
              <Input
                id="variables"
                name="variables"
                value={variablesInput}
                onChange={(e) => setVariablesInput(e.target.value)}
                placeholder="variable1, variable2, variable3"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of variable names used in the template
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} loading={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Version'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
