/**
 * AgentDiscoveryJob - Background job for discovering agents from unassigned traces
 *
 * Flow:
 * 1. Fetch unassigned traces from D1
 * 2. Extract system prompts from trace steps
 * 3. Embed prompts and cluster by similarity
 * 4. For clusters with 5+ traces, extract template using Claude
 * 5. Create agent + agent_version in D1
 * 6. Update traces with agent_version_id and assignment_status
 * 7. Emit SSE progress events throughout
 */

import type { D1Database } from '@cloudflare/workers-types';
import { eq, sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';
import { EmbeddingService } from '../services/embedding-service';
import { VectorService } from '../services/vector-service';
import { ClusteringService, type TracePrompt } from '../services/clustering-service';
import type { PromptCluster } from '../types/vectorize';
import type { AgentDiscoveryJobResult } from '../types/agent';
import { createGatewayClient, DEFAULT_MODEL } from '../ai/gateway';
import { createDb, type Database } from '../db/client';
import { traces, agents, agentVersions } from '../db/schema';

export interface AgentDiscoveryJobConfig {
  jobId: string;
  workspaceId: string;
  similarityThreshold?: number;  // default: 0.85
  minClusterSize?: number;       // default: 5
  maxTracesToProcess?: number;   // default: 100
}

export interface AgentDiscoveryJobDeps {
  db: D1Database;
  ai: Ai;
  vectorize: VectorizeIndex;
  /** Cloudflare Account ID for AI Gateway */
  cfAccountId: string;
  /** Cloudflare AI Gateway ID */
  cfGatewayId: string;
  /** Optional AI Gateway authentication token */
  cfGatewayToken?: string;
}

interface ExtractedTemplate {
  template: string;
  variables: string[];
  agent_name: string;
}

export class AgentDiscoveryJob {
  private jobManager: JobManager;
  private embeddingService: EmbeddingService;
  private vectorService: VectorService;
  private clusteringService: ClusteringService;
  private client: OpenAI;
  private stream?: SSEStream;
  private drizzle: Database;

  constructor(
    private config: AgentDiscoveryJobConfig,
    private deps: AgentDiscoveryJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
    this.drizzle = createDb(deps.db);
    this.embeddingService = new EmbeddingService({ ai: deps.ai });
    this.vectorService = new VectorService({ vectorize: deps.vectorize });
    this.clusteringService = new ClusteringService({
      vectorService: this.vectorService,
      embeddingService: this.embeddingService,
      similarityThreshold: config.similarityThreshold ?? 0.85,
      minClusterSize: config.minClusterSize ?? 5
    });
    this.client = createGatewayClient({
      CF_ACCOUNT_ID: deps.cfAccountId,
      CF_AI_GATEWAY_ID: deps.cfGatewayId,
      CF_AI_GATEWAY_TOKEN: deps.cfGatewayToken,
    });
  }

  async execute(stream?: SSEStream): Promise<AgentDiscoveryJobResult> {
    this.stream = stream;

    try {
      // Update job to running
      await this.jobManager.updateJobStatus(this.config.jobId, 'running', 0);
      this.emitProgress('fetching_traces', 0);

      console.log(JSON.stringify({
        event: 'agent_discovery_start',
        job_id: this.config.jobId,
        workspace_id: this.config.workspaceId,
        config: {
          similarity_threshold: this.config.similarityThreshold ?? 0.85,
          min_cluster_size: this.config.minClusterSize ?? 5,
          max_traces: this.config.maxTracesToProcess ?? 100
        }
      }));

      // Step 1: Fetch unassigned traces from D1
      const maxTraces = this.config.maxTracesToProcess ?? 100;
      const unassignedTraces = await this.drizzle
        .select({
          id: traces.id,
          steps: traces.steps,
          workspaceId: traces.workspaceId
        })
        .from(traces)
        .where(
          sql`${traces.workspaceId} = ${this.config.workspaceId} AND ${traces.assignmentStatus} = 'unassigned'`
        )
        .limit(maxTraces);

      console.log(JSON.stringify({
        event: 'traces_fetched',
        job_id: this.config.jobId,
        count: unassignedTraces.length
      }));

      if (unassignedTraces.length === 0) {
        const result: AgentDiscoveryJobResult = {
          discovered_agents: [],
          assigned_traces: 0,
          orphaned_traces: 0
        };

        console.log(JSON.stringify({
          event: 'agent_discovery_complete',
          job_id: this.config.jobId,
          result,
          reason: 'no_unassigned_traces'
        }));

        await this.jobManager.completeJob(this.config.jobId, result);
        this.emitProgress('completed', 100, result);
        return result;
      }

      this.emitProgress('extracting_prompts', 10, {
        traces_found: unassignedTraces.length
      });

      // Step 2: Extract system prompts from each trace
      const tracePrompts: TracePrompt[] = [];
      for (const row of unassignedTraces) {
        const traceId = row.id;
        const steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps;
        const workspaceId = row.workspaceId;

        const systemPrompt = this.extractSystemPrompt(steps);
        if (systemPrompt) {
          tracePrompts.push({
            traceId,
            prompt: systemPrompt,
            workspaceId
          });
        }
      }

      console.log(JSON.stringify({
        event: 'prompts_extracted',
        job_id: this.config.jobId,
        total_traces: unassignedTraces.length,
        traces_with_prompts: tracePrompts.length,
        traces_without_prompts: unassignedTraces.length - tracePrompts.length
      }));

      if (tracePrompts.length === 0) {
        // No system prompts found - mark all as orphaned
        await this.markAllAsOrphaned(unassignedTraces.map(r => r.id));

        const result: AgentDiscoveryJobResult = {
          discovered_agents: [],
          assigned_traces: 0,
          orphaned_traces: unassignedTraces.length
        };

        console.log(JSON.stringify({
          event: 'agent_discovery_complete',
          job_id: this.config.jobId,
          result,
          reason: 'no_system_prompts_found'
        }));

        await this.jobManager.completeJob(this.config.jobId, result);
        this.emitProgress('completed', 100, result);
        return result;
      }

      this.emitProgress('clustering_prompts', 30, {
        prompts_extracted: tracePrompts.length
      });

      // Step 3: Cluster prompts by similarity
      const clusteringResult = await this.clusteringService.clusterPrompts(tracePrompts);

      console.log(JSON.stringify({
        event: 'clustering_complete',
        job_id: this.config.jobId,
        clusters_found: clusteringResult.clusters.length,
        orphaned_from_clustering: clusteringResult.orphanedTraceIds.length,
        cluster_sizes: clusteringResult.clusters.map(c => ({
          id: c.id,
          size: c.trace_ids.length,
          avg_similarity: c.average_similarity.toFixed(3)
        }))
      }));

      this.emitProgress('extracting_templates', 50, {
        clusters_found: clusteringResult.clusters.length,
        orphaned: clusteringResult.orphanedTraceIds.length
      });

      // Step 4: Extract templates and create agents for valid clusters
      const discoveredAgents: string[] = [];
      let assignedTracesCount = 0;
      let failedClusterTracesCount = 0;

      for (let i = 0; i < clusteringResult.clusters.length; i++) {
        const cluster = clusteringResult.clusters[i];

        this.emitProgress('extracting_templates', 50 + (i / clusteringResult.clusters.length) * 30, {
          processing_cluster: i + 1,
          total_clusters: clusteringResult.clusters.length
        });

        try {
          // Extract template using Claude
          const template = await this.extractTemplate(cluster);

          console.log(JSON.stringify({
            event: 'template_extracted',
            job_id: this.config.jobId,
            cluster_id: cluster.id,
            agent_name: template.agent_name,
            variables: template.variables,
            template_preview: template.template.substring(0, 100) + (template.template.length > 100 ? '...' : '')
          }));

          // Create agent and version
          const agentId = await this.createAgent(cluster, template);
          discoveredAgents.push(agentId);
          assignedTracesCount += cluster.trace_ids.length;

          console.log(JSON.stringify({
            event: 'agent_created',
            job_id: this.config.jobId,
            agent_id: agentId,
            agent_name: template.agent_name,
            traces_assigned: cluster.trace_ids.length
          }));

          this.emitProgress('extracting_templates', 50 + ((i + 1) / clusteringResult.clusters.length) * 30, {
            agent_created: agentId,
            traces_assigned: cluster.trace_ids.length
          });
        } catch (error: any) {
          console.error(JSON.stringify({
            event: 'cluster_processing_failed',
            job_id: this.config.jobId,
            cluster_id: cluster.id,
            error: error.message,
            traces_affected: cluster.trace_ids.length
          }));
          // Mark cluster traces as orphaned
          await this.markAllAsOrphaned(cluster.trace_ids);
          failedClusterTracesCount += cluster.trace_ids.length;
        }
      }

      // Step 5: Mark remaining traces as orphaned
      if (clusteringResult.orphanedTraceIds.length > 0) {
        await this.markAllAsOrphaned(clusteringResult.orphanedTraceIds);
      }

      this.emitProgress('finalizing', 95);

      const result: AgentDiscoveryJobResult = {
        discovered_agents: discoveredAgents,
        assigned_traces: assignedTracesCount,
        orphaned_traces: clusteringResult.orphanedTraceIds.length + failedClusterTracesCount
      };

      console.log(JSON.stringify({
        event: 'agent_discovery_complete',
        job_id: this.config.jobId,
        result,
        summary: {
          total_traces_processed: unassignedTraces.length,
          traces_with_prompts: tracePrompts.length,
          clusters_formed: clusteringResult.clusters.length,
          agents_created: discoveredAgents.length,
          traces_assigned: assignedTracesCount,
          traces_orphaned: result.orphaned_traces
        }
      }));

      // Mark job as completed
      await this.jobManager.completeJob(this.config.jobId, result);
      this.emitProgress('completed', 100, result);

      return result;
    } catch (error: any) {
      console.error('Agent discovery job failed:', error);
      await this.jobManager.failJob(this.config.jobId, error.message);

      if (this.stream) {
        this.stream.sendFailed(error.message, error.stack);
      }

      throw error;
    }
  }

  /**
   * Extract system prompt from trace steps
   * Looks for the first message with role='system'
   */
  private extractSystemPrompt(steps: any[]): string | null {
    for (const step of steps) {
      if (step.messages_added && Array.isArray(step.messages_added)) {
        for (const message of step.messages_added) {
          if (message.role === 'system' && message.content) {
            return message.content;
          }
        }
      }
    }
    return null;
  }

  /**
   * Extract template from cluster using Claude
   * Prompt Claude to identify common patterns and extract template with variables
   */
  private async extractTemplate(cluster: PromptCluster): Promise<ExtractedTemplate> {
    // Take up to 5 example prompts from the cluster
    const examplePrompts = cluster.prompts.slice(0, 5);

    const prompt = `Given these similar system prompts, extract the common template with variable placeholders:

Examples:
${examplePrompts.map((p, i) => `${i + 1}. ${p}`).join('\n\n')}

Output JSON:
{
  "template": "The template with {{variable_name}} placeholders for varying parts",
  "variables": ["variable_name", ...],
  "agent_name": "Suggested name for this agent (2-4 words, descriptive)"
}

Rules:
- Use {{variable_name}} for parts that vary across examples
- Keep constants exactly as they appear
- Variables should be lowercase_with_underscores
- Agent name should describe the agent's purpose
- Output ONLY valid JSON, no other text`;

    const response = await this.client.chat.completions.create({
      model: DEFAULT_MODEL,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Extract JSON from response (OpenAI format)
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in LLM response');
    }

    let jsonText = content.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      // Try without the json language identifier
      const codeMatch = jsonText.match(/```\n([\s\S]*?)\n```/);
      if (codeMatch) {
        jsonText = codeMatch[1];
      }
    }

    try {
      const extracted = JSON.parse(jsonText) as ExtractedTemplate;

      // Validate structure
      if (!extracted.template || !extracted.variables || !extracted.agent_name) {
        throw new Error('Invalid template structure');
      }

      return extracted;
    } catch (error) {
      throw new Error(`Failed to parse template extraction: ${error}`);
    }
  }

  /**
   * Create agent and agent_version in database
   */
  private async createAgent(cluster: PromptCluster, template: ExtractedTemplate): Promise<string> {
    const agentId = `agent_${crypto.randomUUID()}`;
    const versionId = `agentv_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Create agent
    await this.drizzle.insert(agents).values({
      id: agentId,
      workspaceId: this.config.workspaceId,
      name: template.agent_name,
      description: `Discovered from ${cluster.trace_ids.length} similar traces`,
      status: 'discovered',
      activeVersionId: versionId,
      createdAt: now,
      updatedAt: now
    });

    // Create agent version
    await this.drizzle.insert(agentVersions).values({
      id: versionId,
      agentId,
      version: 1,
      promptTemplate: template.template,
      variables: template.variables as unknown as Record<string, unknown>,
      source: 'discovered',
      parentVersionId: null,
      accuracy: null,
      status: 'active',
      createdAt: now
    });

    // Update traces with agent_version_id and assignment_status
    for (const traceId of cluster.trace_ids) {
      await this.drizzle
        .update(traces)
        .set({
          agentVersionId: versionId,
          assignmentStatus: 'assigned'
        })
        .where(eq(traces.id, traceId));
    }

    return agentId;
  }

  /**
   * Mark traces as orphaned (no cluster found)
   */
  private async markAllAsOrphaned(traceIds: string[]): Promise<void> {
    if (traceIds.length === 0) return;

    for (const traceId of traceIds) {
      await this.drizzle
        .update(traces)
        .set({ assignmentStatus: 'orphaned' })
        .where(eq(traces.id, traceId));
    }
  }

  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
