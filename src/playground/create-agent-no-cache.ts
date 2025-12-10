/**
 * Custom Agent Creator using LangGraph directly
 *
 * Uses @langchain/langgraph/prebuilt's createReactAgent directly,
 * bypassing the 'langchain' wrapper which has OPENAI_API_KEY dependencies.
 *
 * Safe for use in Cloudflare Workers where process.env is limited.
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';

const BASE_PROMPT = `In order to complete the objective that the user asks of you, you have access to a number of standard tools.`;

export interface CreateAgentNoCacheParams {
  /** The LangChain model to use */
  model: BaseChatModel;
  /** Custom tools to add */
  tools?: StructuredToolInterface[];
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Agent name for identification */
  name?: string;
  /** Backend factory - currently unused but kept for API compatibility */
  backend?: unknown;
}

/**
 * Create a ReAct Agent using LangGraph directly
 *
 * Uses @langchain/langgraph/prebuilt's createReactAgent which:
 * - Works with any BaseChatModel (including ChatOpenAI with custom baseURL)
 * - Does NOT require OPENAI_API_KEY environment variable
 * - Provides streamEvents() for fine-grained streaming control
 *
 * Safe for use in Cloudflare Workers where process.env is limited.
 */
export function createAgentNoCache(params: CreateAgentNoCacheParams) {
  const {
    model,
    tools = [],
    systemPrompt,
  } = params;

  const finalSystemPrompt = systemPrompt
    ? `${systemPrompt}\n\n${BASE_PROMPT}`
    : BASE_PROMPT;

  // Create the agent using LangGraph's createReactAgent directly
  // This bypasses the 'langchain' wrapper which has OpenAI dependencies
  return createReactAgent({
    llm: model,
    tools: tools as StructuredToolInterface[],
    // stateModifier is the system prompt for the agent
    stateModifier: finalSystemPrompt,
  });
}
