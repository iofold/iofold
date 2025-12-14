/**
 * TraceImportJob - Background job for importing traces from external platforms
 *
 * Minimal MVP implementation:
 * - Fetches up to 100 traces from Langfuse
 * - Normalizes traces to LangGraphExecutionStep format
 * - Stores traces in D1 database
 * - Updates job progress periodically
 * - Handles errors gracefully
 */

import type { D1Database } from '@cloudflare/workers-types';
import { LangfuseAdapter } from '../adapters/langfuse';
import type { Trace } from '../types/trace';
import { JobManager } from './job-manager';
import { SSEStream } from '../utils/sse';
import { decryptAPIKey } from '../utils/crypto';
import { QueueProducer, type Queue } from '../queue/producer';
import { createDb, type Database } from '../db/client';
import { eq, and } from 'drizzle-orm';
import { integrations, traces } from '../db/schema';

/**
 * Simple base64 decode for MVP (matching integrations.ts encryption)
 */
function decodeBase64(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

export interface TraceImportJobConfig {
  jobId: string;
  integrationId: string;
  workspaceId: string;
  filters?: {
    date_from?: string;
    date_to?: string;
    tags?: string[];
    user_ids?: string[];
    limit?: number;
  };
}

export interface TraceImportJobDeps {
  db: D1Database;
  encryptionKey: string;
  queue?: Queue;
}

export interface TraceImportJobResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{
    trace_id: string;
    error: string;
  }>;
}

export class TraceImportJob {
  private jobManager: JobManager;
  private stream?: SSEStream;
  private db: Database;

  constructor(
    private config: TraceImportJobConfig,
    private deps: TraceImportJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
    this.db = createDb(deps.db);
  }

