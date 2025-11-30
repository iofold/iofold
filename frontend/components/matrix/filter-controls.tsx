'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, Filter } from 'lucide-react'

interface FilterControlsProps {
  contradictionFilter: 'all' | 'contradictions-only' | 'agreements-only'
  setContradictionFilter: (filter: 'all' | 'contradictions-only' | 'agreements-only') => void
  severityFilter: 'all' | 'high' | 'medium' | 'low'
  setSeverityFilter: (filter: 'all' | 'high' | 'medium' | 'low') => void
  dateFrom?: string
  setDateFrom?: (date: string) => void
  dateTo?: string
  setDateTo?: (date: string) => void
  onBulkSelection: (selectAll: boolean) => void
  selectedCount: number
  totalCount: number
}

export function FilterControls({
  contradictionFilter,
  setContradictionFilter,
  severityFilter,
  setSeverityFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  onBulkSelection,
  selectedCount,
  totalCount
}: FilterControlsProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 gap-4">
          {/* Left Side - Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Contradiction Filter */}
            <div className="flex items-center space-x-2">
              <Filter size={16} className="text-muted-foreground" />
              <select
                value={contradictionFilter}
                onChange={(e) => setContradictionFilter(e.target.value as any)}
                className="px-3 py-2 text-sm border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Traces</option>
                <option value="contradictions-only">Contradictions Only</option>
                <option value="agreements-only">Agreements Only</option>
              </select>
            </div>

            {/* Severity Filter */}
            <div className="flex items-center space-x-2">
              <AlertCircle size={16} className="text-muted-foreground" />
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as any)}
                className="px-3 py-2 text-sm border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Severity</option>
                <option value="high">High Severity</option>
                <option value="medium">Medium Severity</option>
                <option value="low">Low Severity</option>
              </select>
            </div>

            {/* Date Range Filters (Optional) */}
            {setDateFrom && setDateTo && (
              <>
                <div className="flex items-center space-x-2">
                  <label className="text-xs text-muted-foreground">From:</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-xs text-muted-foreground">To:</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </>
            )}
          </div>

          {/* Right Side - Selection Actions */}
          <div className="flex items-center space-x-3">
            <div className="text-sm text-muted-foreground">
              {selectedCount > 0 ? (
                <span className="font-medium text-primary">
                  {selectedCount} of {totalCount} selected
                </span>
              ) : (
                <span>{totalCount} traces</span>
              )}
            </div>

            <div className="h-4 w-px bg-border" />

            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkSelection(true)}
                disabled={selectedCount === totalCount || totalCount === 0}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkSelection(false)}
                disabled={selectedCount === 0}
              >
                Clear Selection
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
