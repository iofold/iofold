# iofold.com TypeScript SDK

Type-safe, feature-rich TypeScript client for the iofold.com API.

## Features

- **Type-safe**: Full TypeScript types for all API requests and responses
- **Auto-pagination**: Async iteration through paginated results
- **SSE Streaming**: Real-time updates with auto-reconnection
- **Optimistic UI**: Queue-based feedback submission with retry logic
- **Error Handling**: Consistent error handling with retryable detection
- **Browser & Server**: Works in browser, Node.js, and Cloudflare Workers

## Installation

```typescript
import { IofoldClient } from './client/api-client';
```

## Quick Start

```typescript
// Initialize client
const client = new IofoldClient(
  'https://api.iofold.com/v1',  // Base URL
  'your_jwt_token',              // Auth token
  'workspace_abc123'             // Workspace ID
);

// Use API methods
const traces = await client.traces.list({ limit: 50 });
const evalSet = await client.evalSets.create({ name: 'quality-check' });
```

## Usage Examples

### 1. Connect Integration & Import Traces

```typescript
// Connect Langfuse
const integration = await client.integrations.create({
  platform: 'langfuse',
  api_key: 'sk_lf_...',
  name: 'Production'
});

// Import traces (async job)
const importJob = await client.traces.import({
  integration_id: integration.id,
  filters: {
    date_from: '2025-11-01T00:00:00Z',
    limit: 100
  }
});

// Monitor import progress (SSE)
for await (const event of client.jobs.stream(importJob.job_id)) {
  console.log('Status:', event.status);
  console.log('Progress:', event.progress, '%');

  if (event.status === 'completed') {
    console.log('Imported:', event.imported, 'traces');
    break;
  }
}
```

### 2. Create Eval Set & Submit Feedback

```typescript
// Create eval set
const evalSet = await client.evalSets.create({
  name: 'response-quality',
  description: 'Checks if responses are helpful and accurate',
  minimum_examples: 5
});

// List traces for annotation
const tracesList = await client.traces.list({ limit: 50 });

// Submit feedback (basic)
for (const trace of tracesList.traces) {
  await client.feedback.submit({
    trace_id: trace.id,
    eval_set_id: evalSet.id,
    rating: 'positive',
    notes: 'Good response quality'
  });
}

// Or use optimistic queue (recommended for UI)
const feedbackQueue = client.feedback.createQueue((feedback, status) => {
  console.log(`Feedback for ${feedback.trace_id}: ${status}`);
});

// Submit multiple feedbacks optimistically
await feedbackQueue.submit({
  trace_id: 'trace_1',
  eval_set_id: evalSet.id,
  rating: 'positive'
});

await feedbackQueue.submit({
  trace_id: 'trace_2',
  eval_set_id: evalSet.id,
  rating: 'negative'
});

console.log('Pending:', feedbackQueue.getPendingCount());
```

### 3. Generate Eval with Progress Monitoring

```typescript
// Generate eval (async job)
const genJob = await client.evals.generate(evalSet.id, {
  name: 'response_quality_check',
  description: 'Automated response quality evaluation',
  model: 'claude-sonnet-4.5',
  custom_instructions: 'Focus on technical accuracy'
});

// Monitor generation progress
for await (const event of client.jobs.stream(genJob.job_id)) {
  console.log('Status:', event.status);
  console.log('Progress:', event.progress);

  if (event.status === 'completed') {
    console.log('Eval ID:', event.result.eval_id);
    console.log('Accuracy:', event.result.accuracy);
    console.log('Test Results:', event.result.test_results);
    break;
  }

  if (event.status === 'failed') {
    console.error('Generation failed:', event.error);
    break;
  }
}
```

### 4. Execute Eval Against Traces

```typescript
// Execute eval
const execJob = await client.evals.execute('eval_abc123', {
  trace_ids: ['trace_1', 'trace_2', 'trace_3'], // Optional
  force: false // Re-run even if already executed
});

// Monitor execution
for await (const event of client.jobs.stream(execJob.job_id)) {
  if (event.status === 'running') {
    console.log(`Progress: ${event.completed}/${event.total}`);
    console.log(`Avg time: ${event.avg_execution_time_ms}ms`);
  }

  if (event.status === 'completed') {
    console.log(`Completed: ${event.completed}`);
    console.log(`Failed: ${event.failed}`);
    if (event.errors && event.errors.length > 0) {
      console.log('Errors:', event.errors);
    }
    break;
  }
}
```

### 5. Explore Comparison Matrix

