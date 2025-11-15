'use client'

/**
 * TraceCardExample Component
 *
 * Example usage of TraceCard with sample data for testing and demonstration
 */

import { useState } from 'react'
import { TraceCard } from './TraceCard'
import { ParsedTrace } from '@/types/trace'

// Sample parsed trace data
const sampleTrace: ParsedTrace = {
  header: {
    status: 'complete',
    traceNumber: 12,
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 minutes ago
    stepCount: 7,
    duration: 2.3,
  },
  lastExchange: {
    human: {
      content: 'Calculate compound interest for $10,000 at 5% over 10 years with annual compounding.',
      truncated: false,
    },
    assistant: {
      content: 'The compound interest would be $6,288.95. The final amount would be $16,288.95.',
      truncated: false,
    },
  },
  toolCalls: [
    {
      name: 'calculate',
      module: 'math_tools',
      arguments: {
        formula: 'compound_interest',
        principal: 10000,
        rate: 0.05,
        time: 10,
        n: 1,
      },
      result: 16288.95,
    },
  ],
  previousSteps: [
    {
      role: 'human',
      content: 'Hello, I need help with a financial calculation.',
      timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    },
    {
      role: 'assistant',
      content: "Of course! I'd be happy to help with your financial calculation. What would you like to calculate?",
      timestamp: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    },
    {
      role: 'human',
      content: 'Calculate compound interest for $10,000 at 5% over 10 years with annual compounding.',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
    {
      role: 'assistant',
      content: 'The compound interest would be $6,288.95. The final amount would be $16,288.95.',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
  ],
  raw: {} as any, // Not needed for example
}

// Another sample with error
const errorTrace: ParsedTrace = {
  header: {
    status: 'error',
    traceNumber: 13,
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 minutes ago
    stepCount: 3,
    duration: 1.2,
  },
  lastExchange: {
    human: {
      content: 'What is the weather in New York?',
      truncated: false,
    },
    assistant: {
      content: "I apologize, but I'm unable to fetch the weather data at the moment due to an API error.",
      truncated: false,
    },
  },
  toolCalls: [
    {
      name: 'weather_api',
      module: 'external_apis',
      arguments: {
        location: 'New York',
      },
      error: 'Rate limit exceeded. Please try again later.',
    },
  ],
  previousSteps: [
    {
      role: 'human',
      content: 'What is the weather in New York?',
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      role: 'assistant',
      content: "I apologize, but I'm unable to fetch the weather data at the moment due to an API error.",
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
  ],
  raw: {} as any,
}

// Sample with truncated message
const longMessageTrace: ParsedTrace = {
  header: {
    status: 'complete',
    traceNumber: 14,
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
    stepCount: 2,
    duration: 0.8,
  },
  lastExchange: {
    human: {
      content: 'Can you explain quantum computing in detail, including its fundamental principles, the concept of qubits, superposition, entanglement, quantum gates, and how it differs from classical computing? Also, what are some practical applications and current limitations?',
      truncated: true,
      fullContent: 'Can you explain quantum computing in detail, including its fundamental principles, the concept of qubits, superposition, entanglement, quantum gates, and how it differs from classical computing? Also, what are some practical applications and current limitations of quantum computers in today\'s world?',
    },
    assistant: {
      content: 'Quantum computing is a revolutionary approach to computation that leverages quantum mechanical phenomena. At its core are qubits, which unlike classical bits that are either 0 or 1, can exist in superposition - simultaneously being both 0 and 1 until measured...',
      truncated: true,
      fullContent: 'Quantum computing is a revolutionary approach to computation that leverages quantum mechanical phenomena. At its core are qubits, which unlike classical bits that are either 0 or 1, can exist in superposition - simultaneously being both 0 and 1 until measured. This property, combined with entanglement (where qubits become correlated), enables quantum computers to process vast amounts of information in parallel. Quantum gates manipulate these qubits to perform computations. The main advantage over classical computing is the exponential speedup for certain problems like cryptography, optimization, and molecular simulation. However, current limitations include decoherence (qubits losing their quantum state), error rates, and the need for extremely cold operating temperatures.',
    },
  },
  toolCalls: [],
  previousSteps: [
    {
      role: 'human',
      content: 'Can you explain quantum computing in detail, including its fundamental principles, the concept of qubits, superposition, entanglement, quantum gates, and how it differs from classical computing? Also, what are some practical applications and current limitations of quantum computers in today\'s world?',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    {
      role: 'assistant',
      content: 'Quantum computing is a revolutionary approach to computation that leverages quantum mechanical phenomena. At its core are qubits, which unlike classical bits that are either 0 or 1, can exist in superposition - simultaneously being both 0 and 1 until measured. This property, combined with entanglement (where qubits become correlated), enables quantum computers to process vast amounts of information in parallel. Quantum gates manipulate these qubits to perform computations. The main advantage over classical computing is the exponential speedup for certain problems like cryptography, optimization, and molecular simulation. However, current limitations include decoherence (qubits losing their quantum state), error rates, and the need for extremely cold operating temperatures.',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
  ],
  raw: {} as any,
}

const samples = [sampleTrace, errorTrace, longMessageTrace]

export function TraceCardExample() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [feedbackLog, setFeedbackLog] = useState<string[]>([])

  const currentTrace = samples[currentIndex]

  const handleFeedback = (rating: 'positive' | 'neutral' | 'negative') => {
    const message = `Trace #${currentTrace.header.traceNumber}: ${rating}`
    setFeedbackLog((prev) => [...prev, message])

    // Show toast notification
    alert(`Feedback recorded: ${rating}`)

    // Move to next trace
    if (currentIndex < samples.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      alert('All traces reviewed!')
    }
  }

  const handleNext = () => {
    if (currentIndex < samples.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleSkip = () => {
    const message = `Trace #${currentTrace.header.traceNumber}: skipped`
    setFeedbackLog((prev) => [...prev, message])
    handleNext()
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Trace Review Example
          </h1>
          <p className="text-gray-600">
            Try keyboard shortcuts: 1 (positive), 2 (neutral), 3 (negative), Space (skip), Arrows (navigate), E (expand)
          </p>
          <div className="mt-2 text-sm text-gray-500">
            Trace {currentIndex + 1} of {samples.length}
          </div>
        </div>

        {/* Card */}
        <div className="mb-8">
          <TraceCard
            trace={currentTrace}
            onFeedback={handleFeedback}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onSkip={handleSkip}
          />
        </div>

        {/* Feedback Log */}
        {feedbackLog.length > 0 && (
          <div className="bg-white rounded-lg p-4 shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Feedback Log
            </h2>
            <div className="space-y-1">
              {feedbackLog.map((log, index) => (
                <div key={index} className="text-sm text-gray-600">
                  {index + 1}. {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
