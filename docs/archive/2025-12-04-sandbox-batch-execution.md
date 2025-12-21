# Sandbox Batch Execution Optimization Plan

## Problem Statement

Current sandbox execution is too slow:
- **Current**: ~2.5-3s per trace (sandbox startup + file write + exec + destroy)
- **10 traces**: ~25-30 seconds
- **Root cause**: New sandbox created and destroyed for each trace

## Proposed Solution

**Batch execution**: Pass all traces to a single sandbox, loop inside Python.

```
CURRENT (Sequential, N sandboxes):
┌─────────┐   ┌─────────┐   ┌─────────┐
│Sandbox 1│ → │Sandbox 2│ → │Sandbox 3│ → ... (N times)
│ Trace 1 │   │ Trace 2 │   │ Trace 3 │
└─────────┘   └─────────┘   └─────────┘
Total time: N × 3s = 30s for 10 traces

PROPOSED (Batch, 1 sandbox):
┌─────────────────────────────────────┐
│           Single Sandbox            │
│  ┌─────────────────────────────┐    │
│  │ Python loop over all traces│    │
│  │   - Trace 1 → Result 1     │    │
│  │   - Trace 2 → Result 2     │    │
│  │   - Trace N → Result N     │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
Total time: 3s + (N × 50ms) = ~3.5s for 10 traces
```

## Implementation Design

### 1. New Method: `PythonRunner.executeBatch()`

```typescript
interface BatchExecutionResult {
  results: Array<{
    trace_id: string;
    success: boolean;
    passed?: boolean;
    reason?: string;
    error?: string;
    execution_time_ms: number;
  }>;
  total_time_ms: number;
}

async executeBatch(
  evalCode: string,           // The eval function code
  functionName: string,       // Name of the eval function (e.g., "eval_test")
  traces: Array<{             // All traces to evaluate
    trace_id: string;
    data: object;
  }>
): Promise<BatchExecutionResult>
```

### 2. Batch Execution Script Template

Instead of embedding one trace, embed ALL traces as a JSON array:

```python
import json
import time

# User's eval function
${evalCode}

# All traces as JSON array
traces_json = '''${JSON.stringify(traces)}'''
traces = json.loads(traces_json)

# Results array
results = []

# Loop inside Python - single sandbox, multiple traces
for trace_data in traces:
    trace_id = trace_data.get('trace_id', '')
    start_time = time.time()
    try:
        # Call user's eval function
        passed, reason = ${functionName}(trace_data.get('data', {}))
        execution_time_ms = int((time.time() - start_time) * 1000)
        results.append({
            'trace_id': trace_id,
            'success': True,
            'passed': bool(passed),
            'reason': str(reason),
            'execution_time_ms': execution_time_ms
        })
    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        results.append({
            'trace_id': trace_id,
            'success': False,
            'error': str(e),
            'execution_time_ms': execution_time_ms
        })

# Output all results as single JSON object
print(json.dumps({'results': results}))
```

### 3. Changes to `playgroundRun()`

```typescript
// BEFORE: Loop in TypeScript, one sandbox per trace
for (const trace of traces.results) {
  const runner = new PythonRunner({ sandboxId: `playground-${trace.id}` });
  const result = await runner.execute(code);
  // ... process result
}

// AFTER: Single call, batch all traces
const runner = new PythonRunner({
  sandboxBinding: this.sandboxBinding,
  timeout: 30000,  // Longer timeout for batch
  sandboxId: `playground-batch-${evalId}`
});

const batchResult = await runner.executeBatch(
  validated.code,
  functionName,
  traces.results.map(t => ({
    trace_id: t.id,
    data: {
      trace_id: t.id,
      steps: JSON.parse(t.steps),
      raw_data: JSON.parse(t.raw_data)
    }
  }))
);

// Process batch results
const results = batchResult.results.map(r => ({
  trace_id: r.trace_id,
  predicted: r.passed ?? false,
  reason: r.reason ?? '',
  error: r.error ?? null,
  execution_time_ms: r.execution_time_ms,
  // ... other fields
}));
```

### 4. Timeout Strategy

| Scenario | Timeout |
|----------|---------|
| Single trace (current) | 5s |
| Batch ≤10 traces | 15s |
| Batch ≤50 traces | 30s |
| Batch >50 traces | 60s |

