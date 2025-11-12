import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { z } from 'zod';
import { JobManager } from '../jobs/job-manager';
import { EvalGenerationJob } from '../jobs/eval-generation-job';
import { EvalExecutionJob } from '../jobs/eval-execution-job';
import {
  handleError,
  notFoundError,
  validationError,
  insufficientExamplesError
} from '../utils/errors';
import type {
  Eval,
  EvalSummary,
  GenerateEvalRequest,
  ExecuteEvalRequest,
  UpdateEvalRequest
} from '../types/api';

// Request schemas
const GenerateEvalSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  model: z.string().optional(),
  custom_instructions: z.string().optional()
});

const ExecuteEvalSchema = z.object({
  trace_ids: z.array(z.string()).optional(),
  force: z.boolean().optional().default(false)
});

const UpdateEvalSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  code: z.string().optional()
});

const ListEvalsSchema = z.object({
  eval_set_id: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50)
});

export class EvalsAPI {
  private jobManager: JobManager;

  constructor(
    private db: D1Database,
    private anthropicApiKey: string,
    private sandboxBinding?: DurableObjectNamespace<Sandbox>
  ) {
    this.jobManager = new JobManager(db);
  }

  // POST /api/eval-sets/:id/generate - Generate eval (async with job)
  async generateEval(
    evalSetId: string,
    workspaceId: string,
    body: any
  ): Promise<Response> {
    try {
      const validated = GenerateEvalSchema.parse(body) as GenerateEvalRequest;

      // Check if eval set exists
      const evalSet = await this.db
        .prepare('SELECT id, minimum_examples FROM eval_sets WHERE id = ?')
        .bind(evalSetId)
        .first();

      if (!evalSet) {
        return notFoundError('Eval set', evalSetId);
      }

      // Check if we have sufficient examples
      const feedbackCount = await this.db
        .prepare(
          `SELECT
             SUM(CASE WHEN rating = 'positive' THEN 1 ELSE 0 END) as positive_count,
             SUM(CASE WHEN rating = 'negative' THEN 1 ELSE 0 END) as negative_count
           FROM feedback
           WHERE eval_set_id = ?`
        )
        .bind(evalSetId)
        .first();

      const positiveCount = (feedbackCount?.positive_count as number) || 0;
      const negativeCount = (feedbackCount?.negative_count as number) || 0;
      const minimumExamples = evalSet.minimum_examples as number;

      if (positiveCount < 1 || negativeCount < 1) {
        return insufficientExamplesError(
          positiveCount + negativeCount,
          minimumExamples
        );
      }

      // Create job
      const job = await this.jobManager.createJob('generate', workspaceId, {
        evalSetId,
        workspaceId
      });

      // Start generation in background (don't await)
      const generationJob = new EvalGenerationJob(
        {
          jobId: job.id,
          evalSetId,
          name: validated.name,
          description: validated.description,
          model: validated.model,
          customInstructions: validated.custom_instructions,
          workspaceId
        },
        {
          db: this.db,
          anthropicApiKey: this.anthropicApiKey,
          sandboxBinding: this.sandboxBinding
        }
      );

      // Execute in background (fire and forget)
      generationJob.execute().catch(error => {
        console.error('Generation job failed:', error);
      });

      return new Response(
        JSON.stringify({
          job_id: job.id,
          status: job.status
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      return handleError(error);
    }
  }

  // GET /api/evals - List evals
  async listEvals(queryParams: URLSearchParams): Promise<Response> {
    try {
      const params = {
        eval_set_id: queryParams.get('eval_set_id') || undefined,
        cursor: queryParams.get('cursor') || undefined,
        limit: queryParams.get('limit') ? parseInt(queryParams.get('limit')!) : undefined
      };

      const validated = ListEvalsSchema.parse(params);

      let query = 'SELECT * FROM evals';
      const conditions: string[] = [];
      const bindings: any[] = [];

      if (validated.eval_set_id) {
        conditions.push('eval_set_id = ?');
        bindings.push(validated.eval_set_id);
      }

      if (validated.cursor) {
        conditions.push('id > ?');
        bindings.push(validated.cursor);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      bindings.push(validated.limit! + 1); // Fetch one extra to check has_more

      const results = await this.db.prepare(query).bind(...bindings).all();

      const hasMore = results.results.length > validated.limit!;
      const evals = results.results.slice(0, validated.limit!);

      const evalSummaries: EvalSummary[] = evals.map(record => ({
        id: record.id as string,
        name: record.name as string,
        description: record.description as string | null,
        eval_set_id: record.eval_set_id as string,
        accuracy: record.accuracy as number,
        execution_count: record.execution_count as number,
        contradiction_count: record.contradiction_count as number,
        created_at: record.created_at as string,
        updated_at: record.updated_at as string
      }));

      return new Response(
        JSON.stringify({
          evals: evalSummaries,
          next_cursor: hasMore ? evals[evals.length - 1].id : null,
          has_more: hasMore
        }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      return handleError(error);
    }
  }

  // GET /api/evals/:id - Get eval details
  async getEval(evalId: string): Promise<Response> {
    try {
      const record = await this.db
        .prepare('SELECT * FROM evals WHERE id = ?')
        .bind(evalId)
        .first();

      if (!record) {
        return notFoundError('Eval', evalId);
      }

      const eval_: Eval = {
        id: record.id as string,
        name: record.name as string,
        description: record.description as string | null,
        eval_set_id: record.eval_set_id as string,
        code: record.code as string,
        model_used: record.model_used as string,
        accuracy: record.accuracy as number,
        test_results: record.test_results ? JSON.parse(record.test_results as string) : null,
        execution_count: record.execution_count as number,
        contradiction_count: record.contradiction_count as number,
        created_at: record.created_at as string,
        updated_at: record.updated_at as string
      };

      return new Response(JSON.stringify(eval_), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return handleError(error);
    }
  }

  // PATCH /api/evals/:id - Update eval
  async updateEval(evalId: string, body: any): Promise<Response> {
    try {
      const validated = UpdateEvalSchema.parse(body) as UpdateEvalRequest;

      // Check if eval exists
      const existing = await this.db
        .prepare('SELECT id FROM evals WHERE id = ?')
        .bind(evalId)
        .first();

      if (!existing) {
        return notFoundError('Eval', evalId);
      }

      // Build update query
      const updates: string[] = [];
      const bindings: any[] = [];

      if (validated.name !== undefined) {
        updates.push('name = ?');
        bindings.push(validated.name);
      }

      if (validated.description !== undefined) {
        updates.push('description = ?');
        bindings.push(validated.description);
      }

      if (validated.code !== undefined) {
        updates.push('code = ?');
        bindings.push(validated.code);
        // Invalidate accuracy when code is modified
        updates.push('accuracy = NULL');
        updates.push('test_results = NULL');
      }

      updates.push('updated_at = ?');
      bindings.push(new Date().toISOString());

      bindings.push(evalId);

      await this.db
        .prepare(`UPDATE evals SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...bindings)
        .run();

      // Return updated eval
      return this.getEval(evalId);
    } catch (error) {
      return handleError(error);
    }
  }

  // POST /api/evals/:id/execute - Execute eval (async with job)
  async executeEval(
    evalId: string,
    workspaceId: string,
    body: any
  ): Promise<Response> {
    try {
      const validated = ExecuteEvalSchema.parse(body) as ExecuteEvalRequest;

      // Check if eval exists
      const eval_ = await this.db
        .prepare('SELECT id, eval_set_id FROM evals WHERE id = ?')
        .bind(evalId)
        .first();

      if (!eval_) {
        return notFoundError('Eval', evalId);
      }

      // Estimate count
      let estimatedCount = 0;
      if (validated.trace_ids && validated.trace_ids.length > 0) {
        estimatedCount = validated.trace_ids.length;
      } else {
        // Count traces in eval set
        const countResult = await this.db
          .prepare(
            `SELECT COUNT(DISTINCT trace_id) as count
             FROM feedback
             WHERE eval_set_id = ?`
          )
          .bind(eval_.eval_set_id)
          .first();
        estimatedCount = (countResult?.count as number) || 0;
      }

      // Create job
      const job = await this.jobManager.createJob('execute', workspaceId, {
        evalId,
        traceIds: validated.trace_ids,
        workspaceId
      });

      // Start execution in background
      const executionJob = new EvalExecutionJob(
        {
          jobId: job.id,
          evalId,
          traceIds: validated.trace_ids,
          force: validated.force,
          workspaceId
        },
        {
          db: this.db,
          sandboxBinding: this.sandboxBinding
        }
      );

      // Execute in background (fire and forget)
      executionJob.execute().catch(error => {
        console.error('Execution job failed:', error);
      });

      return new Response(
        JSON.stringify({
          job_id: job.id,
          status: job.status,
          estimated_count: estimatedCount
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      return handleError(error);
    }
  }

  // DELETE /api/evals/:id - Delete eval
  async deleteEval(evalId: string): Promise<Response> {
    try {
      // Check if eval exists
      const existing = await this.db
        .prepare('SELECT id FROM evals WHERE id = ?')
        .bind(evalId)
        .first();

      if (!existing) {
        return notFoundError('Eval', evalId);
      }

      // Delete eval (cascades to eval_executions)
      await this.db
        .prepare('DELETE FROM evals WHERE id = ?')
        .bind(evalId)
        .run();

      return new Response(null, { status: 204 });
    } catch (error) {
      return handleError(error);
    }
  }
}