```typescript
// Get matrix with multiple evals
const matrix = await client.matrix.get('set_abc123', {
  eval_ids: ['eval_1', 'eval_2', 'eval_3'],
  filter: 'contradictions_only', // Show only contradictions
  limit: 50
});

console.log('Total traces:', matrix.stats.total_traces);
console.log('With feedback:', matrix.stats.traces_with_feedback);

// Iterate through contradictions
for (const row of matrix.rows) {
  console.log('\nTrace:', row.trace_id);
  console.log('Human rating:', row.human_feedback?.rating);
  console.log('Input:', row.trace_summary.input_preview);

  // Check predictions
  for (const [evalId, prediction] of Object.entries(row.predictions)) {
    if (prediction && prediction.is_contradiction) {
      console.log(`  ⚠️  ${evalId}: predicted ${prediction.result}`);
      console.log(`      Reason: ${prediction.reason}`);
    }
  }
}

// Drill into specific execution
const execution = await client.matrix.getExecution('trace_abc', 'eval_xyz');
console.log('Full execution details:', execution);
console.log('Stdout:', execution.stdout);
console.log('Stderr:', execution.stderr);
```

### 6. Pagination Patterns

```typescript
// Manual pagination (single page)
let cursor: string | undefined;
do {
  const result = await client.traces.list({ cursor, limit: 50 });

  result.traces.forEach(trace => {
    console.log(trace.id, trace.summary.input_preview);
  });

  cursor = result.next_cursor || undefined;
} while (cursor);

// Auto-pagination with async iteration (recommended)
for await (const trace of client.traces.iterate({ eval_set_id: 'set_abc' })) {
  console.log(trace.id);
  // Process trace...
}

// Fetch all into array (use with caution for large datasets)
const allTraces = await client.traces.iterate({ limit: 100 }).toArray();
console.log('Total traces:', allTraces.length);
```

### 7. SSE Real-Time Updates

```typescript
// Stream eval set updates
const stream = client.evalSets.stream('set_abc123');

stream.on('feedback_added', (data) => {
  console.log('New feedback for trace:', data.trace_id);
  console.log('Rating:', data.rating);
  console.log('Updated stats:', data.stats);
});

stream.on('threshold_reached', (data) => {
  console.log('Ready to generate eval!');
  console.log('Minimum examples:', data.minimum_examples);
  console.log('Current count:', data.current_count);
});

stream.on('eval_generated', (data) => {
  console.log('Eval generated:', data.eval_id);
  console.log('Accuracy:', data.accuracy);
});

// Start listening
stream.connect();

// Later: close connection
stream.close();
```

### 8. Error Handling

```typescript
import { IofoldAPIError } from './client/api-client';

try {
  await client.traces.import({
    integration_id: 'int_invalid',
    filters: { limit: 100 }
  });
} catch (error) {
  if (error instanceof IofoldAPIError) {
    console.error('API Error:', error.message);
    console.error('Code:', error.code);
    console.error('Status:', error.status);
    console.error('Request ID:', error.requestId);
    console.error('Details:', error.details);

    // Check if retryable
    if (error.isRetryable()) {
      console.log('Error is retryable (rate limit, network, etc.)');
      // Implement retry logic...
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### 9. Complete Annotation Workflow

```typescript
// 1. Connect platform
const integration = await client.integrations.create({
  platform: 'langfuse',
  api_key: 'sk_lf_...',
  name: 'Production'
});

// 2. Import traces
const importJob = await client.traces.import({
  integration_id: integration.id,
  filters: { date_from: '2025-11-01T00:00:00Z', limit: 100 }
});

// Wait for import
for await (const event of client.jobs.stream(importJob.job_id)) {
  if (event.status === 'completed') break;
}

// 3. Create eval set
const evalSet = await client.evalSets.create({
  name: 'response-quality',
  minimum_examples: 5
});

// 4. Stream eval set updates
const evalSetStream = client.evalSets.stream(evalSet.id);
evalSetStream.on('threshold_reached', async (data) => {
  if (data.ready_to_generate) {
    console.log('Minimum examples reached, generating eval...');

    // 5. Generate eval
    const genJob = await client.evals.generate(evalSet.id, {
      name: 'response_quality_check'
    });

    // Wait for generation
    for await (const event of client.jobs.stream(genJob.job_id)) {
      if (event.status === 'completed') {
        console.log('Eval created:', event.result.eval_id);
        console.log('Accuracy:', event.result.accuracy);
        break;
      }
    }
  }
});
evalSetStream.connect();

// 6. Annotate traces (optimistic UI)
const feedbackQueue = client.feedback.createQueue((feedback, status) => {
  console.log(`Feedback for ${feedback.trace_id}: ${status}`);
});