Formula: `baseTimeout + (numTraces * 500ms)`

### 5. Memory Considerations

- **Max traces per batch**: 100 (to avoid memory issues)
- **Max trace data size**: 1MB per trace (JSON.stringify check)
- **Total batch payload**: <50MB

If batch exceeds limits, split into multiple sandbox calls.

## Files to Modify

### 1. `src/sandbox/python-runner.ts`

Add new method:

```typescript
async executeBatch(
  evalCode: string,
  functionName: string,
  traces: Array<{ trace_id: string; data: object }>
): Promise<BatchExecutionResult> {
  // 1. Validate code (same as execute)
  const validationError = this.validateCode(evalCode);
  if (validationError) {
    return {
      results: traces.map(t => ({
        trace_id: t.trace_id,
        success: false,
        error: validationError,
        execution_time_ms: 0
      })),
      total_time_ms: 0
    };
  }

  // 2. Build batch execution script
  const batchScript = this.buildBatchScript(evalCode, functionName, traces);

  // 3. Calculate dynamic timeout
  const timeout = Math.min(60000, 5000 + traces.length * 500);

  // 4. Execute in single sandbox
  const startTime = Date.now();
  const execution = await this.executeRaw(batchScript, timeout);
  const totalTime = Date.now() - startTime;

  // 5. Parse batch results
  if (!execution.success) {
    return {
      results: traces.map(t => ({
        trace_id: t.trace_id,
        success: false,
        error: execution.error,
        execution_time_ms: 0
      })),
      total_time_ms: totalTime
    };
  }

  try {
    const parsed = JSON.parse(execution.output || '{}');
    return {
      results: parsed.results || [],
      total_time_ms: totalTime
    };
  } catch {
    return {
      results: traces.map(t => ({
        trace_id: t.trace_id,
        success: false,
        error: 'Failed to parse batch results',
        execution_time_ms: 0
      })),
      total_time_ms: totalTime
    };
  }
}
```

### 2. `src/api/evals.ts` - `playgroundRun()`

Replace sequential loop with batch call.

### 3. `src/jobs/eval-execution-job.ts`

Update `executeOnTraces()` to use batch execution.

### 4. `src/eval-generator/tester.ts`

Update `test()` to use batch execution.

## Migration Strategy

1. **Add `executeBatch()` method** - Backwards compatible, existing code unchanged
2. **Update `playgroundRun()`** - Primary use case, immediate benefit
3. **Update `EvalExecutionJob`** - Job-based execution
4. **Update `EvalTester`** - Testing/generation flow
5. **Deprecate per-trace sandbox** - Once batch is stable

## Expected Performance Improvement

| Traces | Current | Proposed | Improvement |
|--------|---------|----------|-------------|
| 1 | 3s | 3s | 0x |
| 5 | 15s | 4s | 3.75x |
| 10 | 30s | 5s | 6x |
| 50 | 150s | 15s | 10x |
| 100 | 300s | 30s | 10x |

## Error Handling

1. **Partial failures**: Individual trace errors don't fail entire batch
2. **Timeout**: Returns partial results for completed traces
3. **Memory overflow**: Pre-check payload size, split if needed
4. **Parse errors**: Return error for unparseable trace data

## Testing Plan

1. **Unit tests** for `executeBatch()`
2. **Integration tests** with various batch sizes
3. **Performance benchmarks** comparing old vs new
4. **Edge cases**: Empty batch, single trace, malformed data

## Rollback Plan

If batch execution causes issues:
1. Feature flag: `USE_BATCH_EXECUTION=false`
2. Falls back to sequential execution
3. Monitor error rates in Cloudflare logs

## Implementation Order

1. [ ] Add `BatchExecutionResult` types to `src/sandbox/python-runner.ts`
2. [ ] Implement `buildBatchScript()` helper
3. [ ] Implement `executeBatch()` method
4. [ ] Add unit tests for batch execution
5. [ ] Update `playgroundRun()` to use batch
6. [ ] Test on staging with various batch sizes
7. [ ] Update `EvalExecutionJob` and `EvalTester`
8. [ ] Update documentation
