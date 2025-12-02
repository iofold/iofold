/**
 * Step Recorder for Agents Playground
 * Records tool execution steps to the database
 */

/**
 * Step information to record
 */
export interface StepRecord {
  stepIndex: number;
  stepType: 'llm_call' | 'tool_call' | 'tool_result';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;
  latencyMs?: number;
  tokensInput?: number;
  tokensOutput?: number;
  input?: string;
  output?: string;
}

/**
 * Record a tool execution step to the database
 *
 * Inserts a step record into the playground_steps table with all execution details.
 * Step IDs are automatically generated as `step_<uuid>`.
 *
 * @param db - D1 database instance
 * @param sessionId - Playground session ID
 * @param traceId - Associated trace ID
 * @param step - Step information to record
 * @returns Step ID that was inserted
 *
 * @example
 * ```typescript
 * const stepId = await recordToolStep(env.DB, 'session_123', 'trace_456', {
 *   stepIndex: 0,
 *   stepType: 'tool_call',
 *   toolName: 'execute_python',
 *   toolArgs: { code: 'print("hello")' },
 *   toolResult: 'hello',
 *   latencyMs: 150
 * });
 * ```
 */
export async function recordToolStep(
  db: D1Database,
  sessionId: string,
  traceId: string,
  step: StepRecord
): Promise<string> {
  // Generate step ID
  const stepId = `step_${crypto.randomUUID()}`;

  // Serialize JSON fields
  const inputJson = step.input ? JSON.stringify(step.input) : null;
  const outputJson = step.output ? JSON.stringify(step.output) : null;
  const toolArgsJson = step.toolArgs ? JSON.stringify(step.toolArgs) : null;
  const toolResultJson = step.toolResult ? JSON.stringify(step.toolResult) : null;

  // Insert into database
  await db
    .prepare(
      `INSERT INTO playground_steps (
        id,
        session_id,
        trace_id,
        step_index,
        step_type,
        input,
        output,
        tool_name,
        tool_args,
        tool_result,
        tool_error,
        latency_ms,
        tokens_input,
        tokens_output
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      stepId,
      sessionId,
      traceId,
      step.stepIndex,
      step.stepType,
      inputJson,
      outputJson,
      step.toolName || null,
      toolArgsJson,
      toolResultJson,
      step.toolError || null,
      step.latencyMs || null,
      step.tokensInput || null,
      step.tokensOutput || null
    )
    .run();

  return stepId;
}