for await (const trace of client.traces.iterate({ limit: 10 })) {
  await feedbackQueue.submit({
    trace_id: trace.id,
    eval_set_id: evalSet.id,
    rating: 'positive', // User's rating
    notes: 'Good response'
  });
}
```

## API Reference

### Client Initialization

```typescript
new IofoldClient(baseUrl: string, token: string, workspaceId: string)
```

### Integrations API

- `client.integrations.create(request)` - Connect external platform
- `client.integrations.list()` - List all integrations
- `client.integrations.test(id)` - Test connection
- `client.integrations.delete(id)` - Delete integration

### Traces API

- `client.traces.import(request)` - Import traces (async job)
- `client.traces.list(params)` - List traces (paginated)
- `client.traces.iterate(params)` - Auto-paginate traces
- `client.traces.get(id)` - Get trace details
- `client.traces.delete(id)` - Delete trace
- `client.traces.bulkDelete(trace_ids)` - Bulk delete
- `client.traces.getExecutions(trace_id)` - Get eval results for trace

### Eval Sets API

- `client.evalSets.create(request)` - Create eval set
- `client.evalSets.list()` - List eval sets
- `client.evalSets.get(id)` - Get eval set details
- `client.evalSets.update(id, request)` - Update eval set
- `client.evalSets.delete(id)` - Delete eval set
- `client.evalSets.stream(id)` - Stream real-time updates (SSE)

### Feedback API

- `client.feedback.submit(request)` - Submit feedback
- `client.feedback.update(id, request)` - Update feedback
- `client.feedback.delete(id)` - Delete feedback
- `client.feedback.createQueue(onUpdate)` - Create optimistic queue

### Evals API

- `client.evals.generate(eval_set_id, request)` - Generate eval (async job)
- `client.evals.list(params)` - List evals (paginated)
- `client.evals.iterate(params)` - Auto-paginate evals
- `client.evals.get(id)` - Get eval details
- `client.evals.update(id, request)` - Update eval
- `client.evals.execute(eval_id, request)` - Execute eval (async job)
- `client.evals.delete(id)` - Delete eval
- `client.evals.getExecutions(eval_id, params)` - List executions

### Matrix API

- `client.matrix.get(eval_set_id, params)` - Get comparison matrix
- `client.matrix.getExecution(trace_id, eval_id)` - Get specific execution

### Jobs API

- `client.jobs.get(job_id)` - Get job status
- `client.jobs.stream(job_id)` - Stream job progress (async iterator)
- `client.jobs.streamEvents(job_id)` - Stream job progress (event-based)
- `client.jobs.cancel(job_id)` - Cancel job
- `client.jobs.list(params)` - List recent jobs

## Type Exports

All TypeScript types are exported for use in your application:

```typescript
import type {
  Trace,
  TraceSummary,
  ExecutionStep,
  EvalSet,
  Feedback,
  Eval,
  MatrixRow,
  Job,
  Integration,
  // ... and many more
} from './client/api-client';
```

## Error Handling

The SDK throws `IofoldAPIError` for all API errors:

```typescript
class IofoldAPIError extends Error {
  code: string;        // Machine-readable error code
  message: string;     // Human-readable message
  details?: any;       // Additional error context
  requestId: string;   // Request ID for support
  status: number;      // HTTP status code

  isRetryable(): boolean; // Check if error is retryable
}
```

## Advanced Features

### Optimistic Feedback Queue

The `FeedbackQueue` class provides optimistic UI updates with automatic retry:

```typescript
const queue = client.feedback.createQueue((feedback, status) => {
  // Update UI based on status: 'pending' | 'synced' | 'error'
  const el = document.querySelector(`[data-trace="${feedback.trace_id}"]`);
  el?.classList.add(status);
});

// Submit optimistically
await queue.submit({ trace_id: 'trace_1', eval_set_id: 'set_1', rating: 'positive' });

// Check pending count
console.log('Pending:', queue.getPendingCount());
```

### SSE Auto-Reconnection

All SSE connections automatically reconnect on disconnect with exponential backoff:

- Max reconnection attempts: 5
- Initial delay: 1 second
- Exponential backoff: 2x multiplier
- Event buffer: 5 minutes (resume on reconnect)

### Pagination Iterator

The `PaginatedIterator` class provides async iteration over paginated results:

```typescript
// Iterate one by one
for await (const trace of client.traces.iterate()) {
  console.log(trace.id);
}

// Or fetch all (use with caution)
const allTraces = await client.traces.iterate().toArray();
```

## Platform Compatibility

- **Browser**: ✅ Modern browsers with `fetch` and `EventSource`
- **Node.js**: ✅ v18+ (native `fetch`)
- **Cloudflare Workers**: ✅ Works out of the box
- **Deno**: ✅ Compatible

## Notes

- All API calls return Promises
- Timestamps are ISO 8601 strings
- Cursors are opaque strings (don't parse or modify)
- SSE connections should be closed when no longer needed
- Rate limits: 1000 req/min per workspace