  async execute(stream?: SSEStream): Promise<TraceImportJobResult> {
    this.stream = stream;

    try {
      // Update job to running
      await this.jobManager.updateJobStatus(this.config.jobId, 'running', 0);
      this.emitProgress('running', 0, { imported: 0, total: 0 });

      // Step 1: Fetch integration credentials
      const integrationResult = await this.db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.id, this.config.integrationId),
            eq(integrations.workspaceId, this.config.workspaceId)
          )
        )
        .limit(1);

      const integration = integrationResult[0];

      if (!integration) {
        throw new Error(`Integration ${this.config.integrationId} not found`);
      }

      if (integration.platform !== 'langfuse') {
        throw new Error(`Unsupported platform: ${integration.platform}. Only Langfuse is supported in MVP.`);
      }

      // Step 2: Decrypt API key
      // Try base64 first (MVP/local dev), then AES-GCM (production)
      const apiKeyEncrypted = integration.apiKeyEncrypted;
      let apiKey: string;

      // For MVP, use simple base64 decode (matching integrations.ts encryption)
      // In production, this should use proper AES-GCM encryption
      try {
        apiKey = decodeBase64(apiKeyEncrypted);
        // Validate decoded key looks like an API key (contains colon for langfuse)
        if (!apiKey.includes(':')) {
          throw new Error('Invalid format');
        }
      } catch {
        // Fallback to AES-GCM for production-encrypted keys
        apiKey = await decryptAPIKey(apiKeyEncrypted, this.deps.encryptionKey);
      }

      // Parse Langfuse credentials (format: "publicKey:secretKey")
      const [publicKey, secretKey] = apiKey.split(':');
      if (!publicKey || !secretKey) {
        throw new Error('Invalid Langfuse API key format. Expected "publicKey:secretKey"');
      }

      const config = integration.config as Record<string, any> || {};
      const adapter = new LangfuseAdapter({
        publicKey,
        secretKey,
        baseUrl: config.base_url as string | undefined
      });

      // Step 3: Fetch traces from Langfuse
      const limit = Math.min(this.config.filters?.limit || 100, 100); // MVP: max 100 traces

      this.emitProgress('running', 10, {
        status: 'Fetching traces from Langfuse',
        imported: 0,
        total: limit
      });

      const traces = await adapter.fetchTraces({
        limit,
        userId: this.config.filters?.user_ids?.[0],
        tags: this.config.filters?.tags,
        fromTimestamp: this.config.filters?.date_from
          ? new Date(this.config.filters.date_from)
          : undefined,
        toTimestamp: this.config.filters?.date_to
          ? new Date(this.config.filters.date_to)
          : undefined
      });

      this.emitProgress('running', 30, {
        status: `Fetched ${traces.length} traces. Starting import...`,
        imported: 0,
        total: traces.length
      });

      // Step 4: Import traces into database
      const result: TraceImportJobResult = {
        imported: 0,
        skipped: 0,
        failed: 0,
        errors: []
      };

      for (let i = 0; i < traces.length; i++) {
        const trace = traces[i];

        try {
          await this.importTrace(trace, this.config.integrationId, this.config.workspaceId);
          result.imported++;
        } catch (error: any) {
          // Check if it's a duplicate (UNIQUE constraint violation)
          if (error.message?.includes('UNIQUE constraint failed')) {
            result.skipped++;
          } else {
            result.failed++;
            result.errors.push({
              trace_id: trace.trace_id,
              error: error.message || 'Unknown error'
            });
          }
        }

        // Emit progress every 10 traces or on last trace
        if ((i + 1) % 10 === 0 || i === traces.length - 1) {
          const progress = 30 + Math.floor(((i + 1) / traces.length) * 60);
          this.emitProgress('running', progress, {
            status: 'Importing traces',
            imported: result.imported,
            skipped: result.skipped,
            failed: result.failed,
            total: traces.length
          });
        }
      }

      // Step 5: Update integration last_synced_at
      await this.db
        .update(integrations)
        .set({ lastSyncedAt: new Date().toISOString() })
        .where(eq(integrations.id, this.config.integrationId));

      this.emitProgress('running', 95, {
        status: 'Finalizing import',
        ...result
      });

      // Mark job as completed
      await this.jobManager.completeJob(this.config.jobId, result);
      this.emitProgress('completed', 100, result);

      // Trigger agent discovery job if traces were imported and queue is available
      if (result.imported > 0 && this.deps.queue) {
        try {
          const producer = new QueueProducer({
            queue: this.deps.queue,
            db: this.deps.db
          });

          const discoveryResult = await producer.enqueueAgentDiscoveryJob(this.config.workspaceId);

          if (discoveryResult.success) {
            console.log(
              `[TraceImportJob] Auto-triggered agent discovery job ${discoveryResult.job_id} after importing ${result.imported} traces`
            );
          } else {
            console.error(
              `[TraceImportJob] Failed to trigger agent discovery: ${discoveryResult.error}`
            );
          }
        } catch (error: any) {
          // Don't fail the import job if agent discovery enqueue fails
          console.error(
            `[TraceImportJob] Error triggering agent discovery: ${error.message}`
          );
        }
      }

      return result;
    } catch (error: any) {
      console.error('Trace import job failed:', error);
      await this.jobManager.failJob(this.config.jobId, error.message);

      if (this.stream) {
        this.stream.sendFailed(error.message, error.stack);
      }

      throw error;
    }
  }

  private async importTrace(
    trace: Trace,
    integrationId: string,
    workspaceId: string
  ): Promise<void> {
    const now = new Date().toISOString();

    // Extract summary information for performance
    const steps = trace.steps || [];
    const inputPreview = this.extractInputPreview(steps);
    const outputPreview = this.extractOutputPreview(steps);
    const hasErrors = steps.some(step => step.error);

    // Determine timestamp (use first step's timestamp or current time)
    const timestamp = steps.length > 0 && steps[0].timestamp
      ? steps[0].timestamp
      : now;

    // Store trace
    const traceId = `trc_${crypto.randomUUID()}`;
    await this.db
      .insert(traces)
      .values({
        id: traceId,
        workspaceId,
        integrationId,
        traceId: trace.trace_id,
        source: trace.source,
        timestamp,
        metadata: trace.raw_data?.metadata || {},
        steps,
        inputPreview,
        outputPreview,
        stepCount: steps.length,
        hasErrors,
        importedAt: now
      });
  }

  private extractInputPreview(steps: any[]): string {
    if (steps.length === 0) return 'No input';

    const firstStep = steps[0];

    // Try input field first
    if (firstStep.input) {
      const inputStr = typeof firstStep.input === 'string'
        ? firstStep.input
        : JSON.stringify(firstStep.input);
      return inputStr.substring(0, 200);
    }

    // Try first message
    if (firstStep.messages_added && firstStep.messages_added.length > 0) {
      const firstMsg = firstStep.messages_added[0];
      return (firstMsg.content || '').substring(0, 200);
    }

    return 'No input';
  }

  private extractOutputPreview(steps: any[]): string {
    if (steps.length === 0) return 'No output';

    // Search backwards through steps to find the last one with output
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i];

      // Try output field first (handle both string and {content: string} formats)
      if (step.output) {
        let outputStr: string;
        if (typeof step.output === 'object' && 'content' in step.output) {
          outputStr = String(step.output.content);
        } else if (typeof step.output === 'string') {
          outputStr = step.output;
        } else {
          outputStr = JSON.stringify(step.output);
        }
        if (outputStr && outputStr !== '{}') {
          return outputStr.substring(0, 200);
        }
      }

      // Try messages_added for assistant messages
      if (step.messages_added && step.messages_added.length > 0) {
        // Search backwards through messages for last assistant message
        for (let j = step.messages_added.length - 1; j >= 0; j--) {
          const msg = step.messages_added[j];
          if (msg.role === 'assistant' && msg.content) {
            return msg.content.substring(0, 200);
          }
        }
      }
    }

    return 'No output';
  }

  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
