/**
 * LLM Module for Playground
 *
 * Exports LangChain-based model creation and error handling for multiple LLM providers.
 */

export {
  getChatModel,
  getDefaultModel,
  hasApiKey,
  getAvailableProviders,
  DEFAULT_MODELS,
  type ChatModelConfig,
  type Env,
} from './streaming';

export {
  classifyLLMError,
  getLLMErrorRetryConfig,
  formatLLMError,
  retryWithBackoff,
  type LLMErrorCategory,
  type RetryConfig,
} from './errors';
