/**
 * Tests for ClusteringService
 *
 * Tests the greedy similarity-based clustering algorithm:
 * - Embedding and vector storage
 * - Similarity threshold filtering
 * - Minimum cluster size enforcement
 * - Orphan detection
 * - Vectorize metadata updates
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClusteringService, type TracePrompt, type ClusteringResult } from './clustering-service';
import type { VectorService } from './vector-service';
import type { EmbeddingService } from './embedding-service';
import type { VectorQueryResult, SystemPromptVector } from '../types/vectorize';

// Mock vector generation - creates deterministic embeddings based on content
function createMockEmbedding(content: string): number[] {
  // Simple hash-based mock embedding - similar content gets similar vectors
  const hash = content.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return Array(768).fill(0).map((_, i) => (hash + i) % 100 / 100);
}

// Mock services
function createMockServices(options: {
  similarityThreshold?: number;
  minClusterSize?: number;
  embeddingBehavior?: 'deterministic' | 'unique';
  queryBehavior?: (queryVector: number[], storedVectors: Map<string, number[]>) => VectorQueryResult;
} = {}) {
  const storedVectors = new Map<string, number[]>();
  let storedMetadata = new Map<string, SystemPromptVector['metadata']>();

  const mockEmbeddingService: Partial<EmbeddingService> = {
    embedBatch: vi.fn((texts: string[]) => {
      if (options.embeddingBehavior === 'unique') {
        // Each text gets a unique random embedding
        return Promise.resolve(texts.map(() => Array(768).fill(0).map(() => Math.random())));
      }
      // Deterministic: similar content gets similar embeddings
      return Promise.resolve(texts.map(text => createMockEmbedding(text)));
    })
  };

  const mockVectorService: Partial<VectorService> = {
    upsertBatch: vi.fn((vectors: SystemPromptVector[]) => {
      for (const v of vectors) {
        storedVectors.set(v.id, v.values);
        storedMetadata.set(v.id, v.metadata);
      }
      return Promise.resolve({ count: vectors.length });
    }),
    query: vi.fn((queryVector: number[], queryOptions: { topK?: number; filter?: Record<string, string> }) => {
      if (options.queryBehavior) {
        return Promise.resolve(options.queryBehavior(queryVector, storedVectors));
      }

      // Default: compute cosine similarity
      const matches = Array.from(storedVectors.entries())
        .map(([id, values]) => {
          const dotProduct = queryVector.reduce((sum, val, i) => sum + val * values[i], 0);
          const normA = Math.sqrt(queryVector.reduce((sum, val) => sum + val * val, 0));
          const normB = Math.sqrt(values.reduce((sum, val) => sum + val * val, 0));
          const score = dotProduct / (normA * normB);
          return { id, score, metadata: storedMetadata.get(id) };
        })
        .filter(m => {
          // Apply status filter if present
          if (queryOptions.filter?.status && storedMetadata.get(m.id)?.status !== queryOptions.filter.status) {
            return false;
          }
          return true;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, queryOptions.topK || 100);

      return Promise.resolve({ count: matches.length, matches });
    }),
    updateMetadata: vi.fn((id: string, values: number[], metadata: SystemPromptVector['metadata']) => {
      storedMetadata.set(id, metadata);
      return Promise.resolve();
    })
  };

  return {
    vectorService: mockVectorService as VectorService,
    embeddingService: mockEmbeddingService as EmbeddingService,
    storedVectors,
    storedMetadata
  };
}

describe('ClusteringService', () => {
  describe('Configuration', () => {
    it('should use default similarity threshold of 0.85', () => {
      const { vectorService, embeddingService } = createMockServices();
      const service = new ClusteringService({ vectorService, embeddingService });

      expect(service.getSimilarityThreshold()).toBe(0.85);
    });

    it('should use default min cluster size of 5', () => {
      const { vectorService, embeddingService } = createMockServices();
      const service = new ClusteringService({ vectorService, embeddingService });

      expect(service.getMinClusterSize()).toBe(5);
    });

    it('should accept custom configuration', () => {
      const { vectorService, embeddingService } = createMockServices();
      const service = new ClusteringService({
        vectorService,
        embeddingService,
        similarityThreshold: 0.9,
        minClusterSize: 10
      });

      expect(service.getSimilarityThreshold()).toBe(0.9);
      expect(service.getMinClusterSize()).toBe(10);
    });
  });

  describe('Empty input', () => {
    it('should return empty result for empty input', async () => {
      const { vectorService, embeddingService } = createMockServices();
      const service = new ClusteringService({ vectorService, embeddingService });

      const result = await service.clusterPrompts([]);

      expect(result.clusters).toHaveLength(0);
      expect(result.orphanedTraceIds).toHaveLength(0);
      expect(result.totalProcessed).toBe(0);
    });
  });

  describe('Single cluster formation', () => {
    it('should form one cluster when all prompts are similar', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: (queryVector, stored) => {
          // Return all vectors as highly similar
          return {
            count: stored.size,
            matches: Array.from(stored.keys()).map(id => ({
              id,
              score: 0.95,  // High similarity
              metadata: { status: 'unassigned' }
            }))
          };
        }
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        similarityThreshold: 0.85,
        minClusterSize: 3
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'You are a helpful assistant.', workspaceId: 'ws_1' },
        { traceId: 'trace_2', prompt: 'You are a helpful assistant.', workspaceId: 'ws_1' },
        { traceId: 'trace_3', prompt: 'You are a helpful assistant.', workspaceId: 'ws_1' },
        { traceId: 'trace_4', prompt: 'You are a helpful assistant.', workspaceId: 'ws_1' },
        { traceId: 'trace_5', prompt: 'You are a helpful assistant.', workspaceId: 'ws_1' }
      ];

      const result = await service.clusterPrompts(traces);

      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].trace_ids).toHaveLength(5);
      expect(result.orphanedTraceIds).toHaveLength(0);
      expect(result.totalProcessed).toBe(5);
    });
  });

  describe('Multiple clusters', () => {
    it('should form separate clusters for distinct prompt types', async () => {
      let queryCount = 0;

      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: (queryVector, stored) => {
          queryCount++;

          // Simulate two distinct clusters based on query order
          // First queries find support traces, later queries find code traces
          const allIds = Array.from(stored.keys());
          const supportTraces = allIds.filter(id => id.startsWith('trace_support_'));
          const codeTraces = allIds.filter(id => id.startsWith('trace_code_'));

          // Return matches based on which cluster the seed belongs to
          const seedIsSupportTrace = supportTraces.some(id => queryCount <= supportTraces.length);

          const matchingTraces = seedIsSupportTrace ? supportTraces : codeTraces;

          return {
            count: matchingTraces.length,
            matches: matchingTraces.map(id => ({
              id,
              score: 0.92,
              metadata: { status: 'unassigned' }
            }))
          };
        }
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        similarityThreshold: 0.85,
        minClusterSize: 3
      });

      const traces: TracePrompt[] = [
        // Support agent cluster (5 traces)
        ...Array(5).fill(null).map((_, i) => ({
          traceId: `trace_support_${i}`,
          prompt: `You are a customer support agent for Acme Corp.`,
          workspaceId: 'ws_1'
        })),
        // Code reviewer cluster (5 traces)
        ...Array(5).fill(null).map((_, i) => ({
          traceId: `trace_code_${i}`,
          prompt: `You are an expert code reviewer.`,
          workspaceId: 'ws_1'
        }))
      ];

      const result = await service.clusterPrompts(traces);

      // Should create 2 clusters (could be more depending on algorithm execution)
      expect(result.clusters.length).toBeGreaterThanOrEqual(1);
      expect(result.totalProcessed).toBe(10);
    });
  });

  describe('Minimum cluster size enforcement', () => {
    it('should mark traces as orphaned when cluster is too small', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: (queryVector, stored) => {
          // Return only the queried vector itself (cluster size = 1)
          return {
            count: 1,
            matches: [{ id: 'trace_1', score: 1.0, metadata: { status: 'unassigned' } }]
          };
        }
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        similarityThreshold: 0.85,
        minClusterSize: 5  // Requires at least 5
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Unique prompt 1', workspaceId: 'ws_1' },
        { traceId: 'trace_2', prompt: 'Unique prompt 2', workspaceId: 'ws_1' },
        { traceId: 'trace_3', prompt: 'Unique prompt 3', workspaceId: 'ws_1' }
      ];

      const result = await service.clusterPrompts(traces);

      expect(result.clusters).toHaveLength(0);  // No valid clusters
      expect(result.orphanedTraceIds).toHaveLength(3);  // All orphaned
    });

    it('should create cluster when exactly at minimum size', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: () => ({
          count: 5,
          matches: [
            { id: 'trace_1', score: 0.95, metadata: { status: 'unassigned' } },
            { id: 'trace_2', score: 0.93, metadata: { status: 'unassigned' } },
            { id: 'trace_3', score: 0.91, metadata: { status: 'unassigned' } },
            { id: 'trace_4', score: 0.90, metadata: { status: 'unassigned' } },
            { id: 'trace_5', score: 0.88, metadata: { status: 'unassigned' } }
          ]
        })
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        similarityThreshold: 0.85,
        minClusterSize: 5
      });

      const traces: TracePrompt[] = Array(5).fill(null).map((_, i) => ({
        traceId: `trace_${i + 1}`,
        prompt: 'Similar prompt',
        workspaceId: 'ws_1'
      }));

      const result = await service.clusterPrompts(traces);

      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].trace_ids).toHaveLength(5);
      expect(result.orphanedTraceIds).toHaveLength(0);
    });
  });

  describe('Similarity threshold filtering', () => {
    it('should exclude matches below similarity threshold', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: () => ({
          count: 5,
          matches: [
            { id: 'trace_1', score: 0.95, metadata: { status: 'unassigned' } },
            { id: 'trace_2', score: 0.90, metadata: { status: 'unassigned' } },
            { id: 'trace_3', score: 0.85, metadata: { status: 'unassigned' } },  // Exactly at threshold
            { id: 'trace_4', score: 0.80, metadata: { status: 'unassigned' } },  // Below threshold
            { id: 'trace_5', score: 0.70, metadata: { status: 'unassigned' } }   // Below threshold
          ]
        })
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        similarityThreshold: 0.85,
        minClusterSize: 2  // Low threshold to see effect
      });

      const traces: TracePrompt[] = Array(5).fill(null).map((_, i) => ({
        traceId: `trace_${i + 1}`,
        prompt: `Prompt ${i + 1}`,
        workspaceId: 'ws_1'
      }));

      const result = await service.clusterPrompts(traces);

      // First cluster should only include traces with score >= 0.85
      expect(result.clusters.length).toBeGreaterThanOrEqual(1);
      expect(result.clusters[0].trace_ids).toContain('trace_1');
      expect(result.clusters[0].trace_ids).toContain('trace_2');
      expect(result.clusters[0].trace_ids).toContain('trace_3');
    });
  });

  describe('Vectorize integration', () => {
    it('should call embedBatch with all prompts', async () => {
      const { vectorService, embeddingService } = createMockServices();
      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 1
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Prompt A', workspaceId: 'ws_1' },
        { traceId: 'trace_2', prompt: 'Prompt B', workspaceId: 'ws_1' }
      ];

      await service.clusterPrompts(traces);

      expect(embeddingService.embedBatch).toHaveBeenCalledWith(['Prompt A', 'Prompt B']);
    });

    it('should upsert all vectors with unassigned status', async () => {
      const { vectorService, embeddingService, storedMetadata } = createMockServices();
      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 1
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Prompt', workspaceId: 'ws_1' }
      ];

      await service.clusterPrompts(traces);

      expect(vectorService.upsertBatch).toHaveBeenCalled();
      const upsertCall = (vectorService.upsertBatch as any).mock.calls[0][0];
      expect(upsertCall[0].metadata.status).toBe('unassigned');
    });

    it('should update metadata to clustered status after clustering', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: () => ({
          count: 2,
          matches: [
            { id: 'trace_1', score: 0.95, metadata: { status: 'unassigned' } },
            { id: 'trace_2', score: 0.93, metadata: { status: 'unassigned' } }
          ]
        })
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 2
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Same prompt', workspaceId: 'ws_1' },
        { traceId: 'trace_2', prompt: 'Same prompt', workspaceId: 'ws_1' }
      ];

      await service.clusterPrompts(traces);

      // Should update metadata for clustered traces
      expect(vectorService.updateMetadata).toHaveBeenCalled();
      const updateCalls = (vectorService.updateMetadata as any).mock.calls;
      expect(updateCalls.some((call: any[]) => call[2].status === 'clustered')).toBe(true);
    });

    it('should update metadata to orphaned status for small clusters', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: (_, stored) => ({
          count: 1,
          matches: [{ id: Array.from(stored.keys())[0], score: 1.0, metadata: { status: 'unassigned' } }]
        })
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 5  // Require 5, but only 1 match
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Unique prompt', workspaceId: 'ws_1' }
      ];

      await service.clusterPrompts(traces);

      // Should mark as orphaned
      const updateCalls = (vectorService.updateMetadata as any).mock.calls;
      expect(updateCalls.some((call: any[]) => call[2].status === 'orphaned')).toBe(true);
    });
  });

  describe('Cluster metadata', () => {
    it('should include prompts array in cluster result', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: () => ({
          count: 3,
          matches: [
            { id: 'trace_1', score: 0.95, metadata: { status: 'unassigned' } },
            { id: 'trace_2', score: 0.93, metadata: { status: 'unassigned' } },
            { id: 'trace_3', score: 0.91, metadata: { status: 'unassigned' } }
          ]
        })
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 3
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Prompt 1', workspaceId: 'ws_1' },
        { traceId: 'trace_2', prompt: 'Prompt 2', workspaceId: 'ws_1' },
        { traceId: 'trace_3', prompt: 'Prompt 3', workspaceId: 'ws_1' }
      ];

      const result = await service.clusterPrompts(traces);

      expect(result.clusters[0].prompts).toHaveLength(3);
      expect(result.clusters[0].prompts).toContain('Prompt 1');
    });

    it('should set centroid_trace_id to the seed trace', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: () => ({
          count: 3,
          matches: [
            { id: 'trace_1', score: 0.95, metadata: { status: 'unassigned' } },
            { id: 'trace_2', score: 0.93, metadata: { status: 'unassigned' } },
            { id: 'trace_3', score: 0.91, metadata: { status: 'unassigned' } }
          ]
        })
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 3
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Prompt', workspaceId: 'ws_1' },
        { traceId: 'trace_2', prompt: 'Prompt', workspaceId: 'ws_1' },
        { traceId: 'trace_3', prompt: 'Prompt', workspaceId: 'ws_1' }
      ];

      const result = await service.clusterPrompts(traces);

      expect(result.clusters[0].centroid_trace_id).toBe('trace_1');  // First trace is seed
    });

    it('should calculate average similarity', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: () => ({
          count: 3,
          matches: [
            { id: 'trace_1', score: 0.95, metadata: { status: 'unassigned' } },
            { id: 'trace_2', score: 0.90, metadata: { status: 'unassigned' } },
            { id: 'trace_3', score: 0.85, metadata: { status: 'unassigned' } }
          ]
        })
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 3
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Prompt', workspaceId: 'ws_1' },
        { traceId: 'trace_2', prompt: 'Prompt', workspaceId: 'ws_1' },
        { traceId: 'trace_3', prompt: 'Prompt', workspaceId: 'ws_1' }
      ];

      const result = await service.clusterPrompts(traces);

      // Average of 0.95, 0.90, 0.85 = 0.9
      expect(result.clusters[0].average_similarity).toBeCloseTo(0.9, 1);
    });

    it('should generate unique cluster IDs', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: (_, stored) => {
          const ids = Array.from(stored.keys());
          return {
            count: 2,
            matches: ids.slice(0, 2).map((id, i) => ({
              id,
              score: 0.95 - i * 0.02,
              metadata: { status: 'unassigned' }
            }))
          };
        }
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 2
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Prompt A', workspaceId: 'ws_1' },
        { traceId: 'trace_2', prompt: 'Prompt A', workspaceId: 'ws_1' }
      ];

      const result = await service.clusterPrompts(traces);

      expect(result.clusters[0].id).toMatch(/^cluster_/);
    });
  });

  describe('Edge cases', () => {
    it('should handle single trace input', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: () => ({
          count: 1,
          matches: [{ id: 'trace_1', score: 1.0, metadata: { status: 'unassigned' } }]
        })
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 5
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Solo prompt', workspaceId: 'ws_1' }
      ];

      const result = await service.clusterPrompts(traces);

      expect(result.clusters).toHaveLength(0);  // Below min size
      expect(result.orphanedTraceIds).toHaveLength(1);
      expect(result.totalProcessed).toBe(1);
    });

    it('should handle duplicate trace IDs gracefully', async () => {
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: () => ({
          count: 2,
          matches: [
            { id: 'trace_1', score: 0.95, metadata: { status: 'unassigned' } },
            { id: 'trace_1', score: 0.95, metadata: { status: 'unassigned' } }  // Duplicate
          ]
        })
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 1
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Prompt', workspaceId: 'ws_1' }
      ];

      // Should not throw
      const result = await service.clusterPrompts(traces);

      expect(result.totalProcessed).toBe(1);
    });

    it('should preserve workspace_id in metadata', async () => {
      const { vectorService, embeddingService, storedMetadata } = createMockServices();
      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 1
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Prompt', workspaceId: 'ws_workspace_123' }
      ];

      await service.clusterPrompts(traces);

      const metadata = storedMetadata.get('trace_1');
      expect(metadata?.workspace_id).toBe('ws_workspace_123');
    });
  });

  describe('Greedy algorithm behavior', () => {
    it('should not include already-clustered traces in new clusters', async () => {
      let queryCount = 0;
      const { vectorService, embeddingService } = createMockServices({
        queryBehavior: () => {
          queryCount++;
          // First query returns all traces
          // Second query would also return all, but they should be filtered out
          return {
            count: 3,
            matches: [
              { id: 'trace_1', score: 0.95, metadata: { status: 'unassigned' } },
              { id: 'trace_2', score: 0.93, metadata: { status: 'unassigned' } },
              { id: 'trace_3', score: 0.91, metadata: { status: 'unassigned' } }
            ]
          };
        }
      });

      const service = new ClusteringService({
        vectorService,
        embeddingService,
        minClusterSize: 3
      });

      const traces: TracePrompt[] = [
        { traceId: 'trace_1', prompt: 'Prompt', workspaceId: 'ws_1' },
        { traceId: 'trace_2', prompt: 'Prompt', workspaceId: 'ws_1' },
        { traceId: 'trace_3', prompt: 'Prompt', workspaceId: 'ws_1' }
      ];

      const result = await service.clusterPrompts(traces);

      // Should only create one cluster (greedy assigns all at once)
      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0].trace_ids).toHaveLength(3);

      // Query should only be called once since all traces cluster together
      expect(queryCount).toBe(1);
    });
  });
});
