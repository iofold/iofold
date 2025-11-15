/**
 * ActionBar Component
 *
 * Displays feedback buttons and keyboard shortcut hints.
 * Handles positive, neutral, negative feedback, and skip action.
 */

interface ActionBarProps {
  onFeedback: (rating: 'positive' | 'neutral' | 'negative') => void
  onSkip?: () => void
}

export function ActionBar({ onFeedback, onSkip }: ActionBarProps) {
  return (
    <div className="p-4 bg-gray-50 rounded-b-lg border-t border-gray-200">
      {/* Mobile Instructions */}
      <div className="mb-3 text-center">
        <p className="text-xs text-gray-500 mb-1">
          <span className="inline-block mr-2">👈 Swipe left for 👎</span>
          <span className="inline-block">👉 Swipe right for 👍</span>
        </p>
        <p className="text-xs text-gray-500">
          <span className="inline-block">↓ Swipe down for 😐</span>
        </p>
      </div>

      {/* Feedback Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <button
          onClick={() => onFeedback('positive')}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          aria-label="Mark as positive (press 1)"
        >
          <span role="img" aria-hidden="true" className="text-xl">👍</span>
          <span>Positive</span>
          <span className="text-xs bg-green-600 px-1.5 py-0.5 rounded font-mono">1</span>
        </button>

        <button
          onClick={() => onFeedback('neutral')}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          aria-label="Mark as neutral (press 2)"
        >
          <span role="img" aria-hidden="true" className="text-xl">😐</span>
          <span>Neutral</span>
          <span className="text-xs bg-gray-600 px-1.5 py-0.5 rounded font-mono">2</span>
        </button>

        <button
          onClick={() => onFeedback('negative')}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          aria-label="Mark as negative (press 3)"
        >
          <span role="img" aria-hidden="true" className="text-xl">👎</span>
          <span>Negative</span>
          <span className="text-xs bg-red-600 px-1.5 py-0.5 rounded font-mono">3</span>
        </button>
      </div>

      {/* Skip Button */}
      {onSkip && (
        <button
          onClick={onSkip}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 font-medium border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          aria-label="Skip to next trace (press Space)"
        >
          <span role="img" aria-hidden="true">⏭️</span>
          <span>Skip</span>
          <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded font-mono">Space</span>
        </button>
      )}

      {/* Keyboard Shortcuts Hint */}
      <div className="mt-3 text-center">
        <p className="text-xs text-gray-500">
          Or use: <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">1</kbd> Positive · <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">2</kbd> Neutral · <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">3</kbd> Negative
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Navigate: <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">←</kbd> Previous · <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">→</kbd> Next · <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">E</kbd> Expand
        </p>
      </div>
    </div>
  )
}
