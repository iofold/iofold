'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EvalTable } from '@/components/evals/eval-table'
import { EvalSideSheet } from '@/components/evals/eval-side-sheet'
import { GenerateEvalModal } from '@/components/modals/GenerateEvalModal'
import { RefreshCw, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Eval } from '@/types/api'

export default function EvalsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // State
  const [selectedEval, setSelectedEval] = useState<Eval | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch evals
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['evals', agentFilter],
    queryFn: () =>
      apiClient.listEvals({
        agent_id: agentFilter === 'all' ? undefined : agentFilter,
        limit: 100,
      }),
  })

  // Fetch agents for filter dropdown
  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.listAgents(),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (evalId: string) => apiClient.deleteEval(evalId),
    onSuccess: () => {
      toast.success('Eval deleted')
      queryClient.invalidateQueries({ queryKey: ['evals'] })
      setSheetOpen(false)
      setSelectedEval(null)
    },
    onError: () => {
      toast.error('Failed to delete eval')
    },
  })

  // Filter evals by search query
  const filteredEvals = (data?.evals || []).filter((evalItem) =>
    searchQuery
      ? evalItem.name.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  )

  // Handle row selection
  const handleSelect = (evalItem: Eval) => {
    setSelectedEval(evalItem)
    setSheetOpen(true)
    // Update URL without navigation
    router.replace(`/evals?selected=${evalItem.id}`, { scroll: false })
  }

  // Handle sheet close
  const handleSheetClose = (open: boolean) => {
    setSheetOpen(open)
    if (!open) {
      router.replace('/evals', { scroll: false })
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Evals</h1>
          <p className="text-muted-foreground">
            Manage evaluation functions for your agents
          </p>
        </div>
        {agentsData?.agents && agentsData.agents.length > 0 && (
          <GenerateEvalModal agentId={agentsData.agents[0].id}>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Generate Eval
            </Button>
          </GenerateEvalModal>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search evals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agentsData?.agents?.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Table */}
      <EvalTable
        evals={filteredEvals}
        selectedId={selectedEval?.id || null}
        onSelect={handleSelect}
        isLoading={isLoading}
      />

      {/* Side Sheet */}
      <EvalSideSheet
        evalItem={selectedEval}
        open={sheetOpen}
        onOpenChange={handleSheetClose}
        onDelete={(id) => deleteMutation.mutate(id)}
      />
    </div>
  )
}
