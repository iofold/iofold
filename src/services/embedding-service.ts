/**
 * Embedding Service
 *
 * Wrapper around Workers AI for generating text embeddings.
 * Uses bge-base-en-v1.5 model (768 dimensions).
 */

/// <reference types="@cloudflare/workers-types" />

import type { EmbeddingResponse } from '../types/vectorize';

export interface EmbeddingServiceConfig {
  ai: Ai;
  model?: string;
}

export class EmbeddingService {
  private ai: Ai;
  private model: string;

  constructor(config: EmbeddingServiceConfig) {
    this.ai = config.ai;
    this.model = config.model || '@cf/baai/bge-base-en-v1.5';
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    // Cast model to any since the Ai.run() expects keyof AiModels but we use a string
    const response = await this.ai.run(this.model as any, {
      text: [text]
    }) as EmbeddingResponse;

    if (!response.data || response.data.length === 0) {
      throw new Error('No embedding returned from Workers AI');
    }

    return response.data[0];
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Workers AI supports batching, but limit batch size
    const batchSize = 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      // Cast model to any since the Ai.run() expects keyof AiModels but we use a string
      const response = await this.ai.run(this.model as any, {
        text: batch
      }) as EmbeddingResponse;

      if (!response.data) {
        throw new Error('No embeddings returned from Workers AI');
      }

      results.push(...response.data);
    }

    return results;
  }

  /**
   * Get the dimensionality of embeddings (768 for bge-base-en-v1.5)
   */
  getDimensions(): number {
    return 768;
  }
}
