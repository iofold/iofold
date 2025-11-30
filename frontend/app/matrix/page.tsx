'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Info,
  Layers,
  Minus,
  ThumbsDown,
  ThumbsUp
} from 'lucide-react'

// Mock data for agent versions
const mockVersions = [
  {
    id: 'v1',
    name: 'Customer Satisfaction v1',
    version: '1.0',
    status: 'deployed' as const,
    created_at: '2025-11-15T10:30:00Z',
    accuracy: 87,
    avgConfidence: 89,
    positiveCount: 145,
    negativeCount: 28,
    neutralCount: 12,
    contradictions: 8,
    totalTraces: 185
  },
  {
    id: 'v2',
    name: 'Customer Satisfaction v2',
    version: '2.0',
    status: 'testing' as const,
    created_at: '2025-11-22T14:15:00Z',
    accuracy: 92,
    avgConfidence: 91,
    positiveCount: 158,
    negativeCount: 18,
    neutralCount: 9,
    contradictions: 3,
    totalTraces: 185
  },
  {
    id: 'v3',
    name: 'Customer Satisfaction v3',
    version: '3.0',
    status: 'draft' as const,
    created_at: '2025-11-28T09:45:00Z',
    accuracy: 78,
    avgConfidence: 76,
    positiveCount: 132,
    negativeCount: 35,
    neutralCount: 18,
    contradictions: 15,
    totalTraces: 185
  }
]

type VersionStatus = 'deployed' | 'testing' | 'draft'

export default function MatrixPage() {
  const getStatusColor = (status: VersionStatus) => {
    switch (status) {
      case 'deployed':
        return 'bg-[#2D9B78] text-white border-[#2D9B78]'
      case 'testing':
        return 'bg-[#F2B8A2] text-[#8B4513] border-[#F2B8A2]'
      case 'draft':
        return 'bg-gray-200 text-gray-800 border-gray-300'
      default:
        return 'bg-gray-200 text-gray-700 border-gray-300'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const calculatePercentage = (count: number, total: number) => {
    if (total === 0) return 0
    return Math.round((count / total) * 100)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#2A2D35] mb-2">
          Agent Version Performance Overview
        </h1>
        <p className="text-[#4B5563]">
          Compare evaluation scores across different agent versions
        </p>
      </div>

      {/* Info Box */}
      <div className="bg-white rounded-lg border border-[#D1D5DB] p-6 mb-8 shadow-sm">
        <div className="flex items-start space-x-3">
          <Info className="text-[#4ECFA5] mt-1 flex-shrink-0" size={20} />
          <div>
            <h3 className="font-semibold text-[#2A2D35] mb-2">
              How to Use This View
            </h3>
            <p className="text-sm text-[#4B5563]">
              This overview shows evaluation performance metrics across different agent versions.
              Click on any version card to view detailed per-trace evaluation outputs, contradictions, and reasoning.
            </p>
          </div>
        </div>
      </div>

      {/* Version Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockVersions.map((version) => (
          <Link
            key={version.id}
            href={`/matrix/${version.id}`}
            className="block group"
            aria-label={`View details for ${version.name}`}
          >
            <div className="bg-white rounded-lg border border-[#D1D5DB] shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden h-full flex flex-col cursor-pointer">
              {/* Card Header */}
              <div className="border-b border-[#D1D5DB] p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-[#2A2D35] mb-1 group-hover:text-[#4ECFA5] transition-colors">
                      {version.name}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-[#4B5563]">
                        v{version.version} • {formatDate(version.created_at)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 text-xs font-medium rounded-full border capitalize ${getStatusColor(
                      version.status
                    )}`}
                  >
                    {version.status}
                  </span>
                </div>

                {/* Overall Accuracy */}
                <div className="bg-[#F5EFE6] rounded-lg p-4">
                  <div className="text-sm text-[#4B5563] mb-1">
                    Overall Accuracy
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-bold text-[#2A2D35]">
                      {version.accuracy}%
                    </span>
                    <span className="text-sm text-[#4B5563]">
                      ({version.avgConfidence}% confidence)
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Content */}
              <div className="p-6 flex-1 flex flex-col space-y-4">
                {/* Evaluation Distribution */}
                <div>
                  <div className="text-sm font-medium text-[#4B5563] mb-3">
                    Evaluation Distribution
                  </div>
                  <div className="space-y-2">
                    {/* Positive */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <ThumbsUp size={14} className="text-[#2D9B78]" />
                        <span className="text-sm text-[#2A2D35]">Positive</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-[#2A2D35]">
                          {version.positiveCount}
                        </span>
                        <span className="text-xs text-[#4B5563]">
                          ({calculatePercentage(version.positiveCount, version.totalTraces)}%)
                        </span>
                      </div>
                    </div>

                    {/* Neutral */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Minus size={14} className="text-[#F2B8A2]" />
                        <span className="text-sm text-[#2A2D35]">Neutral</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-[#2A2D35]">
                          {version.neutralCount}
                        </span>
                        <span className="text-xs text-[#4B5563]">
                          ({calculatePercentage(version.neutralCount, version.totalTraces)}%)
                        </span>
                      </div>
                    </div>

                    {/* Negative */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <ThumbsDown size={14} className="text-[#D4705A]" />
                        <span className="text-sm text-[#2A2D35]">Negative</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-[#2A2D35]">
                          {version.negativeCount}
                        </span>
                        <span className="text-xs text-[#4B5563]">
                          ({calculatePercentage(version.negativeCount, version.totalTraces)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contradictions */}
                <div className="pt-4 border-t border-[#D1D5DB]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle size={16} className="text-[#D4705A]" />
                      <span className="text-sm font-medium text-[#2A2D35]">
                        Contradictions
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-[#D4705A]">
                        {version.contradictions}
                      </div>
                      <div className="text-xs text-[#4B5563]">
                        {calculatePercentage(version.contradictions, version.totalTraces)}% rate
                      </div>
                    </div>
                  </div>
                </div>

                {/* Total Traces */}
                <div className="pt-2 border-t border-[#D1D5DB]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#4B5563]">
                      Total Traces Evaluated
                    </span>
                    <span className="text-sm font-medium text-[#2A2D35]">
                      {version.totalTraces}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="p-6 pt-0">
                <div
                  className="w-full py-2 px-4 border border-[#D1D5DB] rounded-lg text-[#2A2D35] group-hover:bg-[#4ECFA5] group-hover:text-white group-hover:border-[#4ECFA5] transition-colors flex items-center justify-center space-x-2"
                  role="button"
                  aria-label={`View trace details for ${version.name}`}
                >
                  <span>View Trace Details</span>
                  <ArrowRight size={16} />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Empty State (hidden when we have data) */}
      {mockVersions.length === 0 && (
        <div className="bg-white rounded-lg border border-[#D1D5DB] p-12 text-center">
          <Layers size={48} className="text-[#4B5563] mx-auto mb-4" />
          <h3 className="text-lg font-medium text-[#2A2D35] mb-2">
            No Agent Versions Found
          </h3>
          <p className="text-[#4B5563] mb-4">
            There are no evaluation versions available to display.
          </p>
          <button className="py-2 px-4 border border-[#D1D5DB] rounded-lg text-[#2A2D35] hover:bg-[#4ECFA5] hover:text-white hover:border-[#4ECFA5] transition-colors">
            Create New Version
          </button>
        </div>
      )}
    </div>
  )
}
