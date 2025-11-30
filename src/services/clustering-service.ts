/**
 * Clustering Service
 *
 * Greedy similarity-based clustering for system prompts.
 * Uses Vectorize for efficient similarity search.
 */

import type { VectorService } from './vector-service';
import type { EmbeddingService } from './embedding-service';
import type { PromptCluster, SystemPromptVector } from '../types/vectorize';

export interface ClusteringServiceConfig {
  vectorService: VectorService;
  embeddingService: EmbeddingService;
  similarityThreshold?: number;  // default: 0.85
  minClusterSize?: number;       // default: 5
}

export interface TracePrompt {
  traceId: string;
  prompt: string;
  workspaceId: string;
}

export interface ClusteringResult {
  clusters: PromptCluster[];
  orphanedTraceIds: string[];
  totalProcessed: number;
}

export class ClusteringService {
  private vectorService: VectorService;
  private embeddingService: EmbeddingService;
  private similarityThreshold: number;
  private minClusterSize: number;

  constructor(config: ClusteringServiceConfig) {
    this.vectorService = config.vectorService;
    this.embeddingService = config.embeddingService;
    this.similarityThreshold = config.similarityThreshold ?? 0.85;
    this.minClusterSize = config.minClusterSize ?? 5;
  }

  /**
   * Cluster traces by system prompt similarity
   *
   * Algorithm:
   * 1. Embed all prompts and store in Vectorize
   * 2. Pick first unassigned as seed
   * 3. Query for similar prompts (score > threshold)
   * 4. Group into cluster, mark as clustered
   * 5. Repeat until no unassigned remain
   */
  async clusterPrompts(traces: TracePrompt[]): Promise<ClusteringResult> {
    if (traces.length === 0) {
      return { clusters: [], orphanedTraceIds: [], totalProcessed: 0 };
    }

    // Step 1: Embed all prompts
    const prompts = traces.map(t => t.prompt);
    const embeddings = await this.embeddingService.embedBatch(prompts);

    // Step 2: Store in Vectorize with 'unassigned' status
    const vectors: SystemPromptVector[] = traces.map((trace, i) => ({
      id: trace.traceId,
      values: embeddings[i],
      metadata: {
        workspace_id: trace.workspaceId,
        trace_id: trace.traceId,
        status: 'unassigned' as const
      }
    }));

    await this.vectorService.upsertBatch(vectors);

    // Step 3: Greedy clustering
    const clusters: PromptCluster[] = [];
    const clustered = new Set<string>();
    const traceMap = new Map(traces.map(t => [t.traceId, t]));
    const embeddingMap = new Map(traces.map((t, i) => [t.traceId, embeddings[i]]));

    for (const trace of traces) {
      if (clustered.has(trace.traceId)) {
        continue;
      }

      // Use this trace as seed
      const seedEmbedding = embeddingMap.get(trace.traceId)!;

      // Query for similar prompts
      const queryResult = await this.vectorService.query(seedEmbedding, {
        topK: 100,  // Get up to 100 similar
        filter: { status: 'unassigned' }
      });

      // Filter by similarity threshold and exclude already clustered
      const clusterMembers = queryResult.matches
        .filter(m =>
          m.score >= this.similarityThreshold &&
          !clustered.has(m.id)
        )
        .map(m => m.id);

      // Always include the seed
      if (!clusterMembers.includes(trace.traceId)) {
        clusterMembers.unshift(trace.traceId);
      }

      // Calculate average similarity
      const avgSimilarity = queryResult.matches
        .filter(m => clusterMembers.includes(m.id))
        .reduce((sum, m) => sum + m.score, 0) / clusterMembers.length;

      // Create cluster
      const cluster: PromptCluster = {
        id: `cluster_${crypto.randomUUID()}`,
        trace_ids: clusterMembers,
        prompts: clusterMembers.map(id => traceMap.get(id)!.prompt),
        centroid_trace_id: trace.traceId,
        average_similarity: avgSimilarity
      };

      clusters.push(cluster);

      // Mark all members as clustered
      for (const id of clusterMembers) {
        clustered.add(id);
      }

      // Update Vectorize metadata
      for (const id of clusterMembers) {
        const embedding = embeddingMap.get(id)!;
        await this.vectorService.updateMetadata(id, embedding, {
          workspace_id: traceMap.get(id)!.workspaceId,
          trace_id: id,
          status: 'clustered',
          cluster_id: cluster.id
        });
      }
    }

    // Step 4: Identify orphans (clusters too small)
    const validClusters: PromptCluster[] = [];
    const orphanedTraceIds: string[] = [];

    for (const cluster of clusters) {
      if (cluster.trace_ids.length >= this.minClusterSize) {
        validClusters.push(cluster);
      } else {
        orphanedTraceIds.push(...cluster.trace_ids);

        // Update Vectorize metadata to mark as orphaned
        for (const id of cluster.trace_ids) {
          const embedding = embeddingMap.get(id)!;
          await this.vectorService.updateMetadata(id, embedding, {
            workspace_id: traceMap.get(id)!.workspaceId,
            trace_id: id,
            status: 'orphaned'
          });
        }
      }
    }

    return {
      clusters: validClusters,
      orphanedTraceIds,
      totalProcessed: traces.length
    };
  }

  /**
   * Get similarity threshold
   */
  getSimilarityThreshold(): number {
    return this.similarityThreshold;
  }

  /**
   * Get minimum cluster size
   */
  getMinClusterSize(): number {
    return this.minClusterSize;
  }
}
