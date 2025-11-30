'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { AgentVersion } from '@/types/agent'
import { MatrixRow } from '@/types/api'
import { Button } from '@/components/ui/button'
import { AgentVersionOverview } from '@/components/matrix/agent-version-overview'
import { TraceEvaluationDetails } from '@/components/matrix/trace-evaluation-details'
import { FilterControls } from '@/components/matrix/filter-controls'
import { ResolutionActions } from '@/components/matrix/resolution-actions'
import { ComparisonPanel } from '@/components/matrix/comparison-panel'
import { ArrowLeft, Download, Zap } from 'lucide-react'

type ViewMode = 'overview' | 'details'
type ContradictionFilter = 'all' | 'contradictions-only' | 'agreements-only'
type SeverityFilter = 'all' | 'high' | 'medium' | 'low'

export default function MatrixPage() {
  const params = useParams()
  const router = useRouter()
  const agentId = params.agent_id as string

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [selectedVersion, setSelectedVersion] = useState<AgentVersion | null>(null)

  // Filter state
  const [contradictionFilter, setContradictionFilter] = useState<ContradictionFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  // Selection state
  const [selectedTraces, setSelectedTraces] = useState<string[]>([])
  const [selectedContradiction, setSelectedContradiction] = useState<MatrixRow | null>(null)

  // Fetch agent details with versions
  const { data: agentData, isLoading: agentLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => apiClient.getAgent(agentId)
  })

  // Fetch agent versions
  const { data: versionsData } = useQuery({
    queryKey: ['agent-versions', agentId],
    queryFn: () => apiClient.listAgentVersions(agentId),
    enabled: !!agentId
  })

  // Fetch matrix data
  const { data: matrixData, isLoading: matrixLoading } = useQuery({
    queryKey: ['matrix', agentId, contradictionFilter],
    queryFn: () => apiClient.getMatrix(agentId, {
      filter: contradictionFilter === 'all' ? undefined :
             contradictionFilter === 'contradictions-only' ? 'contradictions_only' : 'all',
      limit: 100
    })
  })

  // Filter matrix rows based on current filters
  const filteredMatrixRows = (matrixData?.rows || []).filter((row) => {
    // Apply contradiction filter
    if (contradictionFilter === 'contradictions-only') {
      const hasContradiction = Object.values(row.predictions).some(p => p?.is_contradiction)
      if (!hasContradiction) return false
    } else if (contradictionFilter === 'agreements-only') {
      const hasContradiction = Object.values(row.predictions).some(p => p?.is_contradiction)
      if (hasContradiction) return false
    }

    // Apply date filters
    if (dateFrom && new Date(row.trace_summary.timestamp) < new Date(dateFrom)) {
      return false
    }
    if (dateTo && new Date(row.trace_summary.timestamp) > new Date(dateTo)) {
      return false
    }

    return true
  })

  // Filter for selected version in details view
  const versionFilteredRows = selectedVersion
    ? filteredMatrixRows.filter(row => row.predictions[selectedVersion.id])
    : filteredMatrixRows

  // Calculate statistics
  const totalTraces = filteredMatrixRows.length
  const totalContradictions = filteredMatrixRows.filter(row =>
    Object.values(row.predictions).some(p => p?.is_contradiction)
  ).length
  const contradictionRate = totalTraces > 0
    ? Math.round((totalContradictions / totalTraces) * 100)
    : 0

  // Handlers
  const handleVersionClick = (version: AgentVersion) => {
    setSelectedVersion(version)
    setViewMode('details')
    setSelectedTraces([])
    setSelectedContradiction(null)
  }

  const handleBackToOverview = () => {
    setSelectedVersion(null)
    setViewMode('overview')
    setSelectedTraces([])
    setSelectedContradiction(null)
  }

  const handleTraceSelection = (traceId: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedTraces(prev => [...prev, traceId])
    } else {
      setSelectedTraces(prev => prev.filter(id => id !== traceId))
    }
  }

  const handleBulkSelection = (selectAll: boolean) => {
    if (selectAll) {
      setSelectedTraces(versionFilteredRows.map(row => row.trace_id))
    } else {
      setSelectedTraces([])
    }
  }

  const handleContradictionClick = (trace: MatrixRow) => {
    setSelectedContradiction(trace)
  }

  const handleRefineEval = () => {
    // Navigate to eval generation page or open modal
    console.log('Refining eval with selected traces:', selectedTraces)
    // TODO: Implement eval refinement workflow
  }

  const handleBulkResolve = async () => {
    console.log('Bulk resolving contradictions for traces:', selectedTraces)
    // TODO: Implement bulk resolution API call
    setSelectedTraces([])
  }

  const handleExportMatrix = () => {
    const dataToExport = {
      matrixData: filteredMatrixRows,
      statistics: {
        totalTraces,
        totalContradictions,
        contradictionRate
      },
      filters: {
        contradictionFilter,
        severityFilter,
        dateFrom,
        dateTo
      },
      timestamp: new Date().toISOString()
    }

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matrix-export-${agentId}-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (agentLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">Loading agent data...</div>
      </div>
    )
  }

  const versions = versionsData?.versions || []

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {viewMode === 'details' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToOverview}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Overview
              </Button>
            )}
            {viewMode === 'overview' && (
              <Link href={`/agents/${agentId}`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Agent
                </Button>
              </Link>
            )}
            <div>
              <h1 className="text-3xl font-bold mb-2">
                {viewMode === 'overview'
                  ? 'Agent Version Performance Overview'
                  : `Version ${selectedVersion?.version} - Trace Analysis`}
              </h1>
              <p className="text-muted-foreground">
                {viewMode === 'overview'
                  ? 'Compare evaluation scores across different agent versions'
                  : 'Detailed per-trace evaluation outputs and contradictions'}
              </p>
            </div>
          </div>

          {viewMode === 'details' && (
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" onClick={handleExportMatrix}>
                <Download className="w-4 h-4" />
                <span className="ml-2">Export Data</span>
              </Button>

              <Button
                size="sm"
                onClick={handleRefineEval}
                disabled={selectedTraces.length === 0}
              >
                <Zap className="w-4 h-4" />
                <span className="ml-2">Refine Eval</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      {viewMode === 'overview' ? (
        /* STEP 1: Agent Version Overview */
        <AgentVersionOverview
          versions={versions}
          matrixData={filteredMatrixRows}
          onVersionClick={handleVersionClick}
        />
      ) : (
        /* STEP 2: Trace Evaluation Details */
        <>
          {/* Statistics Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-card rounded-lg border p-4">
              <div className="text-2xl font-bold text-foreground">{versionFilteredRows.length}</div>
              <div className="text-sm text-muted-foreground">Total Traces</div>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <div className="text-2xl font-bold text-red-600">{totalContradictions}</div>
              <div className="text-sm text-muted-foreground">Contradictions</div>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <div className="text-2xl font-bold text-yellow-600">{contradictionRate}%</div>
              <div className="text-sm text-muted-foreground">Contradiction Rate</div>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <div className="text-2xl font-bold text-green-600">{selectedTraces.length}</div>
              <div className="text-sm text-muted-foreground">Selected for Refinement</div>
            </div>
          </div>

          {/* Main Content - Split Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Side - Trace Details (8 columns) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Filter Controls */}
              <FilterControls
                contradictionFilter={contradictionFilter}
                setContradictionFilter={setContradictionFilter}
                severityFilter={severityFilter}
                setSeverityFilter={setSeverityFilter}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
                onBulkSelection={handleBulkSelection}
                selectedCount={selectedTraces.length}
                totalCount={versionFilteredRows.length}
              />

              {/* Trace Evaluation Details */}
              {selectedVersion && (
                <TraceEvaluationDetails
                  data={versionFilteredRows}
                  version={selectedVersion}
                  selectedTraces={selectedTraces}
                  onTraceSelection={handleTraceSelection}
                  onContradictionClick={handleContradictionClick}
                />
              )}

              {/* Bulk Actions */}
              {selectedTraces.length > 0 && (
                <ResolutionActions
                  selectedCount={selectedTraces.length}
                  onBulkResolve={handleBulkResolve}
                  onRefineEval={handleRefineEval}
                  onClearSelection={() => setSelectedTraces([])}
                />
              )}
            </div>

            {/* Right Side - Comparison Panel (4 columns) */}
            <div className="lg:col-span-4">
              <ComparisonPanel
                selectedContradiction={selectedContradiction}
                versions={versions}
                onRefineEval={handleRefineEval}
              />
            </div>
          </div>
        </>
      )}

      {/* Loading State */}
      {matrixLoading && (
        <div className="text-center py-12">
          <div className="text-muted-foreground">Loading matrix data...</div>
        </div>
      )}
    </div>
  )
}
