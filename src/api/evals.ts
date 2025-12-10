import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Sandbox } from '@cloudflare/sandbox';
import { z } from 'zod';
import { JobManager } from '../jobs/job-manager';
import { EvalGenerationJob } from '../jobs/eval-generation-job';
import { EvalExecutionJob } from '../jobs/eval-execution-job';
import { PythonRunner } from '../sandbox/python-runner';
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

const CreateEvalSchema = z.object({
  agent_id: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  code: z.string().min(1),
  model_used: z.string().optional().default('manual'),
});

const ListEvalsSchema = z.object({
  agent_id: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50)
});

const PlaygroundRunSchema = z.object({
  code: z.string().min(1),
  trace_ids: z.array(z.string()).min(1).max(50)
});

export interface EvalsAPIGatewayConfig {
  cfAccountId: string;
  cfGatewayId: string;
  cfGatewayToken?: string;
}

export class EvalsAPI {
  private jobManager: JobManager;

  constructor(
    private db: D1Database,
    private gatewayConfig: EvalsAPIGatewayConfig,
    private sandboxBinding?: DurableObjectNamespace<Sandbox>,
    private ctx?: ExecutionContext
  ) {
    this.jobManager = new JobManager(db);
  }

  // POST /api/agents/:id/generate-eval - Generate eval (async with job)
  async generateEval(
    agentId: string,
    workspaceId: string,
    body: any
  ): Promise<Response> {
    try {
      const validated = GenerateEvalSchema.parse(body) as GenerateEvalRequest;

      // Check if agent exists and belongs to workspace
      const agent = await this.db
        .prepare('SELECT id FROM agents WHERE id = ? AND workspace_id = ?')
        .bind(agentId, workspaceId)
        .first();

      if (!agent) {
        return notFoundError('Agent', agentId);
      }

      // Check if we have sufficient examples
      const feedbackCount = await this.db
        .prepare(
          `SELECT
             SUM(CASE WHEN rating = 'positive' THEN 1 ELSE 0 END) as positive_count,
             SUM(CASE WHEN rating = 'negative' THEN 1 ELSE 0 END) as negative_count
           FROM feedback
           WHERE agent_id = ?`
        )
        .bind(agentId)
        .first();

      const positiveCount = (feedbackCount?.positive_count as number) || 0;
      const negativeCount = (feedbackCount?.negative_count as number) || 0;

      if (positiveCount < 1 || negativeCount < 1) {
        return insufficientExamplesError(
          positiveCount + negativeCount,
          2 // Minimum 2 examples (1 positive + 1 negative)
        );
      }

      // Create job with all required metadata for job worker
      const job = await this.jobManager.createJob('generate', workspaceId, {
        agentId: agentId,
        name: validated.name,
        description: validated.description,
        model: validated.model,
        custom_instructions: validated.custom_instructions,
        workspaceId
      });

      // Start generation in background (don't await)
      const generationJob = new EvalGenerationJob(
        {
          jobId: job.id,
          agentId,
          name: validated.name,
          description: validated.description,
          model: validated.model,
          customInstructions: validated.custom_instructions,
          workspaceId
        },
        {
          db: this.db,
          cfAccountId: this.gatewayConfig.cfAccountId,
          cfGatewayId: this.gatewayConfig.cfGatewayId,
          cfGatewayToken: this.gatewayConfig.cfGatewayToken,
          sandboxBinding: this.sandboxBinding
        }
      );

      // Execute in background using ctx.waitUntil to keep worker alive
      const jobPromise = generationJob.execute().catch(error => {
        console.error('Generation job failed:', error);
      });

      if (this.ctx) {
        this.ctx.waitUntil(jobPromise);
      }

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

  // POST /api/evals - Create eval directly (for testing/seeding)
  async createEval(body: any, workspaceId?: string): Promise<Response> {
    try {
      const validated = CreateEvalSchema.parse(body);

      // Check if agent exists and belongs to workspace (if workspace provided)
      let query = 'SELECT id FROM agents WHERE id = ?';
      const params: any[] = [validated.agent_id];

      if (workspaceId) {
        query += ' AND workspace_id = ?';
        params.push(workspaceId);
      }

      const agent = await this.db
        .prepare(query)
        .bind(...params)
        .first();

      if (!agent) {
        return notFoundError('Agent', validated.agent_id);
      }

      // Get next version number for this agent
      const versionResult = await this.db
        .prepare('SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM evals WHERE agent_id = ?')
        .bind(validated.agent_id)
        .first();
      const version = (versionResult?.next_version as number) || 1;

      const evalId = `eval_${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      await this.db
        .prepare(
          `INSERT INTO evals (id, agent_id, version, name, description, code, model_used, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
        )
        .bind(
          evalId,
          validated.agent_id,
          version,
          validated.name,
          validated.description || null,
          validated.code,
          validated.model_used,
          now,
          now
        )
        .run();

      return this.getEval(evalId);
    } catch (error) {
      return handleError(error);
    }
  }

  // GET /api/evals - List evals
  async listEvals(queryParams: URLSearchParams, workspaceId?: string): Promise<Response> {
    try {
      // Validate workspace ID is required
      if (!workspaceId) {
        return validationError('Missing X-Workspace-Id header');
      }

      const params = {
        agent_id: queryParams.get('agent_id') || undefined,
        cursor: queryParams.get('cursor') || undefined,
        limit: queryParams.get('limit') ? parseInt(queryParams.get('limit')!) : undefined
      };

      const validated = ListEvalsSchema.parse(params);

      // Join with agents table to filter by workspace
      let query = 'SELECT e.* FROM evals e INNER JOIN agents a ON e.agent_id = a.id';
      const conditions: string[] = [];
      const bindings: any[] = [];

      // Add workspace filter (required)
      conditions.push('a.workspace_id = ?');
      bindings.push(workspaceId);

      if (validated.agent_id) {
        conditions.push('e.agent_id = ?');
        bindings.push(validated.agent_id);
      }

      if (validated.cursor) {
        conditions.push('e.created_at < ?');
        bindings.push(validated.cursor);
      }

      query += ' WHERE ' + conditions.join(' AND ');
      query += ' ORDER BY e.created_at DESC LIMIT ?';
      bindings.push(validated.limit! + 1); // Fetch one extra to check has_more

      const results = await this.db.prepare(query).bind(...bindings).all();

      const hasMore = results.results.length > validated.limit!;
      const evals = results.results.slice(0, validated.limit!);

      const evalSummaries: EvalSummary[] = evals.map(record => ({
        id: record.id as string,
        name: record.name as string,
        description: record.description as string | null,
        agent_id: record.agent_id as string,
        accuracy: record.accuracy as number,
        execution_count: record.execution_count as number,
        contradiction_count: record.contradiction_count as number,
        created_at: record.created_at as string,
        updated_at: record.updated_at as string
      }));

      return new Response(
        JSON.stringify({
          evals: evalSummaries,
          next_cursor: hasMore ? (evals[evals.length - 1].created_at as string) : null,
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
  async getEval(evalId: string, workspaceId?: string): Promise<Response> {
    try {
      // Join with agents to verify workspace ownership
      let query = workspaceId
        ? 'SELECT e.* FROM evals e INNER JOIN agents a ON e.agent_id = a.id WHERE e.id = ? AND a.workspace_id = ?'
        : 'SELECT * FROM evals WHERE id = ?';

      const params = workspaceId ? [evalId, workspaceId] : [evalId];

      const record = await this.db
        .prepare(query)
        .bind(...params)
        .first();

      if (!record) {
        return notFoundError('Eval', evalId);
      }

      const eval_: Eval = {
        id: record.id as string,
        name: record.name as string,
        description: record.description as string | null,
        agent_id: record.agent_id as string,
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
  async updateEval(evalId: string, body: any, workspaceId?: string): Promise<Response> {
    try {
      const validated = UpdateEvalSchema.parse(body) as UpdateEvalRequest;

      // Check if eval exists and belongs to workspace
      let query = workspaceId
        ? 'SELECT e.id FROM evals e INNER JOIN agents a ON e.agent_id = a.id WHERE e.id = ? AND a.workspace_id = ?'
        : 'SELECT id FROM evals WHERE id = ?';

      const params = workspaceId ? [evalId, workspaceId] : [evalId];

      const existing = await this.db
        .prepare(query)
        .bind(...params)
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
      return this.getEval(evalId, workspaceId);
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

      // Check if eval exists and belongs to workspace
      const eval_ = await this.db
        .prepare('SELECT e.id, e.agent_id FROM evals e INNER JOIN agents a ON e.agent_id = a.id WHERE e.id = ? AND a.workspace_id = ?')
        .bind(evalId, workspaceId)
        .first();

      if (!eval_) {
        return notFoundError('Eval', evalId);
      }

      // Estimate count
      let estimatedCount = 0;
      if (validated.trace_ids && validated.trace_ids.length > 0) {
        estimatedCount = validated.trace_ids.length;
      } else {
        // Count traces for agent
        const countResult = await this.db
          .prepare(
            `SELECT COUNT(DISTINCT trace_id) as count
             FROM feedback
             WHERE agent_id = ?`
          )
          .bind(eval_.agent_id)
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

      // Execute in background using ctx.waitUntil to keep worker alive
      const jobPromise = executionJob.execute().catch(error => {
        console.error('Execution job failed:', error);
      });

      if (this.ctx) {
        this.ctx.waitUntil(jobPromise);
      }

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
  async deleteEval(evalId: string, workspaceId?: string): Promise<Response> {
    try {
      // Check if eval exists and belongs to workspace
      let query = workspaceId
        ? 'SELECT e.id FROM evals e INNER JOIN agents a ON e.agent_id = a.id WHERE e.id = ? AND a.workspace_id = ?'
        : 'SELECT id FROM evals WHERE id = ?';

      const params = workspaceId ? [evalId, workspaceId] : [evalId];

      const existing = await this.db
        .prepare(query)
        .bind(...params)
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

  // POST /api/evals/:id/playground - Run eval code against traces without persisting
  async playgroundRun(
    evalId: string,
    workspaceId: string,
    body: any
  ): Promise<Response> {
    try {
      const validated = PlaygroundRunSchema.parse(body);

      // Check if eval exists, belongs to workspace, and get agent_id
      const evalRecord = await this.db
        .prepare('SELECT e.id, e.agent_id FROM evals e INNER JOIN agents a ON e.agent_id = a.id WHERE e.id = ? AND a.workspace_id = ?')
        .bind(evalId, workspaceId)
        .first();

      if (!evalRecord) {
        return notFoundError('Eval', evalId);
      }

      // Fetch traces with their feedback
      const placeholders = validated.trace_ids.map(() => '?').join(',');
      const traces = await this.db
        .prepare(
          `SELECT t.id, t.steps, t.raw_data,
                  f.rating as human_rating, f.rating_detail as human_notes
           FROM traces t
           LEFT JOIN feedback f ON t.id = f.trace_id AND f.agent_id = ?
           WHERE t.id IN (${placeholders})`
        )
        .bind(evalRecord.agent_id, ...validated.trace_ids)
        .all();

      if (!traces.results || traces.results.length === 0) {
        return validationError('trace_ids', 'No valid traces found');
      }

      // Execute eval code against each trace
      const results: any[] = [];
      let matches = 0;
      let contradictions = 0;
      let totalTime = 0;

      for (const trace of traces.results) {
        const startTime = Date.now();
        let predicted = false;
        let reason = '';
        let error: string | null = null;

        try {
          // Parse trace data
          const traceData = {
            trace_id: trace.id,
            steps: typeof trace.steps === 'string' ? JSON.parse(trace.steps as string) : trace.steps,
            raw_data: typeof trace.raw_data === 'string' ? JSON.parse(trace.raw_data as string) : trace.raw_data
          };

          // Execute eval code using PythonRunner
          const runner = new PythonRunner({
            sandboxBinding: this.sandboxBinding,
            timeout: 5000,
            sandboxId: `playground-${evalId}-${trace.id}`
          });

          // Validate code first
          const validationError = runner.validateCode(validated.code);
          if (validationError) {
            error = validationError;
          } else {
            // Extract function name from code
            const functionNameMatch = validated.code.match(/def\s+(\w+)\s*\(/);
            const functionName = functionNameMatch ? functionNameMatch[1] : 'eval_function';

            // Build execution code (wraps eval code with trace data)
            const traceJson = JSON.stringify(traceData).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const executionCode = `
import json

${validated.code}

trace_data = json.loads("${traceJson}")
result = ${functionName}(trace_data)
result_dict = {"passed": result[0], "reason": result[1]}
print(json.dumps(result_dict))
`;

            // Execute in sandbox
            const execution = await runner.execute(executionCode);

            if (!execution.success) {
              error = execution.error || 'Execution failed';
            } else {
              // Parse result from stdout
              const output = execution.output || '';
              const resultMatch = output.match(/\{"passed":\s*(true|false),\s*"reason":\s*"([^"]*)"\}/);

              if (resultMatch) {
                predicted = resultMatch[1] === 'true';
                reason = resultMatch[2];
              } else {
                error = `Could not parse eval result. Output: ${output}`;
              }
            }
          }
        } catch (e: any) {
          error = e.message || 'Execution error';
        }

        const executionTime = Date.now() - startTime;
        totalTime += executionTime;

        // Determine if this is a match or contradiction
        const humanRating = trace.human_rating as string | null;
        let isMatch: boolean | null = null;
        let isContradiction = false;

        if (humanRating && humanRating !== 'neutral') {
          const expectedPass = humanRating === 'positive';
          isMatch = predicted === expectedPass;
          isContradiction = !isMatch;
          if (isMatch) matches++;
          if (isContradiction) contradictions++;
        }

        results.push({
          trace_id: trace.id,
          human_feedback: humanRating || null,
          predicted,
          reason,
          is_match: isMatch,
          is_contradiction: isContradiction,
          execution_time_ms: executionTime,
          error
        });
      }

      return new Response(JSON.stringify({
        results,
        summary: {
          total: results.length,
          matches,
          contradictions,
          avg_time_ms: Math.round(totalTime / results.length)
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return handleError(e);
    }
  }
}
