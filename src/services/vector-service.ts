/**
 * Vector Service
 *
 * Wrapper around Cloudflare Vectorize for storing and querying embeddings.
 */

/// <reference types="@cloudflare/workers-types" />

import type {
  SystemPromptVector,
  VectorMatch,
  VectorUpsertResult,
  VectorQueryResult
} from '../types/vectorize';

export interface VectorServiceConfig {
  vectorize: VectorizeIndex;
}

export class VectorService {
  private vectorize: VectorizeIndex;

  constructor(config: VectorServiceConfig) {
    this.vectorize = config.vectorize;
  }

  /**
   * Upsert a single vector
   */
  async upsert(vector: SystemPromptVector): Promise<VectorUpsertResult> {
    return this.upsertBatch([vector]);
  }

  /**
   * Upsert multiple vectors (batch)
   */
  async upsertBatch(vectors: SystemPromptVector[]): Promise<VectorUpsertResult> {
    if (vectors.length === 0) {
      return { count: 0 };
    }

    const vectorizeVectors: VectorizeVector[] = vectors.map(v => ({
      id: v.id,
      values: v.values,
      metadata: v.metadata as Record<string, string>
    }));

    const result = await this.vectorize.upsert(vectorizeVectors);
    return {
      count: result.count,
      ids: vectors.map(v => v.id)
    };
  }

  /**
   * Query for similar vectors
   */
  async query(
    queryVector: number[],
    options: {
      topK?: number;
      filter?: Record<string, string>;
      returnMetadata?: boolean;
    } = {}
  ): Promise<VectorQueryResult> {
    const { topK = 10, filter, returnMetadata = true } = options;

    const result = await this.vectorize.query(queryVector, {
      topK,
      filter,
      returnMetadata: returnMetadata ? 'all' : 'none'
    });

    return {
      count: result.count,
      matches: result.matches.map(m => ({
        id: m.id,
        score: m.score,
        metadata: m.metadata as Record<string, string> | undefined
      }))
    };
  }

  /**
   * Get vectors by IDs
   */
  async getByIds(ids: string[]): Promise<VectorizeVector[]> {
    if (ids.length === 0) {
      return [];
    }

    const result = await this.vectorize.getByIds(ids);
    return result;
  }

  /**
   * Delete vectors by IDs
   */
  async deleteByIds(ids: string[]): Promise<{ count: number }> {
    if (ids.length === 0) {
      return { count: 0 };
    }

    const result = await this.vectorize.deleteByIds(ids);
    return { count: result.count };
  }

  /**
   * Update metadata for a vector (upsert with same values)
   */
  async updateMetadata(
    id: string,
    values: number[],
    metadata: Record<string, string>
  ): Promise<VectorUpsertResult> {
    return this.upsert({
      id,
      values,
      metadata: metadata as SystemPromptVector['metadata']
    });
  }
}
