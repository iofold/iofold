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
import { createDb, type Database } from '../db/client';
import { eq, and, desc, sql, lt, inArray } from 'drizzle-orm';
import { agents, evals, feedback, traces } from '../db/schema';

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

      const drizzle = createDb(this.db);

      // Check if agent exists and belongs to workspace
      const agent = await drizzle
        .select({ id: agents.id })
        .from(agents)
        .where(
          and(
            eq(agents.id, agentId),
            eq(agents.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (agent.length === 0) {
        return notFoundError('Agent', agentId);
      }

      // Check if we have sufficient examples
      const feedbackCount = await drizzle
        .select({
          positiveCount: sql<number>`SUM(CASE WHEN ${feedback.rating} = 'positive' THEN 1 ELSE 0 END)`,
          negativeCount: sql<number>`SUM(CASE WHEN ${feedback.rating} = 'negative' THEN 1 ELSE 0 END)`,
        })
        .from(feedback)
        .where(eq(feedback.agentId, agentId));

      const positiveCount = feedbackCount[0]?.positiveCount || 0;
      const negativeCount = feedbackCount[0]?.negativeCount || 0;

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

      const drizzle = createDb(this.db);

      // Check if agent exists and belongs to workspace (if workspace provided)
      const conditions = [eq(agents.id, validated.agent_id)];
      if (workspaceId) {
        conditions.push(eq(agents.workspaceId, workspaceId));
      }

      const agent = await drizzle
        .select({ id: agents.id })
        .from(agents)
        .where(and(...conditions))
        .limit(1);

      if (agent.length === 0) {
        return notFoundError('Agent', validated.agent_id);
      }

      // Get next version number for this agent
      const versionResult = await drizzle
        .select({ nextVersion: sql<number>`COALESCE(MAX(${evals.version}), 0) + 1` })
        .from(evals)
        .where(eq(evals.agentId, validated.agent_id));
      const version = versionResult[0]?.nextVersion || 1;

      const evalId = `eval_${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      await drizzle.insert(evals).values({
        id: evalId,
        agentId: validated.agent_id,
        version,
        name: validated.name,
        description: validated.description || null,
        code: validated.code,
        modelUsed: validated.model_used,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      });

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

      const drizzle = createDb(this.db);

      // Build conditions array
      const conditions: any[] = [eq(agents.workspaceId, workspaceId)];

      if (validated.agent_id) {
        conditions.push(eq(evals.agentId, validated.agent_id));
      }

      if (validated.cursor) {
        conditions.push(lt(evals.createdAt, validated.cursor));
      }

      // Join with agents table to filter by workspace
      const results = await drizzle
        .select({
          id: evals.id,
          name: evals.name,
          description: evals.description,
          agentId: evals.agentId,
          accuracy: evals.accuracy,
          cohenKappa: evals.cohenKappa,
          f1Score: evals.f1Score,
          precision: evals.precision,
          recall: evals.recall,
          executionCount: evals.executionCount,
          contradictionCount: evals.contradictionCount,
          createdAt: evals.createdAt,
          updatedAt: evals.updatedAt,
        })
        .from(evals)
        .innerJoin(agents, eq(evals.agentId, agents.id))
        .where(and(...conditions))
        .orderBy(desc(evals.createdAt))
        .limit(validated.limit! + 1); // Fetch one extra to check has_more

      const hasMore = results.length > validated.limit!;
      const evalsList = results.slice(0, validated.limit!);

      const evalSummaries: EvalSummary[] = evalsList.map(record => ({
        id: record.id,
        name: record.name,
        description: record.description,
        agent_id: record.agentId,
        accuracy: record.accuracy!,
        cohen_kappa: record.cohenKappa,
        f1_score: record.f1Score,
        precision: record.precision,
        recall: record.recall,
        execution_count: record.executionCount!,
        contradiction_count: record.contradictionCount!,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      }));

      return new Response(
        JSON.stringify({
          evals: evalSummaries,
          next_cursor: hasMore ? evalsList[evalsList.length - 1].createdAt : null,
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
      const drizzle = createDb(this.db);

      // Build conditions
      const conditions: any[] = [eq(evals.id, evalId)];

      let record;
      if (workspaceId) {
        // Join with agents to verify workspace ownership
        const result = await drizzle
          .select({
            id: evals.id,
            name: evals.name,
            description: evals.description,
            agentId: evals.agentId,
            code: evals.code,
            modelUsed: evals.modelUsed,
            accuracy: evals.accuracy,
            cohenKappa: evals.cohenKappa,
            f1Score: evals.f1Score,
            precision: evals.precision,
            recall: evals.recall,
            testResults: evals.testResults,
            executionCount: evals.executionCount,
            contradictionCount: evals.contradictionCount,
            createdAt: evals.createdAt,
            updatedAt: evals.updatedAt,
          })
          .from(evals)
          .innerJoin(agents, eq(evals.agentId, agents.id))
          .where(
            and(
              eq(evals.id, evalId),
              eq(agents.workspaceId, workspaceId)
            )
          )
          .limit(1);

        if (result.length === 0) {
          return notFoundError('Eval', evalId);
        }
        record = result[0];
      } else {
        const result = await drizzle
          .select()
          .from(evals)
          .where(eq(evals.id, evalId))
          .limit(1);

        if (result.length === 0) {
          return notFoundError('Eval', evalId);
        }
        record = result[0];
      }

      const eval_: Eval = {
        id: record.id,
        name: record.name,
        description: record.description,
        agent_id: record.agentId,
        code: record.code,
        model_used: record.modelUsed || 'unknown',
        accuracy: record.accuracy!,
        cohen_kappa: record.cohenKappa,
        f1_score: record.f1Score,
        precision: record.precision,
        recall: record.recall,
        test_results: record.testResults as any,
        execution_count: record.executionCount!,
        contradiction_count: record.contradictionCount!,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
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

      const drizzle = createDb(this.db);

      // Check if eval exists and belongs to workspace
      let existing;
      if (workspaceId) {
        const result = await drizzle
          .select({ id: evals.id })
          .from(evals)
          .innerJoin(agents, eq(evals.agentId, agents.id))
          .where(
            and(
              eq(evals.id, evalId),
              eq(agents.workspaceId, workspaceId)
            )
          )
          .limit(1);

        if (result.length === 0) {
          return notFoundError('Eval', evalId);
        }
        existing = result[0];
      } else {
        const result = await drizzle
          .select({ id: evals.id })
          .from(evals)
          .where(eq(evals.id, evalId))
          .limit(1);

        if (result.length === 0) {
          return notFoundError('Eval', evalId);
        }
        existing = result[0];
      }

      // Build update object
      const updateValues: any = {
        updatedAt: new Date().toISOString(),
      };

      if (validated.name !== undefined) {
        updateValues.name = validated.name;
      }

      if (validated.description !== undefined) {
        updateValues.description = validated.description;
      }

      if (validated.code !== undefined) {
        updateValues.code = validated.code;
        // Invalidate accuracy when code is modified
        updateValues.accuracy = null;
        updateValues.testResults = null;
      }

      await drizzle
        .update(evals)
        .set(updateValues)
        .where(eq(evals.id, evalId));

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

      const drizzle = createDb(this.db);

      // Check if eval exists and belongs to workspace
      const eval_ = await drizzle
        .select({
          id: evals.id,
          agentId: evals.agentId,
        })
        .from(evals)
        .innerJoin(agents, eq(evals.agentId, agents.id))
        .where(
          and(
            eq(evals.id, evalId),
            eq(agents.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (eval_.length === 0) {
        return notFoundError('Eval', evalId);
      }

      // Estimate count
      let estimatedCount = 0;
      if (validated.trace_ids && validated.trace_ids.length > 0) {
        estimatedCount = validated.trace_ids.length;
      } else {
        // Count traces for agent
        const countResult = await drizzle
          .select({ count: sql<number>`COUNT(DISTINCT ${feedback.traceId})` })
          .from(feedback)
          .where(eq(feedback.agentId, eval_[0].agentId));
        estimatedCount = countResult[0]?.count || 0;
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
      const drizzle = createDb(this.db);

      // Check if eval exists and belongs to workspace
      let existing;
      if (workspaceId) {
        const result = await drizzle
          .select({ id: evals.id })
          .from(evals)
          .innerJoin(agents, eq(evals.agentId, agents.id))
          .where(
            and(
              eq(evals.id, evalId),
              eq(agents.workspaceId, workspaceId)
            )
          )
          .limit(1);

        if (result.length === 0) {
          return notFoundError('Eval', evalId);
        }
        existing = result[0];
      } else {
        const result = await drizzle
          .select({ id: evals.id })
          .from(evals)
          .where(eq(evals.id, evalId))
          .limit(1);

        if (result.length === 0) {
          return notFoundError('Eval', evalId);
        }
        existing = result[0];
      }

      // Delete eval (cascades to eval_executions)
      await drizzle
        .delete(evals)
        .where(eq(evals.id, evalId));

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

      const drizzle = createDb(this.db);

      // Check if eval exists, belongs to workspace, and get agent_id
      const evalRecord = await drizzle
        .select({
          id: evals.id,
          agentId: evals.agentId,
        })
        .from(evals)
        .innerJoin(agents, eq(evals.agentId, agents.id))
        .where(
          and(
            eq(evals.id, evalId),
            eq(agents.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (evalRecord.length === 0) {
        return notFoundError('Eval', evalId);
      }

      // Fetch traces with their feedback
      const traceResults = await drizzle
        .select({
          id: traces.id,
          steps: traces.steps,
          rawData: traces.rawData,
          humanRating: feedback.rating,
          humanNotes: feedback.ratingDetail,
        })
        .from(traces)
        .leftJoin(
          feedback,
          and(
            eq(traces.id, feedback.traceId),
            eq(feedback.agentId, evalRecord[0].agentId)
          )
        )
        .where(inArray(traces.id, validated.trace_ids));

      if (!traceResults || traceResults.length === 0) {
        return validationError('trace_ids', 'No valid traces found');
      }

      // Execute eval code against each trace
      const results: any[] = [];
      let matches = 0;
      let contradictions = 0;
      let totalTime = 0;

      for (const trace of traceResults) {
        const startTime = Date.now();
        let predicted = false;
        let reason = '';
        let error: string | null = null;

        try {
          // Parse trace data
          const traceData = {
            trace_id: trace.id,
            steps: typeof trace.steps === 'string' ? JSON.parse(trace.steps as string) : trace.steps,
            raw_data: typeof trace.rawData === 'string' ? JSON.parse(trace.rawData as string) : trace.rawData
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
        const humanRating = trace.humanRating as string | null;
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
