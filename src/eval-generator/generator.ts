import OpenAI from 'openai';
import type { Trace } from '../types/trace';
import { buildEvalGenerationPrompt } from './prompts';
import { CostTracker, type CostMetrics } from '../analytics/cost-tracker';
import { createGatewayClient, calculateCost, DEFAULT_MODEL, type GatewayEnv } from '../ai/gateway';

export interface GenerateEvalRequest {
  name: string;
  positiveExamples: Trace[];
  negativeExamples: Trace[];
}

export interface GenerateEvalResult {
  code: string;
  metadata: {
    tokensUsed: number;
    promptTokens: number;
    completionTokens: number;
    model: string;
    cost: CostMetrics;
  };
}

export interface EvalGeneratorConfig {
  /** Cloudflare Account ID for AI Gateway */
  cfAccountId: string;
  /** Cloudflare AI Gateway ID */
  cfGatewayId: string;
  /** Optional AI Gateway authentication token */
  cfGatewayToken?: string;
  /** Model to use (provider-prefixed, e.g., "anthropic/claude-sonnet-4-5") */
  model?: string;
}

export class EvalGenerator {
  private client: OpenAI;
  private model: string;

  constructor(config: EvalGeneratorConfig) {
    this.model = config.model || DEFAULT_MODEL;

    // Create gateway client - all LLM calls go through Cloudflare AI Gateway
    this.client = createGatewayClient({
      CF_ACCOUNT_ID: config.cfAccountId,
      CF_AI_GATEWAY_ID: config.cfGatewayId,
      CF_AI_GATEWAY_TOKEN: config.cfGatewayToken,
    });
  }

  async generate(request: GenerateEvalRequest): Promise<GenerateEvalResult> {
    // Build prompt
    const prompt = buildEvalGenerationPrompt(
      request.name,
      request.positiveExamples,
      request.negativeExamples
    );

    // Call LLM API via AI Gateway /compat endpoint
    // Model is already provider-prefixed (e.g., "anthropic/claude-sonnet-4-5")
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Extract code from response (OpenAI format)
    const content = response.choices[0]?.message?.content || '';
    const code = this.extractCodeFromText(content);

    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;

    // Calculate cost using gateway utility
    const gatewayCost = calculateCost(this.model, promptTokens, completionTokens);

    // Also use CostTracker for backwards compatibility
    const cost = CostTracker.calculateCost({
      model: this.model,
      promptTokens,
      completionTokens
    });

    console.log(`[Cost] Generated eval for $${gatewayCost.totalCost.toFixed(4)}`);
    console.log(`[Cost] Tokens: ${promptTokens + completionTokens} (${promptTokens} in, ${completionTokens} out)`);

    return {
      code,
      metadata: {
        tokensUsed: promptTokens + completionTokens,
        promptTokens,
        completionTokens,
        model: this.model,
        cost
      }
    };
  }

  private extractCodeFromText(text: string): string {
    if (!text) {
      throw new Error('No text content in response');
    }

    // Extract code from markdown code blocks
    const codeBlockMatch = text.match(/```python\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // If no code block, return full text
    return text.trim();
  }
}
