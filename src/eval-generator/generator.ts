import Anthropic from '@anthropic-ai/sdk';
import type { Trace } from '../types/trace';
import { buildEvalGenerationPrompt } from './prompts';

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
  };
}

export interface EvalGeneratorConfig {
  anthropicApiKey: string;
  model?: string;
}

export class EvalGenerator {
  private client: Anthropic;
  private model: string;

  constructor(config: EvalGeneratorConfig) {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey
    });
    this.model = config.model || 'claude-3-5-sonnet-20241022';
  }

  async generate(request: GenerateEvalRequest): Promise<GenerateEvalResult> {
    // Build prompt
    const prompt = buildEvalGenerationPrompt(
      request.name,
      request.positiveExamples,
      request.negativeExamples
    );

    // Call Claude API
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Extract code from response
    const code = this.extractCode(response.content);

    return {
      code,
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        model: this.model
      }
    };
  }

  private extractCode(content: any[]): string {
    // Find text content
    const textContent = content.find(block => block.type === 'text');
    if (!textContent) {
      throw new Error('No text content in response');
    }

    const text = textContent.text;

    // Extract code from markdown code blocks
    const codeBlockMatch = text.match(/```python\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // If no code block, return full text (Claude might not use markdown)
    return text.trim();
  }
}
