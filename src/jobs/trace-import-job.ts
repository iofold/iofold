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

  constructor(
    private config: TraceImportJobConfig,
    private deps: TraceImportJobDeps
  ) {
    this.jobManager = new JobManager(deps.db);
  }

  async execute(stream?: SSEStream): Promise<TraceImportJobResult> {
    this.stream = stream;

    try {
      // Update job to running
      await this.jobManager.updateJobStatus(this.config.jobId, 'running', 0);
      this.emitProgress('running', 0, { imported: 0, total: 0 });

      // Step 1: Fetch integration credentials
      const integration = await this.deps.db
        .prepare(
          `SELECT id, platform, api_key_encrypted, config, workspace_id
           FROM integrations
           WHERE id = ? AND workspace_id = ?`
        )
        .bind(this.config.integrationId, this.config.workspaceId)
        .first();

      if (!integration) {
        throw new Error(`Integration ${this.config.integrationId} not found`);
      }

      if (integration.platform !== 'langfuse') {
        throw new Error(`Unsupported platform: ${integration.platform}. Only Langfuse is supported in MVP.`);
      }

      // Step 2: Decrypt API key
      // Try base64 first (MVP/local dev), then AES-GCM (production)
      const apiKeyEncrypted = integration.api_key_encrypted as string;
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

      const config = integration.config ? JSON.parse(integration.config as string) : {};
      const adapter = new LangfuseAdapter({
        publicKey,
        secretKey,
        baseUrl: config.base_url
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
      await this.deps.db
        .prepare(
          `UPDATE integrations
           SET last_synced_at = ?
           WHERE id = ?`
        )
        .bind(
          new Date().toISOString(),
          this.config.integrationId
        )
        .run();

      this.emitProgress('running', 95, {
        status: 'Finalizing import',
        ...result
      });

      // Mark job as completed
      await this.jobManager.completeJob(this.config.jobId, result);
      this.emitProgress('completed', 100, result);

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
    await this.deps.db
      .prepare(
        `INSERT INTO traces (
          id, workspace_id, integration_id, trace_id, source, timestamp,
          metadata, steps, input_preview, output_preview, step_count, has_errors, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        traceId,
        workspaceId,
        integrationId,
        trace.trace_id,
        trace.source,
        timestamp,
        JSON.stringify(trace.raw_data?.metadata || {}),
        JSON.stringify(steps),
        inputPreview,
        outputPreview,
        steps.length,
        hasErrors ? 1 : 0,
        now
      )
      .run();
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

    const lastStep = steps[steps.length - 1];

    // Try output field first
    if (lastStep.output) {
      const outputStr = typeof lastStep.output === 'string'
        ? lastStep.output
        : JSON.stringify(lastStep.output);
      return outputStr.substring(0, 200);
    }

    // Try last message
    if (lastStep.messages_added && lastStep.messages_added.length > 0) {
      const lastMsg = lastStep.messages_added[lastStep.messages_added.length - 1];
      return (lastMsg.content || '').substring(0, 200);
    }

    return 'No output';
  }

  private emitProgress(status: string, progress: number, extra?: any) {
    if (this.stream) {
      this.stream.sendProgress({ status, progress, ...extra });
    }
  }
}
