/**
 * Vectorize Types
 *
 * Type definitions for Cloudflare Vectorize and Workers AI integration.
 */

/// <reference types="@cloudflare/workers-types" />

/**
 * Vector with metadata for storage in Vectorize
 */
export interface SystemPromptVector {
  id: string;  // trace_id
  values: number[];  // 768-dim embedding from bge-base-en-v1.5
  metadata: {
    workspace_id: string;
    trace_id: string;
    status: 'unassigned' | 'clustered' | 'assigned' | 'orphaned';
    cluster_id?: string;
    agent_id?: string;
  };
}

/**
 * Result from Vectorize similarity query
 */
export interface VectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, string>;
}

/**
 * Cluster of similar system prompts
 */
export interface PromptCluster {
  id: string;
  trace_ids: string[];
  prompts: string[];
  centroid_trace_id: string;  // The seed trace
  average_similarity: number;
}

/**
 * Result from template extraction
 */
export interface ExtractedTemplate {
  template: string;
  variables: string[];
  confidence: number;
  examples_used: number;
}

/**
 * Workers AI embedding response
 */
export interface EmbeddingResponse {
  shape: number[];
  data: number[][];
}

/**
 * Vectorize upsert result
 */
export interface VectorUpsertResult {
  count: number;
  ids?: string[];
}

/**
 * Vectorize query result
 */
export interface VectorQueryResult {
  count: number;
  matches: VectorMatch[];
}
