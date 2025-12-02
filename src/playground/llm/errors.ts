/**
 * LLM Error Classification and Handling
 *
 * Provides robust error classification, retry logic, and user-friendly error messages
 * for LLM API failures across different providers (Claude, GPT-4o, Gemini).
 */

/**
 * Categorizes common LLM API error types for unified handling
 */
export type LLMErrorCategory =
  | 'llm_rate_limit'         // 429 Too Many Requests
  | 'llm_context_overflow'   // Token limit exceeded
  | 'llm_invalid_key'        // Invalid or missing API key
  | 'llm_model_unavailable'  // Model not found or service down
  | 'llm_safety_filter'      // Content safety filter triggered
  | 'llm_timeout'            // Request timeout
  | 'llm_unknown';           // Unclassified error

/**
 * Retry configuration for different error categories
 */
export interface RetryConfig {
  retryable: boolean;
  initialDelayMs?: number;
  maxRetries?: number;
  backoffMultiplier?: number;
}

/**
 * Classifies an LLM error into a standardized category
 *
 * Analyzes error messages, status codes, and error types from different providers
 * to determine the appropriate error category.
 *
 * @param error - Error object from LLM API call
 * @returns Categorized error type
 */
export function classifyLLMError(error: any): LLMErrorCategory {
  const message = error?.message || '';
  const statusCode = error?.status || error?.statusCode;
  const errorType = error?.type || error?.code;

  // Rate limiting
  if (
    statusCode === 429 ||
    message.includes('rate limit') ||
    message.includes('quota exceeded') ||
    message.includes('too many requests') ||
    errorType === 'rate_limit_error'
  ) {
    return 'llm_rate_limit';
  }

  // Context length / token overflow
  if (
    statusCode === 400 &&
    (message.includes('context length') ||
      message.includes('token limit') ||
      message.includes('maximum context') ||
      message.includes('too many tokens') ||
      message.includes('context_length_exceeded'))
  ) {
    return 'llm_context_overflow';
  }

  // Invalid API key
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    message.includes('invalid api key') ||
    message.includes('authentication failed') ||
    message.includes('unauthorized') ||
    errorType === 'authentication_error' ||
    errorType === 'invalid_api_key'
  ) {
    return 'llm_invalid_key';
  }

  // Model unavailable
  if (
    statusCode === 404 ||
    statusCode === 503 ||
    message.includes('model not found') ||
    message.includes('service unavailable') ||
    message.includes('model is currently overloaded') ||
    errorType === 'model_not_found'
  ) {
    return 'llm_model_unavailable';
  }

  // Safety filter
  if (
    statusCode === 400 &&
    (message.includes('content policy') ||
      message.includes('safety') ||
      message.includes('filtered') ||
      message.includes('blocked') ||
      errorType === 'content_filter')
  ) {
    return 'llm_safety_filter';
  }

  // Timeout
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('deadline exceeded') ||
    errorType === 'timeout'
  ) {
    return 'llm_timeout';
  }

  // Default to unknown
  return 'llm_unknown';
}

/**
 * Returns retry configuration for a given error category
 *
 * Defines which errors are retryable and with what backoff strategy.
 *
 * @param category - Error category
 * @returns Retry configuration
 */
export function getLLMErrorRetryConfig(category: LLMErrorCategory): RetryConfig {
  switch (category) {
    case 'llm_rate_limit':
      return {
        retryable: true,
        initialDelayMs: 1000,
        maxRetries: 3,
        backoffMultiplier: 2, // Exponential backoff: 1s, 2s, 4s
      };

    case 'llm_timeout':
      return {
        retryable: true,
        initialDelayMs: 500,
        maxRetries: 2,
        backoffMultiplier: 2,
      };

    case 'llm_model_unavailable':
      return {
        retryable: true,
        initialDelayMs: 2000,
        maxRetries: 2,
        backoffMultiplier: 2,
      };

    case 'llm_context_overflow':
      return {
        retryable: false, // Requires user intervention to shorten context
      };

    case 'llm_invalid_key':
      return {
        retryable: false, // Requires configuration fix
      };

    case 'llm_safety_filter':
      return {
        retryable: false, // Content issue, won't succeed on retry
      };

    case 'llm_unknown':
      return {
        retryable: true,
        initialDelayMs: 1000,
        maxRetries: 1,
        backoffMultiplier: 1,
      };

    default:
      return {
        retryable: false,
      };
  }
}

/**
 * Formats an LLM error into a user-friendly message
 *
 * Provides actionable guidance based on error category.
 *
 * @param error - Original error object
 * @param category - Classified error category
 * @returns User-friendly error message
 */
export function formatLLMError(error: any, category: LLMErrorCategory): string {
  const baseMessage = error?.message || 'An unknown error occurred';

  switch (category) {
    case 'llm_rate_limit':
      return `Rate limit exceeded. The API is receiving too many requests. Please wait a moment and try again. ${baseMessage}`;

    case 'llm_context_overflow':
      return `Context length exceeded. The conversation is too long for the model. Try starting a new session or using a model with a larger context window. ${baseMessage}`;

    case 'llm_invalid_key':
      return `API key is invalid or missing. Please check your ${getProviderFromError(error)} API key configuration in Settings. ${baseMessage}`;

    case 'llm_model_unavailable':
      return `Model is currently unavailable. The selected model may be overloaded or under maintenance. Try selecting a different model or waiting a moment. ${baseMessage}`;

    case 'llm_safety_filter':
      return `Content filtered. Your request was blocked by the provider's content safety filter. Please rephrase your prompt. ${baseMessage}`;

    case 'llm_timeout':
      return `Request timed out. The model took too long to respond. This may be due to high load. Please try again. ${baseMessage}`;

    case 'llm_unknown':
      return `An unexpected error occurred while calling the LLM API. ${baseMessage}`;

    default:
      return baseMessage;
  }
}

/**
 * Helper to extract provider name from error context
 */
function getProviderFromError(error: any): string {
  const message = error?.message || '';

  if (message.includes('anthropic') || message.includes('claude')) {
    return 'Anthropic';
  }
  if (message.includes('openai') || message.includes('gpt')) {
    return 'OpenAI';
  }
  if (message.includes('google') || message.includes('gemini')) {
    return 'Google';
  }

  return 'LLM';
}

/**
 * Retry helper with exponential backoff
 *
 * Attempts to execute an async function with retry logic based on error category.
 *
 * @param fn - Async function to retry
 * @param config - Retry configuration
 * @returns Promise resolving to function result
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  if (!config.retryable) {
    return fn();
  }

  let lastError: any;
  const maxRetries = config.maxRetries || 1;
  const initialDelay = config.initialDelayMs || 1000;
  const backoffMultiplier = config.backoffMultiplier || 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delayMs = initialDelay * Math.pow(backoffMultiplier, attempt);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}
